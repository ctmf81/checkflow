'use client'

import { useEffect, useState } from 'react'
import { Loader2, Package, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast, useConfirm } from '@/components/ui/feedback'

const GB = 1024 * 1024 * 1024

interface Plano {
  id: string
  nome: string
  tipo: 'gratuito' | 'trial' | 'pago'
  valor: number
  ciclo: 'mensal' | 'anual' | null
  dias_trial: number | null
  limite_execucoes_mes: number | null
  limite_armazenamento_bytes: number | null
  limite_tokens_ia_mes: number | null
}

interface RecursoUso { usado: number; limite: number | null; extra: number }
interface Status {
  plano_nome: string
  plano_tipo: string
  status: string
  valor: number
  ciclo: string | null
  periodo_inicio: string
  periodo_fim: string
  trial_fim: string | null
  execucoes: RecursoUso
  tokens_ia: RecursoUso
  armazenamento: RecursoUso
}

function fmtDate(d: Date) { return d.toISOString().slice(0, 10) }
function dataBR(s: string | null) { return s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—' }
function moeda(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

function Barra({ label, uso }: { label: string; uso: RecursoUso; formato?: (n: number) => string }) {
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

export function AssinaturaEmpresa({ empresaId }: { empresaId: string }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [planos, setPlanos] = useState<Plano[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [jaUsouTrial, setJaUsouTrial] = useState(false)
  const [loading, setLoading] = useState(true)
  const [planoSel, setPlanoSel] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setLoading(true)
    const sb = createClient()
    const [{ data: ps }, { data: st }, { data: raw }] = await Promise.all([
      sb.from('planos').select('id, nome, tipo, valor, ciclo, dias_trial, limite_execucoes_mes, limite_armazenamento_bytes, limite_tokens_ia_mes')
        .eq('ativo', true).order('ordem'),
      sb.rpc('billing_status', { p_empresa_id: empresaId }),
      sb.from('empresa_assinaturas').select('ja_usou_trial').eq('empresa_id', empresaId).maybeSingle(),
    ])
    setPlanos((ps ?? []) as Plano[])
    setStatus((st as Status) ?? null)
    setJaUsouTrial(!!raw?.ja_usou_trial)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [empresaId])

  async function atribuir() {
    const plano = planos.find(p => p.id === planoSel)
    if (!plano) { toast.error('Selecione um plano.'); return }

    if (plano.tipo === 'trial' && jaUsouTrial) {
      const ok = await confirm({
        titulo: 'Esta empresa já usou o período de teste',
        mensagem: 'Atribuir um plano de teste novamente vai reiniciar o trial. Deseja continuar?',
        confirmarLabel: 'Reiniciar trial',
      })
      if (!ok) return
    } else {
      const ok = await confirm({
        titulo: `Definir o plano "${plano.nome}" para esta empresa?`,
        mensagem: 'Os termos do plano (preço e limites) serão congelados na assinatura. Os contadores de uso do período serão reiniciados.',
        confirmarLabel: 'Definir plano',
      })
      if (!ok) return
    }

    setSalvando(true)
    const hoje = new Date()
    const periodoFim = new Date(hoje); periodoFim.setMonth(periodoFim.getMonth() + 1)
    const ehTrial = plano.tipo === 'trial'
    const trialFim = ehTrial && plano.dias_trial
      ? (() => { const d = new Date(hoje); d.setDate(d.getDate() + plano.dias_trial!); return fmtDate(d) })()
      : null

    const payload = {
      empresa_id: empresaId,
      plano_id: plano.id,
      plano_nome: plano.nome,
      plano_tipo: plano.tipo,
      valor: plano.valor,
      ciclo: plano.ciclo,
      limite_execucoes_mes: plano.limite_execucoes_mes,
      limite_armazenamento_bytes: plano.limite_armazenamento_bytes,
      limite_tokens_ia_mes: plano.limite_tokens_ia_mes,
      status: ehTrial ? 'trial' : 'ativo',
      periodo_inicio: fmtDate(hoje),
      periodo_fim: fmtDate(periodoFim),
      execucoes_usadas: 0, tokens_ia_usados: 0, execucoes_extra: 0, tokens_ia_extra: 0,
      trial_fim: trialFim,
      ja_usou_trial: jaUsouTrial || ehTrial,
      proximo_plano_id: null, troca_efetiva_em: null,
      atualizado_em: new Date().toISOString(),
    }

    const { error } = await createClient().from('empresa_assinaturas').upsert(payload, { onConflict: 'empresa_id' })
    setSalvando(false)
    if (error) { toast.error(`Erro ao definir plano: ${error.message}`); return }
    toast.success('Plano definido.')
    setPlanoSel('')
    carregar()
  }

  if (loading) return <div className="py-10 text-center text-sm text-gray-400">Carregando...</div>

  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-gray-700">Plano & Assinatura</h2>

      {status ? (
        <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">{status.plano_nome}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{status.plano_tipo}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{status.status}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {status.plano_tipo === 'pago' ? `${moeda(Number(status.valor))} / ${status.ciclo === 'anual' ? 'ano' : 'mês'}` : status.plano_tipo === 'trial' ? `Teste até ${dataBR(status.trial_fim)}` : 'Grátis'}
                {' · '}Período: {dataBR(status.periodo_inicio)} → {dataBR(status.periodo_fim)}
              </p>
            </div>
          </div>
          <div className="space-y-2.5 pt-1">
            <Barra label="Execuções (mês)" uso={status.execucoes} />
            <Barra label="Tokens de IA (mês)" uso={status.tokens_ia} />
            <Barra label="Armazenamento" uso={status.armazenamento} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center">
          <Package size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Esta empresa ainda não tem um plano definido.</p>
        </div>
      )}

      <div className="pt-2 border-t border-gray-100">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {status ? 'Trocar plano' : 'Definir plano'}
        </label>
        <div className="flex gap-2">
          <select value={planoSel} onChange={e => setPlanoSel(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
            <option value="">Selecione um plano…</option>
            {planos.map(p => (
              <option key={p.id} value={p.id}>
                {p.nome} ({p.tipo}{p.tipo === 'pago' ? ` · ${moeda(Number(p.valor))}/${p.ciclo === 'anual' ? 'ano' : 'mês'}` : ''})
              </option>
            ))}
          </select>
          <Button size="sm" onClick={atribuir} disabled={salvando || !planoSel}>
            {salvando ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> : <><Check size={14} /> Aplicar</>}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">A troca é imediata e congela os termos do plano na assinatura. O ajuste de cobrança via Asaas (pro-rata) será tratado na integração de pagamento.</p>
      </div>
    </div>
  )
}
