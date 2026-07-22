'use client'

import { useEffect, useRef, useState } from 'react'
import { Package, Boxes, Loader2, Check, ExternalLink, ShieldAlert, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Button } from '@/components/ui/Button'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'
const ADMIN_EMPRESA_ID = '00000000-0000-0000-0000-000000000002'
const GB = 1024 * 1024 * 1024

type BillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD'

interface RecursoUso { usado: number; limite: number | null; extra: number }
interface Status {
  plano_nome: string; plano_tipo: string; status: string; valor: number; ciclo: string | null
  periodo_inicio: string; periodo_fim: string; trial_fim: string | null; vencido_em: string | null
  proximo_plano_id: string | null; troca_efetiva_em: string | null
  execucoes: RecursoUso; tokens_ia: RecursoUso; armazenamento: RecursoUso
}
interface Plano {
  id: string; nome: string; descricao: string | null; tipo: string; valor: number; ciclo: string | null
  limite_execucoes_mes: number | null; limite_armazenamento_bytes: number | null; limite_tokens_ia_mes: number | null
}
interface Pacote { id: string; nome: string; descricao: string | null; tipo: string; quantidade: number; valor: number }
interface Cobranca { id: string; tipo: string; descricao: string | null; valor: number; status: string; vencimento: string | null; invoice_url: string | null; criado_em: string }

function moeda(v: number) { return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function dataBR(s: string | null) { return s ? new Date(s.length > 10 ? s : s + 'T00:00:00').toLocaleDateString('pt-BR') : '—' }

function Barra({ label, uso }: { label: string; uso: RecursoUso }) {
  const fmt = label === 'Armazenamento'
    ? (n: number) => `${+(n / GB).toFixed(2)} GB`
    : (n: number) => n.toLocaleString('pt-BR')
  const total = uso.limite == null ? null : uso.limite + uso.extra
  const pct = total ? Math.min(100, Math.round((uso.usado / total) * 100)) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-500">
          {fmt(uso.usado)} {total == null ? '/ ∞' : `/ ${fmt(total)}`}
          {uso.extra > 0 && <span className="text-green-600"> (+{fmt(uso.extra)} extra)</span>}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-orange-500'}`}
          style={{ width: total == null ? '0%' : `${pct}%` }} />
      </div>
    </div>
  )
}

export default function PlanoPage() {
  const { empresaAtiva } = useSession()
  const toast = useToast()
  const confirm = useConfirm()
  const [autorizado, setAutorizado] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Status | null>(null)
  const [assinaturaAtual, setAssinaturaAtual] = useState<{ plano_id: string | null; status: string; pendente_plano_id?: string | null; cancelar_em?: string | null } | null>(null)
  const [planos, setPlanos] = useState<Plano[]>([])
  const [pacotes, setPacotes] = useState<Pacote[]>([])
  const [servicos, setServicos] = useState<{ id: string; nome: string; descricao: string | null; padrao: boolean }[]>([])
  const [planoServicos, setPlanoServicos] = useState<Map<string, Set<string>>>(new Map())
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([])
  const [billingType, setBillingType] = useState<BillingType>('PIX')
  const [acaoEmProgresso, setAcaoEmProgresso] = useState<string | null>(null)
  const [faturaUrl, setFaturaUrl] = useState<string | null>(null)
  // Detecta a transição "aguardando pagamento" → confirmado para dar um toast
  // (o polling silencioso não avisaria; o banner só sumiria). Guarda por empresa
  // pra não disparar toast falso ao trocar de empresa.
  const pendenteAntesRef = useRef<{ emp?: string; pend: string | null }>({ pend: null })

  async function token(): Promise<string | null> {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token ?? null
  }

  async function verificarPermissao(): Promise<boolean> {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user || !empresaAtiva?.id) return false
    if (user.app_metadata?.role === 'admin_sistema') return true
    const { data } = await sb.from('usuario_empresa').select('perfil_id')
      .eq('usuario_id', user.id).eq('empresa_id', empresaAtiva.id).maybeSingle()
    return data?.perfil_id === ADMIN_EMPRESA_ID
  }

  async function carregar(opts?: { silent?: boolean }) {
    const silent = !!opts?.silent
    if (!empresaAtiva?.id) { if (!silent) setLoading(false); return }
    if (!silent) setLoading(true)
    const ok = await verificarPermissao()
    setAutorizado(ok)
    if (!ok) { if (!silent) setLoading(false); return }

    const sb = createClient()
    const [{ data: st, error: stErr }, { data: assin }, { data: ps }, { data: pks }, { data: cbs }] = await Promise.all([
      sb.rpc('billing_status', { p_empresa_id: empresaAtiva.id }),
      sb.from('empresa_assinaturas').select('plano_id, status, pendente_plano_id, cancelar_em').eq('empresa_id', empresaAtiva.id).maybeSingle(),
      sb.from('planos').select('id, nome, descricao, tipo, valor, ciclo, limite_execucoes_mes, limite_armazenamento_bytes, limite_tokens_ia_mes').eq('ativo', true).eq('selecionavel_empresa', true).order('ordem'),
      sb.from('pacotes_adicionais').select('id, nome, descricao, tipo, quantidade, valor').eq('ativo', true).order('ordem'),
      sb.from('empresa_cobrancas').select('id, tipo, descricao, valor, status, vencimento, invoice_url, criado_em').eq('empresa_id', empresaAtiva.id).order('criado_em', { ascending: false }).limit(10),
    ])
    if (stErr) toast.error('Não foi possível carregar os dados do plano.')
    setStatus((st as Status) ?? null)

    // Transição pendente→confirmado: avisa que o plano ativou (só na mesma empresa).
    const novoPendente = (assin as any)?.pendente_plano_id ?? null
    const antes = pendenteAntesRef.current
    if (antes.emp === empresaAtiva.id && antes.pend && !novoPendente) {
      toast.success('Pagamento confirmado! Seu plano já está ativo. 🎉')
    }
    pendenteAntesRef.current = { emp: empresaAtiva.id, pend: novoPendente }

    setAssinaturaAtual((assin as any) ?? null)
    setPlanos((ps ?? []) as Plano[])
    setPacotes((pks ?? []) as Pacote[])

    // Comparação de serviços por plano
    const planoIds = (ps ?? []).map((p: any) => p.id)
    if (planoIds.length) {
      const [{ data: svc }, { data: psv }] = await Promise.all([
        sb.from('servicos').select('id, nome, descricao, padrao').eq('ativo', true).order('ordem'),
        sb.from('plano_servicos').select('plano_id, servico_id').in('plano_id', planoIds),
      ])
      setServicos(svc ?? [])
      const m = new Map<string, Set<string>>()
      for (const r of (psv ?? []) as any[]) {
        if (!m.has(r.plano_id)) m.set(r.plano_id, new Set())
        m.get(r.plano_id)!.add(r.servico_id)
      }
      setPlanoServicos(m)
    }
    setCobrancas((cbs ?? []) as Cobranca[])
    if (!silent) setLoading(false)
  }

  useEffect(() => { carregar() }, [empresaAtiva?.id])

  // Enquanto há pagamento pendente, atualiza sozinho até o webhook confirmar
  // (o plano ativa) — sem precisar de refresh manual. Silencioso (não pisca o
  // spinner). Cap de ~5 min de polling ativo pra não rodar indefinidamente numa
  // aba esquecida aberta; o refetch ao voltar o foco (abaixo) cobre o resto.
  useEffect(() => {
    if (!assinaturaAtual?.pendente_plano_id) return
    let n = 0
    const iv = setInterval(() => {
      if (++n > 30) { clearInterval(iv); return }
      carregar({ silent: true })
    }, 10000)
    return () => clearInterval(iv)
  }, [assinaturaAtual?.pendente_plano_id, empresaAtiva?.id])

  // Ao voltar para esta aba (ex.: depois de pagar na aba do Asaas), refaz a leitura.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') carregar({ silent: true }) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [empresaAtiva?.id])

  // Trava de downgrade: estando num plano PAGO ativo, a empresa não pode voltar
  // a um não-pago por conta própria (só o admin faz). Os selecionáveis não-pagos
  // somem da lista de auto-serviço nesse caso.
  const estaEmPago = status?.plano_tipo === 'pago' && status?.status === 'ativo'
  const planosVisiveis = planos.filter(p => !estaEmPago || p.tipo === 'pago')

  // Assinatura aguardando o 1º pagamento (fluxo pendente→pago). Sobrevive a reload
  // porque vem de empresa_assinaturas.pendente_plano_id.
  const pendentePlanoId = assinaturaAtual?.pendente_plano_id ?? null
  const planoPendente = pendentePlanoId ? (planos.find(p => p.id === pendentePlanoId) ?? null) : null
  const faturaPendenteUrl = pendentePlanoId
    ? (cobrancas.find(c => c.tipo === 'assinatura' && ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'].includes(c.status) && !!c.invoice_url)?.invoice_url ?? faturaUrl)
    : null

  // Cancelamento agendado para o fim do período (assinatura paga ativa).
  const cancelarEm = assinaturaAtual?.cancelar_em ?? null

  // Inadimplência: fatura recorrente vencida. Corte para somente-leitura em
  // vencido_em + 7 dias (mesma regra da fase no banco).
  const inadimplente = status?.status === 'inadimplente' && !!status?.vencido_em
  const corteReadonlyEm = inadimplente ? new Date(new Date(status!.vencido_em! + 'T00:00:00').getTime() + 7 * 86400000) : null
  const jaSomenteLeitura = corteReadonlyEm ? corteReadonlyEm.getTime() <= Date.now() : false
  const faturaVencidaUrl = inadimplente ? (cobrancas.find(c => c.status === 'OVERDUE' && !!c.invoice_url)?.invoice_url ?? null) : null

  async function assinar(plano: Plano) {
    if (!empresaAtiva?.id) return

    const trocaEntrePagos = status?.plano_tipo === 'pago' && status.status === 'ativo'
    const metodoPag = billingType === 'CREDIT_CARD' ? 'Cartão de crédito' : 'PIX'
    const ok = await confirm({
      titulo: trocaEntrePagos ? `Trocar para o plano "${plano.nome}"?` : `Assinar o plano "${plano.nome}"?`,
      mensagem: trocaEntrePagos
        ? `A troca passa a valer no fim do período atual (${dataBR(status?.periodo_fim ?? null)}). Até lá seu plano atual continua; a próxima cobrança virá em ${moeda(plano.valor)}/${plano.ciclo === 'anual' ? 'ano' : 'mês'}.`
        : `Forma de pagamento: ${metodoPag}. Será gerada uma cobrança recorrente de ${moeda(plano.valor)}/${plano.ciclo === 'anual' ? 'ano' : 'mês'} no Asaas. O plano é ativado assim que o pagamento for confirmado.`,
      confirmarLabel: trocaEntrePagos ? 'Agendar troca' : 'Assinar',
    })
    if (!ok) return

    setAcaoEmProgresso('plano-' + plano.id)
    const t = await token()
    try {
      const res = await fetch(`${API_URL}/billing/assinar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ empresaId: empresaAtiva.id, planoId: plano.id, billingType }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { toast.error(json?.error ?? 'Falha ao assinar.'); return }
      if (json?.agendado) {
        toast.success(`Troca agendada para ${dataBR(json.efetivaEm)}. O plano novo passa a valer no fim do período atual.`)
      } else {
        // Reflete o estado "aguardando pagamento" NA HORA (banner + botões Assinar
        // desabilitam) ANTES de abrir a aba do Asaas — que joga esta aba pro fundo
        // e atrasaria o re-render do reload.
        setAssinaturaAtual(prev => ({
          plano_id: prev?.plano_id ?? null,
          status: prev?.status ?? 'trial',
          cancelar_em: prev?.cancelar_em ?? null,
          pendente_plano_id: plano.id,
        }))
        if (json?.invoiceUrl) { setFaturaUrl(json.invoiceUrl); window.open(json.invoiceUrl, '_blank', 'noopener') }
        toast.success('Fatura gerada. O plano é ativado assim que o pagamento for confirmado.')
      }
      carregar()
    } catch {
      toast.error('Erro de conexão com o serviço de pagamento.')
    } finally {
      setAcaoEmProgresso(null)
    }
  }

  async function cancelarPendente() {
    if (!empresaAtiva?.id) return
    const ok = await confirm({
      titulo: 'Cancelar pagamento pendente?',
      mensagem: 'A cobrança em aberto será cancelada e você poderá assinar de novo escolhendo outra forma de pagamento.',
      confirmarLabel: 'Cancelar cobrança',
    })
    if (!ok) return
    setAcaoEmProgresso('cancelar-pendente')
    const t = await token()
    try {
      const res = await fetch(`${API_URL}/billing/cancelar-pendente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ empresaId: empresaAtiva.id }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { toast.error(json?.error ?? 'Falha ao cancelar.'); return }
      setFaturaUrl(null)
      toast.success('Cobrança cancelada. Escolha a forma de pagamento e assine novamente.')
      carregar()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setAcaoEmProgresso(null)
    }
  }

  async function cancelarAssinatura() {
    if (!empresaAtiva?.id) return
    const ok = await confirm({
      titulo: 'Cancelar assinatura?',
      mensagem: `As cobranças futuras são interrompidas. Você continua com acesso até o fim do período já pago (${dataBR(status?.periodo_fim ?? null)}); depois disso o sistema fica em modo somente-leitura até você assinar de novo.`,
      confirmarLabel: 'Cancelar assinatura',
    })
    if (!ok) return
    setAcaoEmProgresso('cancelar-assinatura')
    const t = await token()
    try {
      const res = await fetch(`${API_URL}/billing/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ empresaId: empresaAtiva.id }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { toast.error(json?.error ?? 'Falha ao cancelar.'); return }
      toast.success(`Assinatura cancelada. Acesso garantido até ${dataBR(json?.efetivaEm ?? null)}.`)
      carregar()
    } catch { toast.error('Erro de conexão.') } finally { setAcaoEmProgresso(null) }
  }

  async function reativarAssinatura() {
    if (!empresaAtiva?.id) return
    setAcaoEmProgresso('reativar-assinatura')
    const t = await token()
    try {
      const res = await fetch(`${API_URL}/billing/reativar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ empresaId: empresaAtiva.id, billingType }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { toast.error(json?.error ?? 'Falha ao reativar.'); return }
      toast.success('Assinatura reativada. A recorrência continua a partir do próximo período.')
      carregar()
    } catch { toast.error('Erro de conexão.') } finally { setAcaoEmProgresso(null) }
  }

  async function comprarPacote(pacote: Pacote) {
    if (!empresaAtiva?.id) return
    setAcaoEmProgresso('pacote-' + pacote.id)
    const t = await token()
    try {
      const res = await fetch(`${API_URL}/billing/comprar-pacote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ empresaId: empresaAtiva.id, pacoteId: pacote.id, billingType }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { toast.error(json?.error ?? 'Falha ao gerar cobrança.'); return }
      if (json?.invoiceUrl) window.open(json.invoiceUrl, '_blank', 'noopener')
      toast.success('Cobrança gerada. O recurso é liberado após a confirmação do pagamento.')
      carregar()
    } catch {
      toast.error('Erro de conexão com o serviço de pagamento.')
    } finally {
      setAcaoEmProgresso(null)
    }
  }

  const cfg = getOnboardingConfig('gestao-plano')

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <ShieldAlert size={40} className="text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma empresa selecionada</p>
    </div>
  )

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  if (autorizado === false) {
    return (
      <div className="py-16 text-center">
        <ShieldAlert size={40} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-600 font-medium">Acesso restrito</p>
        <p className="text-xs text-gray-400 mt-1">Apenas o administrador da empresa pode ver e gerenciar o plano.</p>
      </div>
    )
  }

  const labelBilling: Record<BillingType, string> = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de crédito' }

  return (
    <div className="max-w-3xl">
      {cfg && <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Plano & Assinatura</h1>
        <p className="hidden sm:block text-sm text-gray-500 mt-0.5">Acompanhe seu uso, troque de plano e compre pacotes adicionais.</p>
      </div>

      {/* Fatura gerada — fallback caso o popup tenha sido bloqueado */}
      {faturaUrl && (
        <div className="mb-5 flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-2.5">
          <span className="flex-1">Fatura gerada. Se a aba não abriu, <a href={faturaUrl} target="_blank" rel="noreferrer" className="font-semibold underline">abra a fatura aqui</a>.</span>
          <button onClick={() => setFaturaUrl(null)} className="text-blue-400 hover:text-blue-700">✕</button>
        </div>
      )}

      {/* Inadimplência — fatura vencida, aviso de corte para somente-leitura */}
      {inadimplente && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-900">
                {jaSomenteLeitura ? 'Fatura vencida — sistema em modo somente-leitura.' : 'Fatura vencida.'}
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                {jaSomenteLeitura
                  ? 'A criação de novos itens está bloqueada até o pagamento ser confirmado. O que já existe continua acessível normalmente.'
                  : <>Regularize até <b>{corteReadonlyEm?.toLocaleDateString('pt-BR')}</b> para não perder o acesso de edição — depois disso o sistema fica somente-leitura até o pagamento ser confirmado.</>}
              </p>
              {faturaVencidaUrl && (
                <a href={faturaVencidaUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-red-800 hover:text-red-900 mt-2">
                  <ExternalLink size={13} /> Pagar fatura
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plano atual + uso */}
      {status ? (
        <div className="rounded-xl border border-gray-200 p-5 bg-white space-y-3 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800">{status.plano_nome}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{status.plano_tipo}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{status.status}</span>
          </div>
          <p className="text-xs text-gray-500">
            {status.plano_tipo === 'pago' ? `${moeda(status.valor)} / ${status.ciclo === 'anual' ? 'ano' : 'mês'}` : status.plano_tipo === 'trial' ? `Teste até ${dataBR(status.trial_fim)}` : 'Grátis'}
            {' · '}Período de uso: {dataBR(status.periodo_inicio)} → {dataBR(status.periodo_fim)}
          </p>
          <div className="space-y-2.5 pt-1">
            <Barra label="Execuções (mês)" uso={status.execucoes} />
            <Barra label="Tokens de IA (mês)" uso={status.tokens_ia} />
            <Barra label="Armazenamento" uso={status.armazenamento} />
          </div>
          {estaEmPago && !cancelarEm && (
            <div className="pt-3 mt-2 border-t border-gray-100">
              <button onClick={cancelarAssinatura} disabled={acaoEmProgresso === 'cancelar-assinatura'}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5 disabled:opacity-50">
                {acaoEmProgresso === 'cancelar-assinatura' && <Loader2 size={13} className="animate-spin" />}
                Cancelar assinatura
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center mb-6">
          <Package size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Sua empresa ainda não tem um plano ativo.</p>
        </div>
      )}

      {/* Aguardando o 1º pagamento (pendente→pago): reabrir fatura ou trocar forma */}
      {pendentePlanoId && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <Loader2 size={16} className="text-amber-600 animate-spin mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                Aguardando pagamento{planoPendente ? ` do plano ${planoPendente.nome}` : ''}.
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                O plano é ativado assim que o pagamento for confirmado. Pague a fatura em aberto ou troque a forma de pagamento.
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                {faturaPendenteUrl && (
                  <a href={faturaPendenteUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-900">
                    <ExternalLink size={13} /> Reabrir fatura
                  </a>
                )}
                <button onClick={cancelarPendente} disabled={acaoEmProgresso === 'cancelar-pendente'}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50">
                  {acaoEmProgresso === 'cancelar-pendente' && <Loader2 size={13} className="animate-spin" />}
                  Cancelar / trocar forma de pagamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancelamento agendado para o fim do período (reversível) */}
      {cancelarEm && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-900">Assinatura cancelada.</p>
              <p className="text-xs text-red-700 mt-0.5">
                Você mantém o acesso até <b>{dataBR(cancelarEm)}</b>. Depois disso, o sistema fica em modo somente-leitura até assinar de novo.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={reativarAssinatura} disabled={acaoEmProgresso === 'reativar-assinatura'}>
              {acaoEmProgresso === 'reativar-assinatura' && <Loader2 size={13} className="animate-spin" />} Reativar assinatura
            </Button>
          </div>
        </div>
      )}

      {/* Troca de plano agendada */}
      {status?.proximo_plano_id && status.troca_efetiva_em && (
        <div className="mb-5 text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-2.5">
          Troca de plano agendada para <b>{dataBR(status.troca_efetiva_em)}</b>
          {(() => { const p = planos.find(pl => pl.id === status.proximo_plano_id); return p ? <> → <b>{p.nome}</b></> : null })()}
          . Até lá, seu plano atual continua valendo.
        </div>
      )}

      {/* Forma de pagamento */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xs text-gray-500">Forma de pagamento:</span>
        {(['PIX', 'CREDIT_CARD'] as BillingType[]).map(bt => (
          <button key={bt} onClick={() => setBillingType(bt)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              billingType === bt ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}>
            {labelBilling[bt]}
          </button>
        ))}
      </div>

      {/* Planos disponíveis para contratação autônoma */}
      {planosVisiveis.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Planos disponíveis</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {planosVisiveis.map(p => (
              <div key={p.id} className={`rounded-xl border p-4 ${pendentePlanoId === p.id ? 'border-amber-300 ring-2 ring-amber-200 bg-amber-50/40' : `border-gray-200 bg-white ${(pendentePlanoId || cancelarEm) ? 'opacity-60' : ''}`}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold text-gray-800">{p.nome}</h3>
                  <span className="text-sm font-semibold text-gray-700">{moeda(p.valor)}<span className="text-xs text-gray-400 font-normal">/{p.ciclo === 'anual' ? 'ano' : 'mês'}</span></span>
                </div>
                {pendentePlanoId === p.id && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    <Loader2 size={10} className="animate-spin" /> Aguardando pagamento
                  </span>
                )}
                {p.descricao && <p className="text-xs text-gray-500 mt-1">{p.descricao}</p>}
                <ul className="text-xs text-gray-500 mt-2 space-y-0.5">
                  <li>Execuções/mês: {p.limite_execucoes_mes == null ? 'Ilimitado' : p.limite_execucoes_mes.toLocaleString('pt-BR')}</li>
                  <li>Armazenamento: {p.limite_armazenamento_bytes == null ? 'Ilimitado' : `${+(p.limite_armazenamento_bytes / GB).toFixed(2)} GB`}</li>
                  <li>Tokens IA/mês: {p.limite_tokens_ia_mes == null ? 'Ilimitado' : p.limite_tokens_ia_mes.toLocaleString('pt-BR')}</li>
                </ul>
                {assinaturaAtual?.plano_id === p.id && assinaturaAtual.status === 'ativo' ? (
                  <Button size="sm" variant="outline" className="w-full justify-center mt-3" disabled>
                    <Check size={14} /> Plano atual
                  </Button>
                ) : (
                  <Button size="sm" className="w-full justify-center mt-3" onClick={() => assinar(p)} disabled={acaoEmProgresso === 'plano-' + p.id || !!pendentePlanoId || !!cancelarEm}>
                    {acaoEmProgresso === 'plano-' + p.id
                      ? <><Loader2 size={13} className="animate-spin" /> Processando…</>
                      : pendentePlanoId
                        ? <>Aguardando pagamento…</>
                        : assinaturaAtual?.plano_id && assinaturaAtual.status === 'ativo'
                          ? <><Check size={14} /> Trocar para este</>
                          : <><Check size={14} /> Assinar</>}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Comparativo de serviços lado a lado */}
          {servicos.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <p className="text-sm font-semibold text-gray-700 mb-2">Comparativo de serviços</p>
              <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden bg-white">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-500 min-w-[180px]">Serviço</th>
                    {planosVisiveis.map(p => (
                      <th key={p.id} className="px-3 py-2 text-center font-semibold text-gray-800 whitespace-nowrap">
                        {p.nome}<div className="text-xs font-normal text-gray-400">{moeda(p.valor)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {servicos.map(s => (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-700">
                        <span className="font-medium">{s.nome}</span>
                        {s.padrao && <span className="ml-1 text-xs text-green-600">(incluído)</span>}
                        {s.descricao && <span className="block text-xs text-gray-400">{s.descricao}</span>}
                      </td>
                      {planosVisiveis.map(p => (
                        <td key={p.id} className="px-3 py-2 text-center">
                          {s.padrao || planoServicos.get(p.id)?.has(s.id)
                            ? <Check className="inline text-green-500" size={16} />
                            : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {[
                    { label: 'Execuções/mês', val: (p: Plano) => p.limite_execucoes_mes == null ? '∞' : p.limite_execucoes_mes.toLocaleString('pt-BR') },
                    { label: 'Armazenamento', val: (p: Plano) => p.limite_armazenamento_bytes == null ? '∞' : `${+(p.limite_armazenamento_bytes / GB).toFixed(0)} GB` },
                    { label: 'Tokens IA/mês', val: (p: Plano) => p.limite_tokens_ia_mes == null ? '∞' : p.limite_tokens_ia_mes.toLocaleString('pt-BR') },
                  ].map(row => (
                    <tr key={row.label} className="border-t border-gray-100 bg-gray-50/60">
                      <td className="px-3 py-2 font-medium text-gray-700">{row.label}</td>
                      {planosVisiveis.map(p => <td key={p.id} className="px-3 py-2 text-center text-gray-600">{row.val(p)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pacotes */}
      {pacotes.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Pacotes adicionais</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {pacotes.map(p => (
              <div key={p.id} className="rounded-xl border border-gray-200 p-4 bg-white flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Boxes size={15} className="text-gray-400 flex-shrink-0" />
                    <h3 className="font-semibold text-gray-800 text-sm truncate">{p.nome}</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{moeda(p.valor)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => comprarPacote(p)} disabled={acaoEmProgresso === 'pacote-' + p.id}>
                  {acaoEmProgresso === 'pacote-' + p.id ? <Loader2 size={13} className="animate-spin" /> : 'Comprar'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cobranças */}
      {cobrancas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Cobranças recentes</h2>
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-50">
            {cobrancas.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-700 truncate">{c.descricao ?? c.tipo}</p>
                  <p className="text-xs text-gray-400">{dataBR(c.criado_em)} · venc. {dataBR(c.vencimento)}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-600">{moeda(c.valor)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(c.status) ? 'bg-green-50 text-green-600' : c.status === 'OVERDUE' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{c.status}</span>
                  {c.invoice_url && (
                    <a href={c.invoice_url} target="_blank" rel="noreferrer" className="text-orange-500 hover:text-orange-600"><ExternalLink size={14} /></a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
