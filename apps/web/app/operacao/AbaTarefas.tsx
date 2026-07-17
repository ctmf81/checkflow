'use client'

import { useEffect, useState, useCallback } from 'react'
import { ListChecks, Loader2, ChevronLeft, Check, Camera, MapPin, Clock, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { listaDisponivel, calcularEditavelAte, edicaoExpirada } from '@/lib/tarefas'
import { registrarUsoArmazenamento } from '@/lib/uso'
import { ehAdminDaEmpresa } from '@/lib/admin'

interface Lista {
  id: string
  titulo: string
  descricao: string | null
  abertura_data_limite: string | null
  abertura_max_respostas: number | null
  edicao_janela_horas: number | null
  total_respostas: number
  // Preenchidos só na seção "Concluídas" (execução do usuário encerrada ou com prazo expirado)
  concluida_em?: string | null
  encerrada?: boolean            // true = o operador concluiu; false = prazo expirou sem concluir
  cor?: 'verde' | 'amarelo' | 'vermelho'  // completude: tudo/parcial/nada respondido
  feitos?: number
  total?: number
}

// Cores por completude na seção Concluídas
const CORES = {
  verde:    { bg: 'bg-green-100', ic: 'text-green-600', border: 'border-green-200', txt: 'text-green-600' },
  amarelo:  { bg: 'bg-amber-100', ic: 'text-amber-600', border: 'border-amber-200', txt: 'text-amber-700' },
  vermelho: { bg: 'bg-red-100',   ic: 'text-red-600',   border: 'border-red-200',   txt: 'text-red-600' },
} as const

interface Item {
  id: string
  titulo: string
  aceita_observacao: boolean
  aceita_evidencia: boolean
  exige_checkin: boolean
}

interface Resposta {
  feito: boolean
  observacao: string
  evidencia_url: string | null
  evidencia_tipo: 'foto' | 'video' | null
  lat: number | null
  lng: number | null
}

export function AbaTarefas({ unidadeId, empresaId }: { unidadeId: string; empresaId?: string }) {
  const [listas, setListas] = useState<Lista[]>([])
  const [concluidas, setConcluidas] = useState<Lista[]>([])
  const [loading, setLoading] = useState(true)
  const [aberta, setAberta] = useState<Lista | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const isAdmin = await ehAdminDaEmpresa(supabase, empresaId)

    // Grupos/subgrupos do usuário
    const [{ data: ug }, { data: us }] = await Promise.all([
      supabase.from('usuario_grupo').select('grupo_id').eq('usuario_id', user.id),
      supabase.from('usuario_subgrupo').select('subgrupo_id').eq('usuario_id', user.id),
    ])
    const meusGrupos = new Set((ug ?? []).map((r: any) => r.grupo_id))
    const meusSubgrupos = new Set((us ?? []).map((r: any) => r.subgrupo_id))

    // Execuções do próprio usuário. "Concluídas" = encerradas pelo operador OU
    // com o prazo de edição expirado (finalizadas sem concluir). A lista + itens
    // + respostas vêm no join → dá para colorir por completude sem query extra.
    const agora = Date.now()
    const { data: execs } = await supabase.from('tarefa_execucoes')
      .select('lista_id, status, atualizado_em, editavel_ate, respostas:tarefa_respostas(feito), tarefa_listas(id, titulo, descricao, abertura_data_limite, abertura_max_respostas, edicao_janela_horas, itens:tarefa_itens(id))')
      .eq('usuario_id', user.id).eq('unidade_id', unidadeId)

    const finalizadaPorLista = new Set<string>()  // encerrada OU prazo expirado (sai das Liberadas)
    const concluidasList: Lista[] = []
    for (const e of (execs ?? []) as any[]) {
      const l = e.tarefa_listas
      if (!l) continue
      const encerrada = e.status === 'encerrada'
      const expirada = edicaoExpirada(e.editavel_ate, agora)
      if (!encerrada && !expirada) continue
      finalizadaPorLista.add(e.lista_id)
      const total = (l.itens ?? []).length
      const feitos = (e.respostas ?? []).filter((r: any) => r.feito).length
      const cor: 'verde' | 'amarelo' | 'vermelho' = total > 0 && feitos >= total ? 'verde' : feitos > 0 ? 'amarelo' : 'vermelho'
      concluidasList.push({
        id: l.id, titulo: l.titulo, descricao: l.descricao,
        abertura_data_limite: l.abertura_data_limite, abertura_max_respostas: l.abertura_max_respostas,
        edicao_janela_horas: l.edicao_janela_horas, total_respostas: 0,
        concluida_em: e.atualizado_em, encerrada, cor, feitos, total,
      })
    }
    concluidasList.sort((a, b) => new Date(b.concluida_em!).getTime() - new Date(a.concluida_em!).getTime())

    // Listas publicadas da unidade + atribuições + contagem de respostas
    const { data } = await supabase
      .from('tarefa_listas')
      .select('id, titulo, descricao, liberacao_em, abertura_data_limite, abertura_max_respostas, edicao_janela_horas, grupos:tarefa_lista_grupos(grupo_id), subgrupos:tarefa_lista_subgrupos(subgrupo_id), respostas:tarefa_execucoes(id)')
      .eq('unidade_id', unidadeId)
      .eq('status', 'publicada')

    const disponiveis = (data ?? []).filter((l: any) => listaDisponivel(
      {
        liberacao_em: l.liberacao_em,
        abertura_data_limite: l.abertura_data_limite,
        abertura_max_respostas: l.abertura_max_respostas,
        total_respostas: (l.respostas ?? []).length,
        grupos: (l.grupos ?? []).map((g: any) => g.grupo_id),
        subgrupos: (l.subgrupos ?? []).map((s: any) => s.subgrupo_id),
      },
      agora, meusGrupos, meusSubgrupos, isAdmin,
    ))
      // Encerradas/expiradas pelo operador saem das Liberadas (vão p/ Concluídas)
      .filter((l: any) => !finalizadaPorLista.has(l.id))
      .map((l: any) => ({
        id: l.id, titulo: l.titulo, descricao: l.descricao,
        abertura_data_limite: l.abertura_data_limite, abertura_max_respostas: l.abertura_max_respostas,
        edicao_janela_horas: l.edicao_janela_horas, total_respostas: (l.respostas ?? []).length,
      }))

    setListas(disponiveis)
    setConcluidas(concluidasList)
    setLoading(false)
  }, [unidadeId, empresaId])

  useEffect(() => { carregar() }, [carregar])

  if (aberta) {
    return <ExecutarLista lista={aberta} unidadeId={unidadeId} empresaId={empresaId} onVoltar={() => { setAberta(null); carregar() }} />
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
  if (listas.length === 0 && concluidas.length === 0) return (
    <div className="py-16 text-center">
      <ListChecks size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhuma lista de tarefas disponível.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Liberadas — disponíveis para responder agora */}
      {listas.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks size={16} className="text-orange-500" />
            <h2 className="text-sm font-bold text-gray-700">Liberadas</h2>
            <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-2 py-0.5 rounded-full">{listas.length}</span>
          </div>
          <div className="space-y-3">
            {listas.map(l => (
              <button key={l.id} onClick={() => setAberta(l)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-orange-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <ListChecks size={18} className="text-orange-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-800 truncate">{l.titulo}</p>
                    {l.descricao && <p className="text-xs text-gray-400 truncate">{l.descricao}</p>}
                    {l.abertura_data_limite && (
                      <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <Clock size={11} />Prazo: {new Date(l.abertura_data_limite).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Concluídas — encerradas pelo operador OU com prazo expirado; cor = completude */}
      {concluidas.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Check size={16} className="text-gray-500" />
            <h2 className="text-sm font-bold text-gray-700">Concluídas</h2>
            <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">{concluidas.length}</span>
          </div>
          <div className="space-y-3">
            {concluidas.map(l => {
              const c = CORES[l.cor ?? 'vermelho']
              return (
                <button key={l.id} onClick={() => setAberta(l)}
                  className={`w-full text-left bg-white rounded-xl border ${c.border} p-4 hover:shadow-sm transition-all`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      {l.cor === 'verde' ? <Check size={18} className={c.ic} /> : <AlertTriangle size={16} className={c.ic} />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-800 truncate">{l.titulo}</p>
                      <p className={`text-xs mt-0.5 ${c.txt}`}>
                        {l.encerrada ? 'Concluída' : 'Finalizada (prazo encerrado)'}
                        {typeof l.total === 'number' && l.total > 0 ? ` · ${l.feitos}/${l.total} feitas` : ''}
                        {' · '}{new Date(l.concluida_em!).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Execução de uma lista ───────────────────────────────────────────────────
function ExecutarLista({ lista, unidadeId, empresaId, onVoltar }: { lista: Lista; unidadeId: string; empresaId?: string; onVoltar: () => void }) {
  const [itens, setItens] = useState<Item[]>([])
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [execucaoId, setExecucaoId] = useState<string | null>(null)
  const [editavelAte, setEditavelAte] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('em_andamento')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [enviandoMidia, setEnviandoMidia] = useState<string | null>(null)
  const [concluindo, setConcluindo] = useState(false)
  const [erro, setErro] = useState('')

  const expirado = edicaoExpirada(editavelAte, Date.now())
  // Também trava quando o PRAZO DE RESPOSTA da lista (abertura_data_limite) já
  // passou — "só edita enquanto a lista está ativa". O max_respostas rege a
  // abertura de NOVAS instâncias (já filtra em Liberadas), não a edição desta.
  const aberturaVencida = lista.abertura_data_limite != null && Date.parse(lista.abertura_data_limite) <= Date.now()
  const bloqueado = expirado || aberturaVencida

  useEffect(() => {
    async function iniciar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: its } = await supabase.from('tarefa_itens').select('*').eq('lista_id', lista.id).order('ordem')
      setItens(its ?? [])

      // Garante a instância do usuário (1 por lista)
      let { data: exec } = await supabase.from('tarefa_execucoes')
        .select('id, editavel_ate, status').eq('lista_id', lista.id).eq('usuario_id', user.id).maybeSingle()

      if (!exec) {
        const editavel = calcularEditavelAte(new Date().toISOString(), lista.edicao_janela_horas)
        const { data: nova, error } = await supabase.from('tarefa_execucoes').insert({
          lista_id: lista.id, unidade_id: unidadeId, usuario_id: user.id, editavel_ate: editavel,
        }).select('id, editavel_ate, status').single()
        if (error || !nova) { setErro('Não foi possível abrir a lista.'); setLoading(false); return }
        exec = nova
      }
      setExecucaoId(exec.id)
      setEditavelAte(exec.editavel_ate)
      setStatus(exec.status ?? 'em_andamento')

      const { data: resp } = await supabase.from('tarefa_respostas').select('*').eq('execucao_id', exec.id)
      const map: Record<string, Resposta> = {}
      for (const r of (resp ?? [])) {
        map[r.item_id] = {
          feito: r.feito, observacao: r.observacao ?? '', evidencia_url: r.evidencia_url,
          evidencia_tipo: r.evidencia_tipo, lat: r.lat, lng: r.lng,
        }
      }
      setRespostas(map)
      setLoading(false)
    }
    iniciar()
  }, [lista.id, lista.edicao_janela_horas, unidadeId])

  function getResp(itemId: string): Resposta {
    return respostas[itemId] ?? { feito: false, observacao: '', evidencia_url: null, evidencia_tipo: null, lat: null, lng: null }
  }

  async function salvarResposta(item: Item, patch: Partial<Resposta>) {
    if (!execucaoId || bloqueado) return
    const atual = getResp(item.id)
    const nova = { ...atual, ...patch }
    setRespostas(prev => ({ ...prev, [item.id]: nova }))
    setSalvando(item.id)
    setErro('')
    const supabase = createClient()
    const { error } = await supabase.from('tarefa_respostas').upsert({
      execucao_id: execucaoId, item_id: item.id,
      feito: nova.feito, observacao: nova.observacao || null,
      evidencia_url: nova.evidencia_url, evidencia_tipo: nova.evidencia_tipo,
      lat: nova.lat, lng: nova.lng, respondido_em: new Date().toISOString(),
    }, { onConflict: 'execucao_id,item_id' })
    setSalvando(null)
    if (error) setErro('Erro ao salvar. Tente novamente.')
  }

  async function marcarFeito(item: Item, feito: boolean) {
    // Check-in: tenta capturar a localização, mas NÃO bloqueia a conclusão.
    // Se o GPS não estiver disponível/for negado, conclui sem localização.
    if (feito && item.exige_checkin && navigator.geolocation) {
      setSalvando(item.id)
      navigator.geolocation.getCurrentPosition(
        pos => salvarResposta(item, { feito: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => salvarResposta(item, { feito: true, lat: null, lng: null }),
        { timeout: 10000 },
      )
      return
    }
    salvarResposta(item, { feito })
  }

  async function enviarEvidencia(item: Item, file: File) {
    if (!execucaoId || bloqueado) return
    setSalvando(item.id)
    setEnviandoMidia(item.id)
    setErro('')
    const supabase = createClient()

    // Bloqueio por capacidade de armazenamento do plano (mesma regra do checklist)
    if (empresaId) {
      const { data: cabe } = await supabase.rpc('billing_armazenamento_disponivel', { p_empresa_id: empresaId, p_bytes: file.size })
      if (cabe === false) {
        setSalvando(null)
        setEnviandoMidia(null)
        setErro('Capacidade de armazenamento do plano atingida. Contate o administrador para ampliar o plano ou comprar mais espaço.')
        return
      }
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const tipo: 'foto' | 'video' = file.type.startsWith('video') ? 'video' : 'foto'
    // Caminho ÚNICO (timestamp) + INSERT puro: o bucket `execucoes` só tem policy
    // de insert, então `upsert:true` (que exige UPDATE) falhava — "Erro ao enviar
    // a evidência". Reenvio cria um novo arquivo; o antigo vira órfão (limpeza).
    const path = `tarefas/${execucaoId}/${item.id}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('execucoes').upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (upErr) {
      console.error('[tarefa-evidencia] upload falhou:', upErr)
      setSalvando(null)
      setEnviandoMidia(null)
      setErro(`Erro ao enviar a evidência: ${upErr.message || 'tente novamente.'}`)
      return
    }
    // Contabiliza o uso de armazenamento (fire-and-forget)
    registrarUsoArmazenamento(empresaId, 'tarefa', file.size)
    const { data: pub } = supabase.storage.from('execucoes').getPublicUrl(path)
    await salvarResposta(item, { evidencia_url: pub.publicUrl, evidencia_tipo: tipo })
    setEnviandoMidia(null)
  }

  // Marca a instância como concluída. Continua editável enquanto a janela de
  // edição não expirar — é só um registro de que o operador terminou.
  async function concluir() {
    if (!execucaoId || bloqueado) return
    setConcluindo(true)
    setErro('')
    const supabase = createClient()
    const { error } = await supabase.from('tarefa_execucoes')
      .update({ status: 'encerrada', atualizado_em: new Date().toISOString() })
      .eq('id', execucaoId)
    setConcluindo(false)
    if (error) { setErro('Não foi possível concluir. Tente novamente.'); return }
    setStatus('encerrada')
    onVoltar()
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  return (
    <div>
      <button onClick={onVoltar} className="flex items-center gap-1 text-sm text-gray-400 hover:text-orange-500 mb-3">
        <ChevronLeft size={16} />Voltar
      </button>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{lista.titulo}</h2>
        {lista.descricao && <p className="text-sm text-gray-500">{lista.descricao}</p>}
        {editavelAte && (
          <p className={`flex items-center gap-1 text-xs mt-1 ${expirado ? 'text-red-500' : 'text-gray-400'}`}>
            <Clock size={12} />
            {expirado ? 'Prazo de edição encerrado' : `Você pode editar até ${new Date(editavelAte).toLocaleString('pt-BR')}`}
          </p>
        )}
      </div>

      {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-3">{erro}</p>}
      {bloqueado && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 text-xs text-amber-700">
          <AlertTriangle size={14} className="flex-shrink-0" />O prazo para responder esta lista terminou.
        </div>
      )}

      <div className="space-y-2">
        {itens.map(item => {
          const r = getResp(item.id)
          return (
            <div key={item.id} className={`bg-white rounded-xl border p-3 ${r.feito ? 'border-green-200' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <button onClick={() => marcarFeito(item, !r.feito)} disabled={bloqueado || salvando === item.id}
                  className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${r.feito ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-orange-400'}`}>
                  {salvando === item.id ? <Loader2 size={12} className="animate-spin text-gray-400" /> : r.feito && <Check size={13} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${r.feito ? 'text-gray-800' : 'text-gray-700'}`}>{item.titulo}</p>
                  {item.exige_checkin && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                      <MapPin size={11} />{r.lat ? 'Check-in registrado' : r.feito ? 'Concluído sem localização' : 'Exige check-in ao concluir'}
                    </span>
                  )}

                  {item.aceita_observacao && (
                    <textarea value={r.observacao} disabled={bloqueado} rows={2}
                      onChange={e => setRespostas(prev => ({ ...prev, [item.id]: { ...getResp(item.id), observacao: e.target.value } }))}
                      onBlur={() => salvarResposta(item, {})}
                      placeholder="Observação (opcional)"
                      className="w-full mt-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
                  )}

                  {item.aceita_evidencia && (
                    <div className="mt-2">
                      {enviandoMidia === item.id ? (
                        <div className="inline-flex items-center gap-1.5 text-xs text-orange-500 border border-dashed border-orange-300 rounded-lg px-3 py-1.5">
                          <Loader2 size={13} className="animate-spin" />Enviando mídia...
                        </div>
                      ) : r.evidencia_url ? (
                        <div className="flex items-center gap-2 text-xs text-green-600">
                          <Check size={12} />Evidência enviada
                          {!bloqueado && <span className="text-gray-300">·</span>}
                          {!bloqueado && <label className="text-orange-500 cursor-pointer hover:underline">
                            trocar
                            <input type="file" accept="image/*,video/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) enviarEvidencia(item, f); e.target.value = '' }} />
                          </label>}
                        </div>
                      ) : !bloqueado && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 cursor-pointer hover:border-orange-300 hover:text-orange-500 transition-colors">
                          <Camera size={13} />Adicionar foto/vídeo
                          <input type="file" accept="image/*,video/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) enviarEvidencia(item, f); e.target.value = '' }} />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Concluir — registra o término. Continua editável enquanto a janela permitir. */}
      {!bloqueado && itens.length > 0 && (
        <div className="mt-5">
          {status === 'encerrada' && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-green-600 mb-2">
              <Check size={13} />Concluída — você ainda pode editar até o fim do prazo.
            </p>
          )}
          <button onClick={concluir} disabled={concluindo}
            className="w-full py-3.5 bg-green-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-green-600 disabled:opacity-60 transition-colors active:scale-[0.99]">
            {concluindo
              ? <><Loader2 size={16} className="animate-spin" />Salvando...</>
              : <><Check size={16} />{status === 'encerrada' ? 'Salvar alterações' : 'Concluir tarefas'}</>}
          </button>
        </div>
      )}
    </div>
  )
}
