'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Plus, Trash2, Save, Send, Loader2, Check, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/apiClient'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast, useConfirm } from '@/components/ui/feedback'

interface Item {
  id?: string
  _key: string
  titulo: string
  aceita_observacao: boolean
  aceita_evidencia: boolean
  exige_checkin: boolean
}

function novoKey() { return Math.random().toString(36).slice(2) }

export default function MontadorTarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const toast = useToast()
  const confirm = useConfirm()

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [status, setStatus] = useState<'rascunho' | 'publicada' | 'encerrada'>('rascunho')
  const [dataLimite, setDataLimite] = useState('')
  const [maxRespostas, setMaxRespostas] = useState('')
  const [edicaoHoras, setEdicaoHoras] = useState('')
  const [notificar, setNotificar] = useState(false)

  const [grupos, setGrupos] = useState<{ id: string; nome: string }[]>([])
  const [subgrupos, setSubgrupos] = useState<{ id: string; nome: string; grupo_id: string }[]>([])
  const [gruposSel, setGruposSel] = useState<string[]>([])
  const [subgruposSel, setSubgruposSel] = useState<string[]>([])
  const [itens, setItens] = useState<Item[]>([])

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const bloqueado = status === 'encerrada'

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: lista } = await supabase.from('tarefa_listas').select('*').eq('id', id).single()
      if (lista) {
        setTitulo(lista.titulo)
        setDescricao(lista.descricao ?? '')
        setStatus(lista.status)
        setDataLimite(lista.abertura_data_limite ? lista.abertura_data_limite.slice(0, 16) : '')
        setMaxRespostas(lista.abertura_max_respostas != null ? String(lista.abertura_max_respostas) : '')
        setEdicaoHoras(lista.edicao_janela_horas != null ? String(lista.edicao_janela_horas) : '')
        setNotificar(lista.notificar_whatsapp)
      }

      if (unidadeAtiva?.id) {
        const { data: gs } = await supabase.from('grupos').select('id, nome').eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
        if (gs) setGrupos(gs)
      }

      const [{ data: lg }, { data: ls }, { data: li }] = await Promise.all([
        supabase.from('tarefa_lista_grupos').select('grupo_id').eq('lista_id', id),
        supabase.from('tarefa_lista_subgrupos').select('subgrupo_id').eq('lista_id', id),
        supabase.from('tarefa_itens').select('*').eq('lista_id', id).order('ordem'),
      ])
      if (lg) setGruposSel(lg.map((r: any) => r.grupo_id))
      if (ls) setSubgruposSel(ls.map((r: any) => r.subgrupo_id))
      if (li) setItens(li.map((r: any) => ({ ...r, _key: r.id })))
      setLoading(false)
    }
    carregar()
  }, [id, unidadeAtiva?.id])

  // Carrega subgrupos dos grupos selecionados
  useEffect(() => {
    if (gruposSel.length === 0) { setSubgrupos([]); return }
    createClient().from('subgrupos').select('id, nome, grupo_id')
      .in('grupo_id', gruposSel).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setSubgrupos(data) })
  }, [gruposSel])

  function toggleGrupo(gid: string) {
    setGruposSel(prev => prev.includes(gid) ? prev.filter(x => x !== gid) : [...prev, gid])
  }
  function toggleSubgrupo(sid: string) {
    setSubgruposSel(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid])
  }
  function addItem() {
    setItens(prev => [...prev, { _key: novoKey(), titulo: '', aceita_observacao: false, aceita_evidencia: false, exige_checkin: false }])
  }
  function updItem(key: string, patch: Partial<Item>) {
    setItens(prev => prev.map(i => i._key === key ? { ...i, ...patch } : i))
  }
  function delItem(key: string) {
    setItens(prev => prev.filter(i => i._key !== key))
  }

  async function persistir(): Promise<boolean> {
    const supabase = createClient()
    // Remove subgrupos que não pertencem mais aos grupos selecionados
    const subgruposValidos = subgruposSel.filter(sid => subgrupos.some(s => s.id === sid))

    const { error } = await supabase.from('tarefa_listas').update({
      titulo: titulo.trim() || 'Nova lista de tarefas',
      descricao: descricao.trim() || null,
      abertura_data_limite: dataLimite ? new Date(dataLimite).toISOString() : null,
      abertura_max_respostas: maxRespostas ? Number(maxRespostas) : null,
      edicao_janela_horas: edicaoHoras ? Number(edicaoHoras) : null,
      notificar_whatsapp: notificar,
      atualizado_em: new Date().toISOString(),
    }).eq('id', id)
    if (error) { toast.error('Erro ao salvar a lista (verifique sua permissão).'); return false }

    // Atribuições (delete + insert)
    await supabase.from('tarefa_lista_grupos').delete().eq('lista_id', id)
    if (gruposSel.length) await supabase.from('tarefa_lista_grupos').insert(gruposSel.map(g => ({ lista_id: id, grupo_id: g })))
    await supabase.from('tarefa_lista_subgrupos').delete().eq('lista_id', id)
    if (subgruposValidos.length) await supabase.from('tarefa_lista_subgrupos').insert(subgruposValidos.map(s => ({ lista_id: id, subgrupo_id: s })))

    // Itens (delete + insert com ordem) — só os com título
    await supabase.from('tarefa_itens').delete().eq('lista_id', id)
    const validos = itens.filter(i => i.titulo.trim())
    if (validos.length) {
      await supabase.from('tarefa_itens').insert(validos.map((i, idx) => ({
        lista_id: id, titulo: i.titulo.trim(), ordem: idx,
        aceita_observacao: i.aceita_observacao, aceita_evidencia: i.aceita_evidencia, exige_checkin: i.exige_checkin,
      })))
    }
    return true
  }

  async function salvar() {
    setSalvando(true)
    const ok = await persistir()
    setSalvando(false)
    if (ok) toast.success('Lista salva.')
  }

  async function publicar() {
    if (!titulo.trim()) { toast.error('Informe um título.'); return }
    if (itens.filter(i => i.titulo.trim()).length === 0) { toast.error('Adicione ao menos uma tarefa.'); return }
    if (subgruposSel.length === 0 && gruposSel.length === 0) { toast.error('Atribua a lista a ao menos um grupo ou subgrupo.'); return }
    if (!dataLimite && !maxRespostas) {
      if (!await confirm({ titulo: 'Publicar sem limite de encerramento?', mensagem: 'Sem data limite nem nº máximo de respostas, a lista fica aberta até você encerrá-la manualmente.', confirmarLabel: 'Publicar mesmo assim' })) return
    }
    setSalvando(true)
    const ok = await persistir()
    if (!ok) { setSalvando(false); return }
    const { error } = await createClient().from('tarefa_listas').update({ status: 'publicada' }).eq('id', id)
    setSalvando(false)
    if (error) { toast.error('Erro ao publicar.'); return }
    setStatus('publicada')
    toast.success('Lista publicada — já aparece na Operação para os grupos atribuídos.')

    // Aviso por WhatsApp (opcional) — fire-and-forget, não bloqueia a publicação
    if (notificar) {
      apiFetch('/tarefas/notificar', { method: 'POST', body: JSON.stringify({ lista_id: id }) })
        .catch(() => { /* silencia: o aviso é best-effort */ })
    }
  }

  async function encerrar() {
    if (!await confirm({ titulo: 'Encerrar esta lista?', mensagem: 'Ela some da Operação e ninguém mais pode responder/editar.', confirmarLabel: 'Encerrar', perigo: true })) return
    const { error } = await createClient().from('tarefa_listas').update({ status: 'encerrada' }).eq('id', id)
    if (error) { toast.error('Erro ao encerrar.'); return }
    setStatus('encerrada')
    toast.success('Lista encerrada.')
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/gestao/tarefas')} className="text-gray-400 hover:text-orange-500"><ChevronLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800">{status === 'rascunho' ? 'Editar lista' : 'Lista de tarefas'}</h1>
            <p className="text-xs text-gray-400">{status === 'publicada' ? '✅ Publicada' : status === 'encerrada' ? '🔒 Encerrada' : '📝 Rascunho'}</p>
          </div>
        </div>
        {!bloqueado && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
            </Button>
            {status === 'rascunho'
              ? <Button size="sm" onClick={publicar} disabled={salvando}><Send size={14} />Publicar</Button>
              : <Button size="sm" variant="outline" onClick={encerrar}><Lock size={14} />Encerrar</Button>}
          </div>
        )}
      </div>

      {bloqueado && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 text-xs text-gray-500">
          🔒 Lista encerrada — somente leitura.
        </div>
      )}

      {/* Dados gerais */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} disabled={bloqueado}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input value={descricao} onChange={e => setDescricao(e.target.value)} disabled={bloqueado}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>

        {/* Encerramento */}
        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aberta até (data limite)</label>
            <input type="datetime-local" value={dataLimite} onChange={e => setDataLimite(e.target.value)} disabled={bloqueado}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº máximo de respostas</label>
            <input type="number" min={1} value={maxRespostas} onChange={e => setMaxRespostas(e.target.value)} disabled={bloqueado} placeholder="sem limite"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
        </div>
        <p className="text-xs text-gray-400">A lista encerra no que vier primeiro: a data limite ou o nº de respostas.</p>

        <div className="border-t border-gray-100 pt-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Janela de edição (horas após abrir)</label>
          <input type="number" min={1} value={edicaoHoras} onChange={e => setEdicaoHoras(e.target.value)} disabled={bloqueado} placeholder="sem limite (até a lista encerrar)"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          <p className="text-xs text-gray-400 mt-1">Após abrir sua resposta, por quantas horas a pessoa pode continuar marcando/editando.</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer border-t border-gray-100 pt-3">
          <input type="checkbox" checked={notificar} onChange={e => setNotificar(e.target.checked)} disabled={bloqueado} className="accent-orange-500" />
          Avisar por WhatsApp ao publicar (cada pessoa dos subgrupos, respeitando o turno)
        </label>
      </div>

      {/* Atribuição */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{grupoLabel} com acesso</label>
          <div className="flex flex-wrap gap-2">
            {grupos.map(g => (
              <button key={g.id} type="button" disabled={bloqueado} onClick={() => toggleGrupo(g.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${gruposSel.includes(g.id) ? 'bg-orange-50 border-orange-300 text-orange-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {g.nome}
              </button>
            ))}
            {grupos.length === 0 && <span className="text-xs text-gray-400">Nenhum {grupoLabel.toLowerCase()} cadastrado.</span>}
          </div>
        </div>
        {subgrupos.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">{subgrupoLabel} com acesso</label>
            <div className="flex flex-wrap gap-2">
              {subgrupos.map(s => (
                <button key={s.id} type="button" disabled={bloqueado} onClick={() => toggleSubgrupo(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${subgruposSel.includes(s.id) ? 'bg-orange-50 border-orange-300 text-orange-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {s.nome}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">Sem subgrupo selecionado, vale para todos os subgrupos dos grupos escolhidos.</p>
          </div>
        )}
      </div>

      {/* Tarefas */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <label className="block text-sm font-medium text-gray-700">Tarefas</label>
        {itens.map((it, idx) => (
          <div key={it._key} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5">{idx + 1}.</span>
              <input value={it.titulo} onChange={e => updItem(it._key, { titulo: e.target.value })} disabled={bloqueado}
                placeholder="Descreva a tarefa" className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
              {!bloqueado && (
                <button onClick={() => delItem(it._key)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              )}
            </div>
            <div className="flex flex-wrap gap-4 pl-7">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={it.aceita_observacao} onChange={e => updItem(it._key, { aceita_observacao: e.target.checked })} disabled={bloqueado} className="accent-orange-500" />
                Aceita observação
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={it.aceita_evidencia} onChange={e => updItem(it._key, { aceita_evidencia: e.target.checked })} disabled={bloqueado} className="accent-orange-500" />
                Aceita evidência (foto/vídeo)
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={it.exige_checkin} onChange={e => updItem(it._key, { exige_checkin: e.target.checked })} disabled={bloqueado} className="accent-orange-500" />
                Exige check-in (localização)
              </label>
            </div>
          </div>
        ))}
        {!bloqueado && (
          <button onClick={addItem} className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors">
            <Plus size={15} />Adicionar tarefa
          </button>
        )}
      </div>
    </div>
  )
}
