'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface VariavelOpt { id: string; nome: string; valores: { id: string; valor: string }[] }
interface Instancia { id?: string; valores: Record<string, string>; valor_min: string; valor_max: string }

function CriarPadraoInner() {
  const router = useRouter()
  const params = useSearchParams()
  const padraoId = params.get('id')
  const isEdicao = !!padraoId
  const { unidadeAtiva } = useSession()

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [subgrupoId, setSubgrupoId] = useState('')
  const [grupos, setGrupos] = useState<{ id: string; nome: string }[]>([])
  const [subgrupos, setSubgrupos] = useState<{ id: string; nome: string }[]>([])

  const [todasVariaveis, setTodasVariaveis] = useState<VariavelOpt[]>([])
  const [variaveisSelecionadas, setVariaveisSelecionadas] = useState<string[]>([])
  const [instancias, setInstancias] = useState<Instancia[]>([])

  const [carregando, setCarregando] = useState(isEdicao)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const variaveisAtivas = todasVariaveis.filter(v => variaveisSelecionadas.includes(v.id))

  // Carrega grupos da unidade
  useEffect(() => {
    if (!unidadeAtiva?.id) return
    const supabase = createClient()
    supabase.from('grupos').select('id, nome').eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setGrupos(data) })
    supabase.from('variaveis').select('id, nome, variavel_valores(id, valor, ordem)')
      .eq('unidade_id', unidadeAtiva.id).eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setTodasVariaveis(data.map((v: any) => ({
        id: v.id, nome: v.nome, valores: (v.variavel_valores ?? []).sort((a: any, b: any) => a.ordem - b.ordem),
      }))) })
  }, [unidadeAtiva?.id])

  // Carrega subgrupos do grupo escolhido
  useEffect(() => {
    if (!grupoId) { setSubgrupos([]); return }
    createClient().from('subgrupos').select('id, nome').eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })
  }, [grupoId])

  // Carrega padrão existente (edição)
  useEffect(() => {
    if (!padraoId) return
    const supabase = createClient()
    async function carregar() {
      const { data: p } = await supabase.from('padroes')
        .select('id, nome, descricao, grupo_id, subgrupo_id').eq('id', padraoId).single()
      if (!p) { setCarregando(false); return }
      setNome(p.nome); setDescricao(p.descricao ?? '')
      setGrupoId(p.grupo_id ?? ''); setSubgrupoId(p.subgrupo_id ?? '')

      const { data: pv } = await supabase.from('padrao_variaveis')
        .select('variavel_id, ordem').eq('padrao_id', padraoId).order('ordem')
      const varIds = (pv ?? []).map(x => x.variavel_id)
      setVariaveisSelecionadas(varIds)

      const { data: insts } = await supabase.from('padrao_instancias')
        .select('id, valor_min, valor_max, padrao_instancia_valores(variavel_id, valor_id)')
        .eq('padrao_id', padraoId)
      if (insts) {
        setInstancias(insts.map((i: any) => ({
          id: i.id,
          valor_min: i.valor_min === null ? '' : String(i.valor_min),
          valor_max: i.valor_max === null ? '' : String(i.valor_max),
          valores: Object.fromEntries((i.padrao_instancia_valores ?? []).map((v: any) => [v.variavel_id, v.valor_id])),
        })))
      }
      setCarregando(false)
    }
    carregar()
  }, [padraoId])

  function toggleVariavel(id: string) {
    setVariaveisSelecionadas(sel => {
      const novo = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
      // remove combinações de instâncias para variável removida
      setInstancias(insts => insts.map(inst => {
        const valores = { ...inst.valores }
        if (!novo.includes(id)) delete valores[id]
        return { ...inst, valores }
      }))
      return novo
    })
  }

  function addInstancia() {
    setInstancias(i => [...i, { valores: {}, valor_min: '', valor_max: '' }])
  }
  function removerInstancia(idx: number) {
    setInstancias(i => i.filter((_, n) => n !== idx))
  }
  function setInstanciaValor(idx: number, variavelId: string, valorId: string) {
    setInstancias(i => i.map((inst, n) => n === idx ? { ...inst, valores: { ...inst.valores, [variavelId]: valorId } } : inst))
  }
  function setInstanciaCampo(idx: number, campo: 'valor_min' | 'valor_max', val: string) {
    setInstancias(i => i.map((inst, n) => n === idx ? { ...inst, [campo]: val } : inst))
  }

  async function salvar() {
    setErro('')
    const nomeOk = nome.trim()
    if (!nomeOk) { setErro('Informe o nome do padrão.'); return }
    if (variaveisSelecionadas.length === 0) { setErro('Selecione ao menos uma variável que compõe este padrão.'); return }

    // valida instâncias: combinação completa + faixa numérica válida
    for (const [idx, inst] of instancias.entries()) {
      const completo = variaveisSelecionadas.every(vid => inst.valores[vid])
      if (!completo) { setErro(`Instância #${idx + 1}: escolha um valor para cada variável.`); return }
      const minOk = inst.valor_min.trim() === '' || !isNaN(Number(inst.valor_min))
      const maxOk = inst.valor_max.trim() === '' || !isNaN(Number(inst.valor_max))
      if (!minOk || !maxOk) { setErro(`Instância #${idx + 1}: valores mínimo/máximo devem ser numéricos.`); return }
      if (inst.valor_min.trim() === '' && inst.valor_max.trim() === '') {
        setErro(`Instância #${idx + 1}: informe ao menos o mínimo ou o máximo.`); return
      }
      if (inst.valor_min.trim() !== '' && inst.valor_max.trim() !== '' && Number(inst.valor_min) > Number(inst.valor_max)) {
        setErro(`Instância #${idx + 1}: o mínimo não pode ser maior que o máximo.`); return
      }
    }
    // checa combinações duplicadas
    const chaves = instancias.map(inst => variaveisSelecionadas.map(v => inst.valores[v]).join('|'))
    if (new Set(chaves).size !== chaves.length) { setErro('Há instâncias com a mesma combinação de variáveis.'); return }

    setSalvando(true)
    const supabase = createClient()
    const payload = {
      nome: nomeOk,
      descricao: descricao.trim() || null,
      grupo_id: grupoId || null,
      subgrupo_id: subgrupoId || null,
      unidade_id: unidadeAtiva?.id ?? null,
    }

    let id = padraoId
    if (isEdicao) {
      const { error } = await supabase.from('padroes').update(payload).eq('id', padraoId)
      if (error) { setErro(`Erro ao salvar: ${error.message}`); setSalvando(false); return }
      await supabase.from('padrao_variaveis').delete().eq('padrao_id', padraoId)
      // remove instâncias antigas e recria (mais simples e seguro que diff)
      await supabase.from('padrao_instancias').delete().eq('padrao_id', padraoId)
    } else {
      const { data: novo, error } = await supabase.from('padroes').insert(payload).select('id').single()
      if (error || !novo) { setErro(`Erro ao criar: ${error?.message ?? ''}`); setSalvando(false); return }
      id = novo.id
    }

    await supabase.from('padrao_variaveis').insert(
      variaveisSelecionadas.map((variavel_id, ordem) => ({ padrao_id: id, variavel_id, ordem }))
    )

    for (const inst of instancias) {
      const { data: novaInst, error } = await supabase.from('padrao_instancias').insert({
        padrao_id: id,
        valor_min: inst.valor_min.trim() === '' ? null : Number(inst.valor_min),
        valor_max: inst.valor_max.trim() === '' ? null : Number(inst.valor_max),
      }).select('id').single()
      if (error || !novaInst) continue
      await supabase.from('padrao_instancia_valores').insert(
        variaveisSelecionadas.map(variavel_id => ({
          instancia_id: novaInst.id, variavel_id, valor_id: inst.valores[variavel_id],
        }))
      )
    }

    setSalvando(false)
    router.push('/gestao/padrao/padroes')
  }

  if (carregando) return <div className="p-6"><p className="text-sm text-gray-400">Carregando...</p></div>

  return (
    <div className="p-6 max-w-3xl mx-auto pb-24">
      <button onClick={() => router.push('/gestao/padrao/padroes')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} />Voltar para padrões
      </button>

      <h1 className="text-xl font-semibold text-gray-900 mb-1">{isEdicao ? 'Editar padrão' : 'Novo padrão'}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Um padrão valida uma resposta numérica com base na combinação de variáveis escolhida na execução.
      </p>

      {/* Dados básicos */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do padrão</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Densidade"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrição</label>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Grupo</label>
            <select value={grupoId} onChange={e => { setGrupoId(e.target.value); setSubgrupoId('') }}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Selecione...</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subgrupo</label>
            <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)} disabled={!grupoId}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-50">
              <option value="">Selecione...</option>
              {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Variáveis que compõem o padrão */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Variáveis do padrão</h2>
        <p className="text-xs text-gray-400 mb-3">Escolha quais variáveis compõem a combinação que define o valor esperado</p>
        {todasVariaveis.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma variável cadastrada — crie em "Variáveis" antes de continuar.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {todasVariaveis.map(v => (
              <button key={v.id} onClick={() => toggleVariavel(v.id)}
                className={`px-3.5 py-2 rounded-full text-sm border transition-colors ${
                  variaveisSelecionadas.includes(v.id)
                    ? 'bg-orange-50 border-orange-300 text-orange-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {v.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Instâncias */}
      {variaveisSelecionadas.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-900">Instâncias (combinações)</h2>
            <Button size="sm" variant="outline" onClick={addInstancia}><Plus size={14} />Adicionar instância</Button>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Cada instância é uma combinação específica de valores das variáveis + o valor numérico esperado para ela
          </p>

          {instancias.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhuma instância cadastrada ainda</p>
          ) : (
            <div className="space-y-3">
              {instancias.map((inst, idx) => (
                <div key={idx} className="border border-gray-100 rounded-xl p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 grid grid-cols-2 gap-2.5">
                      {variaveisAtivas.map(v => (
                        <div key={v.id}>
                          <label className="block text-xs text-gray-500 mb-1">{v.nome}</label>
                          <select value={inst.valores[v.id] ?? ''} onChange={e => setInstanciaValor(idx, v.id, e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                            <option value="">Selecione...</option>
                            {v.valores.map(val => <option key={val.id} value={val.id}>{val.valor}</option>)}
                          </select>
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Valor mínimo</label>
                        <input value={inst.valor_min} onChange={e => setInstanciaCampo(idx, 'valor_min', e.target.value)}
                          inputMode="decimal" placeholder="Ex: 1.40"
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Valor máximo</label>
                        <input value={inst.valor_max} onChange={e => setInstanciaCampo(idx, 'valor_max', e.target.value)}
                          inputMode="decimal" placeholder="Ex: 1.50"
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
                      </div>
                    </div>
                    <button onClick={() => removerInstancia(idx)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 mt-5">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {erro && <p className="text-sm text-red-500 mt-4">{erro}</p>}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3.5 flex justify-end gap-3">
        <Button variant="ghost" onClick={() => router.push('/gestao/padrao/padroes')}>Cancelar</Button>
        <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar padrão'}</Button>
      </div>
    </div>
  )
}

export default function CriarPadraoPage() {
  return (
    <Suspense fallback={<div className="p-6"><p className="text-sm text-gray-400">Carregando...</p></div>}>
      <CriarPadraoInner />
    </Suspense>
  )
}
