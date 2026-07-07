'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { notificarPlanoEnviadoN2, notificarPlanoDevolvidoN1 } from '@/lib/notificacoes'
import { registrarUsoArmazenamento } from '@/lib/uso'
import { CausaRaizModeracao } from '@/components/planos-acao/CausaRaizModeracao'
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, AlertTriangle,
  ClipboardList, ChevronRight, ImagePlus, Video, X, Loader2,
  Send, RotateCcw, User, FileText, ExternalLink
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusPlano = 'em_moderacao_n1' | 'em_moderacao_n2' | 'corrigido' | 'nao_corrigido'
type Acao = 'aberto' | 'enviado_n2' | 'devolvido_n1' | 'corrigido' | 'nao_corrigido' | 'reaberto'
type Funcao = 'operacao' | 'nivel_1' | 'nivel_2' | null

interface Plano {
  id: string
  status: StatusPlano
  identificador: string | null
  observacao_abertura: string | null
  sla_prazo: string | null
  created_at: string
  subgrupo_id: string
  unidade_id: string
  atividade_id: string
  checklist_execucao_id: string
  subgrupos: { nome: string } | null
  checklist_atividades: { nome: string } | null
  checklist_execucoes: { id: string; pdf_url: string | null; checklists: { nome: string } | null } | null
  usuarios: { nome: string } | null
  plano_acao_evidencias: { id: string; tipo: string; url: string; ordem: number }[]
}

interface Movimentacao {
  id: string
  acao: Acao
  observacao: string | null
  created_at: string
  usuarios: { nome: string } | null
  plano_acao_movimentacao_evidencias: { id: string; tipo: string; url: string }[]
}

// ─── Helpers visuais ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusPlano, { label: string; cor: string; Icon: any }> = {
  em_moderacao_n1: { label: 'Moderação N1', cor: 'bg-amber-100 text-amber-700 border-amber-200',   Icon: Clock },
  em_moderacao_n2: { label: 'Moderação N2', cor: 'bg-orange-100 text-orange-700 border-orange-200', Icon: Clock },
  corrigido:       { label: 'Corrigido',    cor: 'bg-green-100 text-green-700 border-green-200',    Icon: CheckCircle2 },
  nao_corrigido:   { label: 'Não corrigido',cor: 'bg-red-100 text-red-700 border-red-200',          Icon: XCircle },
}

const ACAO_CONFIG: Record<Acao, { label: string; cor: string }> = {
  aberto:        { label: 'Plano aberto',       cor: 'text-gray-500' },
  enviado_n2:    { label: 'Enviado para N2',     cor: 'text-orange-600' },
  devolvido_n1:  { label: 'Devolvido para N1',   cor: 'text-amber-600' },
  corrigido:     { label: 'Marcado como corrigido', cor: 'text-green-600' },
  nao_corrigido: { label: 'Marcado como não corrigido', cor: 'text-red-600' },
  reaberto:      { label: 'Plano reaberto',      cor: 'text-blue-600' },
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Modal de ação (moderação) ────────────────────────────────────────────────

interface DadosAcao {
  observacao: string
  fotos: { file: File; url: string }[]
  video: { file: File; url: string } | null
}

function AcaoModal({ titulo, corBtn, onClose, onConfirmar, salvando }: {
  titulo: string
  corBtn: string
  onClose: () => void
  onConfirmar: (dados: DadosAcao) => void
  salvando: boolean
}) {
  const [observacao, setObservacao] = useState('')
  const [fotos, setFotos] = useState<{ file: File; url: string }[]>([])
  const [video, setVideo] = useState<{ file: File; url: string } | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const [erroMidia, setErroMidia] = useState('')

  const MAX_FOTOS = 5
  const MAX_VIDEO_SEG = 10

  function addFoto(f: File) {
    setErroMidia('')
    if (fotos.length >= MAX_FOTOS) { setErroMidia(`Máximo de ${MAX_FOTOS} fotos.`); return }
    setFotos(p => [...p, { file: f, url: URL.createObjectURL(f) }])
  }

  function addVideo(f: File) {
    setErroMidia('')
    const url = URL.createObjectURL(f)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      if (v.duration > MAX_VIDEO_SEG + 0.5) {
        URL.revokeObjectURL(url)
        setErroMidia(`O vídeo deve ter no máximo ${MAX_VIDEO_SEG} segundos.`)
        return
      }
      setVideo({ file: f, url })
    }
    v.onerror = () => { URL.revokeObjectURL(url); setErroMidia('Não foi possível ler o vídeo.') }
    v.src = url
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <p className="text-sm font-semibold text-gray-800">{titulo}</p>
          <button onClick={onClose} disabled={salvando} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observação <span className="text-red-400">*</span>
            </label>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={3} autoFocus
              placeholder="Descreva o que foi feito, observado ou o motivo da decisão..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Evidências <span className="text-xs text-gray-400 font-normal">(opcional)</span></label>
            {fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {fotos.map((f, i) => (
                  <div key={i} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className="w-full h-full object-cover rounded-xl border border-gray-200" />
                    <button onClick={() => setFotos(p => p.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {video === null && fotos.length < MAX_FOTOS && (
              <>
                <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) addFoto(f); e.target.value = '' }} />
                <button onClick={() => fotoRef.current?.click()}
                  className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-500 flex items-center justify-center gap-2 hover:border-orange-300 hover:text-orange-500 transition-colors mb-2">
                  <ImagePlus size={14} />{fotos.length > 0 ? `Mais fotos (${fotos.length}/${MAX_FOTOS})` : `Adicionar foto (até ${MAX_FOTOS})`}
                </button>
              </>
            )}
            {fotos.length === 0 && (
              video ? (
                <div className="space-y-1.5">
                  <video src={video.url} controls className="w-full rounded-xl border border-gray-200 max-h-36 bg-black" />
                  <button onClick={() => setVideo(null)} className="w-full py-1.5 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50">Remover vídeo</button>
                </div>
              ) : (
                <>
                  {/* Só câmera (capture), sem galeria; máx. 10s validado ao selecionar */}
                  <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) addVideo(f); e.target.value = '' }} />
                  <button onClick={() => videoRef.current?.click()}
                    className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-500 flex items-center justify-center gap-2 hover:border-orange-300 hover:text-orange-500 transition-colors">
                    <Video size={14} />Adicionar vídeo (câmera, até {MAX_VIDEO_SEG}s)
                  </button>
                </>
              )
            )}
            {erroMidia && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertTriangle size={12} />{erroMidia}</p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} disabled={salvando}
            className="flex-1 py-3 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={() => { if (observacao.trim()) onConfirmar({ observacao: observacao.trim(), fotos, video }) }}
            disabled={!observacao.trim() || salvando}
            className={`flex-1 py-3 text-sm font-bold text-white rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 ${corBtn}`}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página de detalhe ────────────────────────────────────────────────────────

export default function PlanoAcaoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { empresaAtiva } = useSession()
  const [plano, setPlano] = useState<Plano | null>(null)
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [funcaoUsuario, setFuncaoUsuario] = useState<Funcao>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [temN2, setTemN2] = useState(true)
  const [loading, setLoading] = useState(true)
  const [modalAcao, setModalAcao] = useState<{ acao: Acao; titulo: string; corBtn: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setLoading(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()

    const { data: p } = await sb.from('planos_acao').select(`
      id, status, identificador, observacao_abertura, sla_prazo, created_at,
      subgrupo_id, unidade_id, atividade_id, checklist_execucao_id,
      subgrupos(nome),
      checklist_atividades(nome),
      checklist_execucoes(id, pdf_url, checklists(nome)),
      usuarios!criado_por(nome),
      plano_acao_evidencias(id, tipo, url, ordem)
    `).eq('id', id).single()

    if (!p) { setLoading(false); return }
    setPlano(p as unknown as Plano)

    // Movimentações com evidências
    const { data: movs } = await sb.from('plano_acao_movimentacoes').select(`
      id, acao, observacao, created_at,
      usuarios(nome),
      plano_acao_movimentacao_evidencias(id, tipo, url)
    `).eq('plano_acao_id', id).order('created_at', { ascending: true })
    setMovimentacoes((movs ?? []) as unknown as Movimentacao[])

    // Função do usuário logado neste subgrupo
    if (user) {
      // Admin do sistema é identificado via JWT metadata
      const admin = user.user_metadata?.role === 'admin_sistema'
      setIsAdmin(admin)

      if (!admin) {
        const { data: us } = await sb.from('usuario_subgrupo')
          .select('funcao').eq('subgrupo_id', (p as any).subgrupo_id).eq('usuario_id', user.id).single()
        setFuncaoUsuario((us?.funcao ?? null) as Funcao)
      }
    }

    // O subgrupo tem algum moderador N2 configurado? (gestor do grupo deveria ser N2;
    // se ninguém for, o botão "Enviar para N2" fica desabilitado com aviso.)
    // Via RPC SECURITY DEFINER: o count direto sofre com o RLS de usuario_subgrupo
    // (N1 não-admin só lê a própria linha → não enxergava o N2 → falso "sem N2").
    const { data: temN2Rpc } = await sb.rpc('subgrupo_tem_n2', { p_subgrupo_id: (p as any).subgrupo_id })
    setTemN2(!!temN2Rpc)

    setLoading(false)
  }

  useEffect(() => { carregar() }, [id])

  async function executarAcao(acao: Acao, dados: DadosAcao) {
    if (!plano) return
    setSalvando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()

    // Determina novo status
    const novoStatus: Record<Acao, StatusPlano | null> = {
      aberto:        'em_moderacao_n1',
      enviado_n2:    'em_moderacao_n2',
      devolvido_n1:  'em_moderacao_n1',
      corrigido:     'corrigido',
      nao_corrigido: 'nao_corrigido',
      reaberto:      'em_moderacao_n1',
    }
    const status = novoStatus[acao]!

    // Insere movimentação
    const { data: mov } = await sb.from('plano_acao_movimentacoes').insert({
      plano_acao_id: plano.id,
      usuario_id: user?.id ?? null,
      acao,
      observacao: dados.observacao,
    }).select('id').single()

    // Upload e registro de evidências da movimentação
    if (mov) {
      const evidencias: { movimentacao_id: string; tipo: string; url: string }[] = []
      for (let i = 0; i < dados.fotos.length; i++) {
        const f = dados.fotos[i]
        const ext = f.file.name.split('.').pop() ?? 'jpg'
        const path = `planos/${plano.id}/mov_${mov.id}_foto_${i}.${ext}`
        const { error } = await sb.storage.from('execucoes').upload(path, f.file, { contentType: f.file.type, upsert: true })
        if (!error) {
          registrarUsoArmazenamento(empresaAtiva?.id, 'execucao', f.file.size)
          const { data: { publicUrl } } = sb.storage.from('execucoes').getPublicUrl(path)
          evidencias.push({ movimentacao_id: mov.id, tipo: 'foto', url: publicUrl })
        }
      }
      if (dados.video) {
        const ext = dados.video.file.name.split('.').pop() ?? 'mp4'
        const path = `planos/${plano.id}/mov_${mov.id}_video.${ext}`
        const { error } = await sb.storage.from('execucoes').upload(path, dados.video.file, { contentType: dados.video.file.type, upsert: true })
        if (!error) {
          registrarUsoArmazenamento(empresaAtiva?.id, 'execucao', dados.video.file.size)
          const { data: { publicUrl } } = sb.storage.from('execucoes').getPublicUrl(path)
          evidencias.push({ movimentacao_id: mov.id, tipo: 'video', url: publicUrl })
        }
      }
      if (evidencias.length > 0) {
        await sb.from('plano_acao_movimentacao_evidencias').insert(evidencias)
      }
    }

    // Atualiza status do plano
    await sb.from('planos_acao').update({ status }).eq('id', plano.id)

    // Notifica via WhatsApp/Email quando escalado (N2) ou devolvido (N1) — fire-and-forget
    if (acao === 'enviado_n2' || acao === 'devolvido_n1') {
      const { data: perfil } = await sb.from('usuarios').select('nome').eq('id', user?.id ?? '').single()
      const ator_nome = perfil?.nome ?? (acao === 'enviado_n2' ? 'Moderador N1' : 'Moderador N2')
      if (acao === 'enviado_n2') {
        notificarPlanoEnviadoN2({ plano_id: plano.id, observacao: dados.observacao, ator_nome })
      } else {
        notificarPlanoDevolvidoN1({ plano_id: plano.id, observacao: dados.observacao, ator_nome })
      }
    }

    setSalvando(false)
    setModalAcao(null)
    await carregar()
  }

  // ─── Botões disponíveis por papel + status ──────────────────────────────────

  function botoesDisponiveis(): { acao: Acao; label: string; cor: string; corBtn: string }[] {
    if (!plano) return []
    const { status } = plano
    const botoes: { acao: Acao; label: string; cor: string; corBtn: string }[] = []

    // Admin do sistema tem acesso total (equivalente a N2)
    const isN1 = isAdmin || funcaoUsuario === 'nivel_1' || funcaoUsuario === 'nivel_2'
    const isN2 = isAdmin || funcaoUsuario === 'nivel_2'
    const isTerminal = status === 'corrigido' || status === 'nao_corrigido'

    if (status === 'em_moderacao_n1' && isN1) {
      botoes.push({ acao: 'corrigido',     label: 'Marcar como corrigido',    cor: 'text-green-600 border-green-200 hover:bg-green-50',  corBtn: 'bg-green-500 hover:bg-green-600' })
      botoes.push({ acao: 'nao_corrigido', label: 'Marcar como não corrigido',cor: 'text-red-600 border-red-200 hover:bg-red-50',        corBtn: 'bg-red-500 hover:bg-red-600' })
      botoes.push({ acao: 'enviado_n2',    label: 'Enviar para N2',            cor: 'text-orange-600 border-orange-200 hover:bg-orange-50', corBtn: 'bg-orange-500 hover:bg-orange-600' })
    }
    if (status === 'em_moderacao_n2' && isN2) {
      botoes.push({ acao: 'corrigido',     label: 'Marcar como corrigido',    cor: 'text-green-600 border-green-200 hover:bg-green-50',  corBtn: 'bg-green-500 hover:bg-green-600' })
      botoes.push({ acao: 'nao_corrigido', label: 'Marcar como não corrigido',cor: 'text-red-600 border-red-200 hover:bg-red-50',        corBtn: 'bg-red-500 hover:bg-red-600' })
      botoes.push({ acao: 'devolvido_n1',  label: 'Devolver para N1',          cor: 'text-amber-600 border-amber-200 hover:bg-amber-50',  corBtn: 'bg-amber-500 hover:bg-amber-600' })
    }
    if (isTerminal && isN1) {
      botoes.push({ acao: 'reaberto', label: 'Reabrir plano', cor: 'text-blue-600 border-blue-200 hover:bg-blue-50', corBtn: 'bg-blue-500 hover:bg-blue-600' })
    }

    return botoes
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={24} className="animate-spin text-gray-300" />
    </div>
  )

  if (!plano) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-sm text-gray-400">Plano de ação não encontrado.</p>
    </div>
  )

  const cfg = STATUS_CONFIG[plano.status]
  const botoes = botoesDisponiveis()
  const checklist = (plano.checklist_execucoes as any)?.checklists?.nome ?? '—'
  const execucaoId = (plano.checklist_execucoes as any)?.id ?? plano.checklist_execucao_id

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/gestao/planos-acao')}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-bold text-gray-800 text-base leading-tight truncate">
              {plano.checklist_atividades?.nome ?? 'Plano de Ação'}
            </h1>
            {plano.identificador && (
              <span className="text-xs font-mono font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg tracking-wide flex-shrink-0">
                {plano.identificador}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {plano.subgrupos?.nome} · {checklist}
          </p>
        </div>
      </div>

      {/* Card de status */}
      <div className={`border rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3 ${cfg.cor}`}>
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <cfg.Icon size={15} />{cfg.label}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-70">{formatarData(plano.created_at)}</span>
        </div>
      </div>

      {/* Evidências da abertura */}
      {plano.plano_acao_evidencias.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Evidências da abertura</p>
          <div className="grid grid-cols-3 gap-2">
            {plano.plano_acao_evidencias
              .sort((a, b) => a.ordem - b.ordem)
              .map(ev => (
                ev.tipo === 'foto'
                  ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer">
                      <img src={ev.url} alt="" className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                    </a>
                  ) : (
                    <video key={ev.id} src={ev.url} controls className="col-span-3 w-full rounded-lg border border-gray-200 max-h-40 bg-black" />
                  )
              ))}
          </div>
        </div>
      )}

      {/* Abre a tela interativa da execução (fotos ampliáveis, vídeos, + Baixar PDF) */}
      {execucaoId && (
        <button onClick={() => router.push(`/gestao/execucoes/${execucaoId}`)}
          className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 mb-5 w-fit">
          <ExternalLink size={13} />Ver execução completa
        </button>
      )}

      {/* Causa raiz (banco + ocorrências do plano + recorrência) */}
      {plano.atividade_id && (
        <CausaRaizModeracao
          planoId={plano.id}
          atividadeId={plano.atividade_id}
          subgrupoId={plano.subgrupo_id}
          unidadeId={plano.unidade_id}
          podeEditar={(isAdmin || funcaoUsuario === 'nivel_1' || funcaoUsuario === 'nivel_2')
            && plano.status !== 'corrigido' && plano.status !== 'nao_corrigido'}
        />
      )}

      {/* Timeline de movimentações */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Histórico</p>
        <div className="space-y-3">
          {movimentacoes.map((mov, idx) => {
            const acaoCfg = ACAO_CONFIG[mov.acao]
            const isFirst = idx === 0
            return (
              <div key={mov.id} className="flex gap-3">
                {/* Linha vertical */}
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isFirst ? 'bg-gray-100' : 'bg-white border border-gray-200'
                  }`}>
                    <User size={13} className="text-gray-400" />
                  </div>
                  {idx < movimentacoes.length - 1 && (
                    <div className="w-px flex-1 bg-gray-100 mt-1 min-h-[16px]" />
                  )}
                </div>

                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-semibold ${acaoCfg.cor}`}>{acaoCfg.label}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500 font-medium">{mov.usuarios?.nome ?? '—'}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{formatarData(mov.created_at)}</span>
                  </div>

                  {mov.observacao && (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 mb-2">
                      <p className="text-xs text-gray-700 leading-relaxed">{mov.observacao}</p>
                    </div>
                  )}

                  {mov.plano_acao_movimentacao_evidencias.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {mov.plano_acao_movimentacao_evidencias.map(ev => (
                        ev.tipo === 'foto'
                          ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer">
                              <img src={ev.url} alt="" className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                            </a>
                          ) : (
                            <video key={ev.id} src={ev.url} controls className="col-span-3 w-full rounded-lg border border-gray-200 max-h-32 bg-black" />
                          )
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Botões de ação */}
      {botoes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sua ação</p>
          <div className="flex flex-col gap-2">
            {botoes.map(b => {
              const semN2 = b.acao === 'enviado_n2' && !temN2
              return (
                <div key={b.acao}>
                  <button
                    onClick={() => setModalAcao({ acao: b.acao, titulo: b.label, corBtn: b.corBtn })}
                    disabled={semN2}
                    className={`w-full py-3 text-sm font-semibold border rounded-xl flex items-center justify-center gap-2 transition-colors ${b.cor} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}>
                    {b.acao === 'corrigido'     && <CheckCircle2 size={15} />}
                    {b.acao === 'nao_corrigido' && <XCircle size={15} />}
                    {b.acao === 'enviado_n2'    && <ChevronRight size={15} />}
                    {b.acao === 'devolvido_n1'  && <RotateCcw size={15} />}
                    {b.acao === 'reaberto'      && <RotateCcw size={15} />}
                    {b.label}
                  </button>
                  {semN2 && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-1.5 px-1">
                      <AlertTriangle size={12} className="flex-shrink-0" />
                      Não existe um moderador N2 configurado para o subgrupo "{plano.subgrupos?.nome ?? '—'}". Peça ao gestor para definir um N2.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal de ação */}
      {modalAcao && (
        <AcaoModal
          titulo={modalAcao.titulo}
          corBtn={modalAcao.corBtn}
          salvando={salvando}
          onClose={() => setModalAcao(null)}
          onConfirmar={dados => executarAcao(modalAcao.acao, dados)}
        />
      )}
    </div>
  )
}
