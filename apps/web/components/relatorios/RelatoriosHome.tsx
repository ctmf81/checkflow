'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileBarChart2, ChevronDown, ChevronUp, Loader2, Sparkles,
  CheckCircle2, AlertCircle, X, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast } from '@/components/ui/feedback'
import { ehAdminDaEmpresa } from '@/lib/admin'

interface ModeloOpt { id: string; nome: string }
interface GeradoRow {
  id: string
  status: 'gerando' | 'pronto' | 'erro'
  periodo_de: string
  periodo_ate: string
  conteudo: string | null
  erro_msg: string | null
  gerado_em: string
  modelo: { nome: string; periodo_horas: number } | { nome: string; periodo_horas: number }[] | null
}

function nomeModelo(g: GeradoRow): string {
  const m = Array.isArray(g.modelo) ? g.modelo[0] : g.modelo
  return m?.nome ?? 'Relatório'
}
function periodoModelo(g: GeradoRow): number {
  const m = Array.isArray(g.modelo) ? g.modelo[0] : g.modelo
  return m?.periodo_horas ?? 0
}
function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function RelatoriosHome() {
  const { unidadeAtiva, empresaAtiva, flagsHabilitadas } = useSession()
  const iaHabilitada = flagsHabilitadas === null || flagsHabilitadas.has('ia')
  const toast = useToast()

  const [podeExecutar, setPodeExecutar] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [modelos, setModelos] = useState<ModeloOpt[]>([])
  const [gerados, setGerados] = useState<GeradoRow[]>([])
  const [modeloSel, setModeloSel] = useState('')
  const [gerando, setGerando] = useState(false)
  const [viewer, setViewer] = useState<GeradoRow | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Permissão de gerar (executar): admin de sistema/empresa OU perfil com a ação.
  useEffect(() => {
    if (!empresaAtiva?.id) { setPodeExecutar(false); return }
    let cancel = false
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      if (user.user_metadata?.role === 'admin_sistema') { if (!cancel) setPodeExecutar(true); return }
      if (await ehAdminDaEmpresa(sb, empresaAtiva.id)) { if (!cancel) setPodeExecutar(true); return }
      const { data: ue } = await sb.from('usuario_empresa').select('perfil_id').eq('usuario_id', user.id).eq('empresa_id', empresaAtiva.id).maybeSingle()
      if (!ue?.perfil_id) { if (!cancel) setPodeExecutar(false); return }
      const { data: pp } = await sb.from('perfil_permissoes').select('permissao:permissao_id(recurso, acao)').eq('perfil_id', ue.perfil_id)
      const pode = (pp ?? []).some((row: any) => {
        const p = Array.isArray(row.permissao) ? row.permissao[0] : row.permissao
        return p?.recurso === 'relatorios' && p?.acao === 'executar'
      })
      if (!cancel) setPodeExecutar(pode)
    })()
    return () => { cancel = true }
  }, [empresaAtiva?.id])

  const carregarModelos = useCallback(async () => {
    if (!unidadeAtiva?.id) return
    const { data } = await createClient().from('relatorio_modelos')
      .select('id, nome').eq('unidade_id', unidadeAtiva.id).order('nome')
    setModelos(data ?? [])
  }, [unidadeAtiva?.id])

  const carregarGerados = useCallback(async () => {
    if (!unidadeAtiva?.id) return
    const { data } = await createClient().from('relatorios_gerados')
      .select('id, status, periodo_de, periodo_ate, conteudo, erro_msg, gerado_em, modelo:modelo_id(nome, periodo_horas)')
      .eq('unidade_id', unidadeAtiva.id).order('gerado_em', { ascending: false }).limit(20)
    setGerados((data ?? []) as GeradoRow[])
  }, [unidadeAtiva?.id])

  useEffect(() => { carregarModelos(); carregarGerados() }, [carregarModelos, carregarGerados])

  // Enquanto houver relatório 'gerando', faz polling até todos concluírem.
  useEffect(() => {
    const temGerando = gerados.some(g => g.status === 'gerando')
    if (temGerando && !pollRef.current) {
      pollRef.current = setInterval(() => { carregarGerados() }, 3000)
    } else if (!temGerando && pollRef.current) {
      clearInterval(pollRef.current); pollRef.current = null
    }
    return () => { if (pollRef.current && !temGerando) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [gerados, carregarGerados])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function gerar() {
    if (!modeloSel) { toast.error('Escolha um modelo.'); return }
    setGerando(true)
    const sb = createClient()
    const { data: { session } } = await sb.auth.getSession()
    const tk = session?.access_token
    if (!tk) { setGerando(false); toast.error('Sessão expirada.'); return }
    try {
      const res = await fetch('/api/relatorios/gerar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tk}` },
        body: JSON.stringify({ modelo_id: modeloSel }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? 'Não foi possível gerar o relatório.'); setGerando(false); return }
      toast.success('Relatório em geração…')
      setAberto(true)
      await carregarGerados()  // já traz a linha 'gerando' → dispara o polling
    } catch {
      toast.error('Falha de conexão ao gerar o relatório.')
    } finally {
      setGerando(false)
    }
  }

  if (!unidadeAtiva || !iaHabilitada || !podeExecutar) return null

  return (
    <div className="bg-white border border-gray-200 rounded-2xl">
      {/* Cabeçalho recolhível */}
      <button onClick={() => setAberto(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <FileBarChart2 size={16} className="text-orange-500" />
          Relatórios (IA)
          {gerados.some(g => g.status === 'gerando') && (
            <Loader2 size={13} className="animate-spin text-orange-400" />
          )}
        </span>
        {aberto ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {aberto && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          {/* Gerar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={modeloSel} onChange={e => setModeloSel(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Selecione um modelo…</option>
              {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <button onClick={gerar} disabled={gerando || !modeloSel}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {gerando ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              Gerar
            </button>
          </div>
          {modelos.length === 0 && (
            <p className="text-xs text-gray-400">Nenhum modelo cadastrado. Crie um em Relatórios (menu lateral).</p>
          )}

          {/* Lista de gerados */}
          {gerados.length > 0 && (
            <div className="space-y-2">
              {gerados.map(g => (
                <div key={g.id}
                  className={`flex items-center gap-3 border border-gray-100 rounded-xl px-3 py-2.5 ${g.status === 'pronto' ? 'hover:bg-gray-50 cursor-pointer' : ''} transition-colors`}
                  onClick={() => g.status === 'pronto' && setViewer(g)}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-50">
                    {g.status === 'gerando' ? <Loader2 size={14} className="animate-spin text-orange-400" />
                      : g.status === 'erro' ? <AlertCircle size={14} className="text-red-500" />
                      : <CheckCircle2 size={14} className="text-green-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{nomeModelo(g)}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      <Clock size={10} className="inline -mt-0.5 mr-0.5" />
                      últimas {periodoModelo(g)}h · {dataHora(g.gerado_em)}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                    g.status === 'gerando' ? 'bg-orange-50 text-orange-600'
                    : g.status === 'erro' ? 'bg-red-50 text-red-600'
                    : 'bg-green-50 text-green-600'}`}>
                    {g.status === 'gerando' ? 'Gerando…' : g.status === 'erro' ? 'Erro' : 'Pronto'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Viewer */}
      {viewer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setViewer(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-800 truncate">{nomeModelo(viewer)}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {dataHora(viewer.periodo_de)} → {dataHora(viewer.periodo_ate)}
                </p>
              </div>
              <button onClick={() => setViewer(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">{viewer.conteudo}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
