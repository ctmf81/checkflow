'use client'

import { useEffect, useState } from 'react'
import { Plus, Package, Pencil, Trash2, Loader2, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

type TipoPlano = 'gratuito' | 'trial' | 'pago' | 'cortesia'
type Ciclo = 'mensal' | 'anual'

interface Plano {
  id: string
  nome: string
  descricao: string | null
  tipo: TipoPlano
  valor: number
  ciclo: Ciclo | null
  dias_trial: number | null
  limite_execucoes_mes: number | null
  limite_armazenamento_bytes: number | null
  limite_tokens_ia_mes: number | null
  ativo: boolean
  ordem: number
  padrao: boolean
  selecionavel_empresa: boolean
}

const GB = 1024 * 1024 * 1024

const TIPO_LABEL: Record<TipoPlano, string> = {
  gratuito: 'Gratuito',
  trial: 'Teste (trial)',
  pago: 'Pago',
  cortesia: 'Cortesia',
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function limiteLabel(v: number | null, sufixo = '') {
  return v == null ? 'Ilimitado' : `${v.toLocaleString('pt-BR')}${sufixo}`
}

function bytesParaGb(b: number | null): string {
  if (b == null) return ''
  return String(+(b / GB).toFixed(2))
}

export default function PlanosPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Plano | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  async function carregar() {
    setLoading(true)
    const { data } = await createClient().from('planos')
      .select('*').order('ordem', { ascending: true }).order('nome')
    setPlanos((data ?? []) as Plano[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() { setEditando(null); setModalAberto(true) }
  function abrirEdicao(p: Plano) { setEditando(p); setModalAberto(true) }

  async function excluir(p: Plano) {
    const ok = await confirm({
      titulo: `Excluir o plano "${p.nome}"?`,
      mensagem: 'Esta ação não pode ser desfeita. Empresas que já assinaram este plano não são afetadas (os termos ficam congelados na assinatura).',
      confirmarLabel: 'Excluir', perigo: true,
    })
    if (!ok) return
    const { error } = await createClient().from('planos').delete().eq('id', p.id)
    if (error) { toast.error('Erro ao excluir plano. Tente novamente.'); return }
    toast.success('Plano excluído.')
    carregar()
  }

  const cfg = getOnboardingConfig('sistema-planos')

  return (
    <>
      {cfg && <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Planos</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">
            Catálogo de planos da plataforma. Cada plano define ciclo de cobrança e limites de uso (execuções/mês, armazenamento total e tokens de IA/mês).
          </p>
        </div>
        <Button size="sm" onClick={abrirNovo}><Plus size={14} /> Novo</Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : planos.length === 0 ? (
        <div className="py-16 text-center">
          <Package size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum plano cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {planos.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-800">{p.nome}</h3>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{TIPO_LABEL[p.tipo]}</span>
                    {!p.ativo && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Inativo</span>}
                  </div>
                  {p.descricao && <p className="text-xs text-gray-500 mt-1">{p.descricao}</p>}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-2 flex-wrap">
                    {p.tipo === 'pago'
                      ? <span className="font-medium text-gray-700">{moeda(Number(p.valor))} / {p.ciclo === 'anual' ? 'ano' : 'mês'}</span>
                      : p.tipo === 'trial'
                        ? <span className="font-medium text-gray-700">{p.dias_trial ?? '—'} dias de teste</span>
                        : p.tipo === 'cortesia'
                          ? <span className="font-medium text-gray-700">Cortesia (sem cobrança)</span>
                          : <span className="font-medium text-gray-700">Grátis</span>}
                    <span>Execuções/mês: <b className="text-gray-700">{limiteLabel(p.limite_execucoes_mes)}</b></span>
                    <span>Armazenamento: <b className="text-gray-700">{p.limite_armazenamento_bytes == null ? 'Ilimitado' : `${bytesParaGb(p.limite_armazenamento_bytes)} GB`}</b></span>
                    <span>Tokens IA/mês: <b className="text-gray-700">{limiteLabel(p.limite_tokens_ia_mes)}</b></span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => abrirEdicao(p)} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
                  <button onClick={() => excluir(p)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <PlanoModal
          plano={editando}
          onClose={() => setModalAberto(false)}
          onSaved={() => { setModalAberto(false); carregar() }}
        />
      )}
    </>
  )
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function PlanoModal({ plano, onClose, onSaved }: { plano: Plano | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState(plano?.nome ?? '')
  const [descricao, setDescricao] = useState(plano?.descricao ?? '')
  const [tipo, setTipo] = useState<TipoPlano>(plano?.tipo ?? 'pago')
  const [valor, setValor] = useState(plano?.valor != null ? String(plano.valor) : '')
  const [ciclo, setCiclo] = useState<Ciclo>(plano?.ciclo ?? 'mensal')
  const [diasTrial, setDiasTrial] = useState(plano?.dias_trial != null ? String(plano.dias_trial) : '')
  const [execucoes, setExecucoes] = useState(plano?.limite_execucoes_mes != null ? String(plano.limite_execucoes_mes) : '')
  const [armazenamentoGb, setArmazenamentoGb] = useState(bytesParaGb(plano?.limite_armazenamento_bytes ?? null))
  const [tokens, setTokens] = useState(plano?.limite_tokens_ia_mes != null ? String(plano.limite_tokens_ia_mes) : '')
  const [ativo, setAtivo] = useState(plano?.ativo ?? true)
  const [padrao, setPadrao] = useState(plano?.padrao ?? false)
  const [selecionavel, setSelecionavel] = useState(plano?.selecionavel_empresa ?? false)
  const [ordem, setOrdem] = useState(plano?.ordem != null ? String(plano.ordem) : '0')
  const [servicos, setServicos] = useState<{ id: string; nome: string; tipo: string; descricao: string | null; padrao: boolean }[]>([])
  const [servicosSel, setServicosSel] = useState<Set<string>>(new Set())

  useEffect(() => {
    const sb = createClient()
    sb.from('servicos').select('id, nome, tipo, descricao, padrao').eq('ativo', true).order('ordem')
      .then(({ data }) => setServicos(data ?? []))
    if (plano) {
      sb.from('plano_servicos').select('servico_id').eq('plano_id', plano.id)
        .then(({ data }) => setServicosSel(new Set((data ?? []).map((r: any) => r.servico_id))))
    }
  }, [plano])

  // null = ilimitado (campo vazio); inteiro >= 0 caso contrário
  function numOuNull(s: string): number | null {
    const t = s.trim()
    if (t === '') return null
    const n = Number(t)
    return isNaN(n) ? null : n
  }

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome do plano.'); return }
    if (tipo === 'trial' && !diasTrial.trim()) { toast.error('Informe a duração do teste em dias.'); return }

    setSalvando(true)
    const gb = numOuNull(armazenamentoGb)
    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      tipo,
      valor: tipo === 'pago' ? Number(valor || 0) : 0,
      ciclo: tipo === 'pago' ? ciclo : null,
      dias_trial: tipo === 'trial' ? numOuNull(diasTrial) : null,
      limite_execucoes_mes: numOuNull(execucoes),
      limite_armazenamento_bytes: gb == null ? null : Math.round(gb * GB),
      limite_tokens_ia_mes: numOuNull(tokens),
      ativo,
      padrao,
      selecionavel_empresa: selecionavel,
      ordem: Number(ordem || 0),
      atualizado_em: new Date().toISOString(),
    }

    const sb = createClient()
    // Só um plano padrão: se este vira padrão, desmarca os demais antes de salvar
    // (evita violar o índice único parcial planos_padrao_unico).
    if (padrao) await sb.from('planos').update({ padrao: false }).eq('padrao', true)
    const { data: saved, error } = plano
      ? await sb.from('planos').update(payload).eq('id', plano.id).select('id').single()
      : await sb.from('planos').insert(payload).select('id').single()

    if (error || !saved) { setSalvando(false); toast.error('Erro ao salvar plano. Tente novamente.'); return }

    // Sincroniza os serviços do plano (delete + insert). Os serviços PADRÃO são
    // sempre incluídos (não editáveis no form) — persistir também mantém o plano
    // "configurado" (plano_servicos não-vazio), senão um plano só-padrão cairia na
    // regra opt-in "sem serviços = sem restrição" e liberaria tudo.
    await sb.from('plano_servicos').delete().eq('plano_id', saved.id)
    const padraoIds = servicos.filter(s => s.padrao).map(s => s.id)
    const opcionaisSel = Array.from(servicosSel).filter(id => !padraoIds.includes(id))
    const ids = [...new Set([...opcionaisSel, ...padraoIds])]
    if (ids.length) await sb.from('plano_servicos').insert(ids.map(sid => ({ plano_id: saved.id, servico_id: sid })))

    setSalvando(false)
    toast.success(plano ? 'Plano atualizado.' : 'Plano criado.')
    onSaved()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">{plano ? 'Editar plano' : 'Novo plano'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} placeholder="ex: Tração" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição (opcional)</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as TipoPlano)} className={inputCls}>
                <option value="gratuito">Gratuito</option>
                <option value="trial">Teste (trial)</option>
                <option value="pago">Pago</option>
                <option value="cortesia">Cortesia (beneficente)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ordem de exibição</label>
              <input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} className={inputCls} />
            </div>
          </div>

          {tipo === 'pago' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Valor (R$)</label>
                <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className={inputCls} placeholder="0,00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ciclo de cobrança</label>
                <select value={ciclo} onChange={e => setCiclo(e.target.value as Ciclo)} className={inputCls}>
                  <option value="mensal">Mensal</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
            </div>
          )}

          {tipo === 'trial' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duração do teste (dias)</label>
              <input type="number" value={diasTrial} onChange={e => setDiasTrial(e.target.value)} className={inputCls} placeholder="ex: 90" />
            </div>
          )}

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Limites (deixe em branco para ilimitado)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Execuções / mês</label>
                <input type="number" value={execucoes} onChange={e => setExecucoes(e.target.value)} className={inputCls} placeholder="∞" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Armazenamento (GB)</label>
                <input type="number" step="0.1" value={armazenamentoGb} onChange={e => setArmazenamentoGb(e.target.value)} className={inputCls} placeholder="∞" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tokens IA / mês</label>
                <input type="number" value={tokens} onChange={e => setTokens(e.target.value)} className={inputCls} placeholder="∞" />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Serviços do plano <span className="font-normal text-gray-400">(módulos opcionais que este plano libera no perfil/menu)</span></p>
            {servicos.filter(s => !s.padrao).length === 0 ? (
              <p className="text-xs text-gray-400">Nenhum serviço opcional cadastrado.</p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {servicos.filter(s => !s.padrao).map(s => (
                  <label key={s.id} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={servicosSel.has(s.id)}
                      onChange={e => setServicosSel(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })}
                      className="accent-orange-500 mt-0.5 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="font-medium">{s.nome}</span>
                      {s.descricao && <span className="text-xs text-gray-400"> — {s.descricao}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {servicos.some(s => s.padrao) && (
              <div className="mt-3 pt-2 border-t border-gray-50">
                <p className="text-xs font-medium text-gray-400 mb-1.5">Sempre incluídos <span className="font-normal">(padrão em todos os planos)</span></p>
                <div className="space-y-1">
                  {servicos.filter(s => s.padrao).map(s => (
                    <div key={s.id} className="flex items-start gap-2 text-sm text-gray-400">
                      <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="min-w-0">
                        <span className="font-medium">{s.nome}</span>
                        {s.descricao && <span className="text-xs"> — {s.descricao}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">Usuários e perfis também são sempre liberados (não são serviços).</p>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-orange-500" />
            Plano ativo <span className="text-xs text-gray-400">(existe no catálogo — se inativo, some de tudo)</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={selecionavel} onChange={e => setSelecionavel(e.target.checked)} className="accent-orange-500" />
            Selecionável pela empresa <span className="text-xs text-gray-400">(aparece p/ contratação autônoma; desmarcado = só o admin atribui)</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={padrao} onChange={e => setPadrao(e.target.checked)} className="accent-orange-500" />
            Plano padrão <span className="text-xs text-gray-400">(toda empresa nova começa com ele — só um)</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
