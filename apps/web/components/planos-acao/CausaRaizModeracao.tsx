'use client'

import { useEffect, useState } from 'react'
import { GitBranch, Plus, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/feedback'

interface Ocorrencia { id: string; observacao: string | null; criado_em: string; causa_nome: string; usuario_nome: string | null }
interface CausaOpt { id: string; nome: string }

function mapOcorrencias(rows: any[] | null): Ocorrencia[] {
  return (rows ?? []).map((o: any) => ({
    id: o.id, observacao: o.observacao, criado_em: o.criado_em,
    causa_nome: o.causa?.nome ?? '—', usuario_nome: o.usuario?.nome ?? null,
  }))
}

function dataBR(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

/**
 * Causa raiz na moderação do plano de ação. Mostra a(s) causa(s) registrada(s)
 * para ESTE plano + o histórico de recorrência da atividade. Quem resolve
 * (N1/N2/admin) registra/adiciona a causa raiz aqui — grava a ocorrência na hora.
 */
export function CausaRaizModeracao({ planoId, atividadeId, subgrupoId, unidadeId, podeEditar }: {
  planoId: string
  atividadeId: string
  subgrupoId: string
  unidadeId: string
  podeEditar: boolean
}) {
  const [doPlano, setDoPlano] = useState<Ocorrencia[]>([])
  const [historico, setHistorico] = useState<Ocorrencia[]>([])
  const [causas, setCausas] = useState<CausaOpt[]>([])
  const [causaId, setCausaId] = useState('')
  const [obs, setObs] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const confirm = useConfirm()

  async function carregar() {
    const sb = createClient()
    const sel = 'id, observacao, criado_em, causa:causa_raiz_id(nome), usuario:criado_por(nome)'
    const [{ data: dp }, { data: hist }, { data: cs }] = await Promise.all([
      sb.from('causa_raiz_ocorrencias').select(sel).eq('plano_acao_id', planoId).order('criado_em', { ascending: false }),
      sb.from('causa_raiz_ocorrencias').select(sel).eq('atividade_id', atividadeId).order('criado_em', { ascending: false }).limit(5),
      sb.from('causa_raiz').select('id, nome').eq('atividade_id', atividadeId).eq('status', 'ativo').order('nome'),
    ])
    setDoPlano(mapOcorrencias(dp))
    setHistorico(mapOcorrencias(hist))
    setCausas((cs ?? []) as CausaOpt[])
  }

  useEffect(() => { carregar() }, [planoId, atividadeId])

  async function registrar() {
    if (!causaId) return
    setSalvando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const { error } = await sb.from('causa_raiz_ocorrencias').insert({
      causa_raiz_id: causaId, atividade_id: atividadeId, plano_acao_id: planoId,
      unidade_id: unidadeId, observacao: obs.trim() || null, criado_por: user?.id ?? null,
    })
    setSalvando(false)
    if (!error) { setCausaId(''); setObs(''); carregar() }
  }

  async function adicionarCausa() {
    const nome = novoNome.trim()
    if (!nome) return
    setSalvando(true)
    const sb = createClient()
    const [{ data: atv }, { data: sg }] = await Promise.all([
      sb.from('checklist_atividades').select('checklist_id').eq('id', atividadeId).maybeSingle(),
      sb.from('subgrupos').select('grupo_id').eq('id', subgrupoId).maybeSingle(),
    ])
    const { data: nova, error } = await sb.from('causa_raiz').insert({
      nome, unidade_id: unidadeId, subgrupo_id: subgrupoId, grupo_id: sg?.grupo_id ?? null,
      checklist_id: atv?.checklist_id ?? null, atividade_id: atividadeId, status: 'ativo',
    }).select('id').single()
    setSalvando(false)
    if (!error && nova) { await carregar(); setCausaId(nova.id); setNovoNome(''); setAdicionando(false) }
  }

  // Remove a causa raiz deste plano (para trocar por outra). Um plano tem no
  // máximo uma causa; só volta a aparecer o formulário depois de remover.
  async function remover(o: Ocorrencia) {
    if (!await confirm({ titulo: `Remover a causa raiz "${o.causa_nome}"?`, mensagem: 'Depois você pode registrar outra.', confirmarLabel: 'Remover', perigo: true })) return
    const { error } = await createClient().from('causa_raiz_ocorrencias').delete().eq('id', o.id)
    if (!error) { setCausaId(''); setObs(''); carregar() }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <GitBranch size={13} className="text-gray-400" />Causa raiz
      </p>

      {/* Causa(s) deste plano */}
      {doPlano.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {doPlano.map(o => (
            <div key={o.id} className="text-sm bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-orange-700">{o.causa_nome}</span>
                {o.observacao && <span className="text-gray-600"> — {o.observacao}</span>}
                <span className="text-xs text-gray-400 block mt-0.5">{dataBR(o.criado_em)}{o.usuario_nome ? ` · ${o.usuario_nome}` : ''}</span>
              </div>
              {podeEditar && (
                <button type="button" onClick={() => remover(o)} title="Remover causa raiz"
                  className="text-gray-400 hover:text-red-500 flex-shrink-0"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-3">Causa raiz ainda não registrada para este plano.</p>
      )}

      {/* Registrar (N1/N2/admin) — só quando ainda não há causa raiz no plano
          (1 por plano; para trocar, remover a atual primeiro). */}
      {podeEditar && doPlano.length === 0 && (
        <div className="space-y-2 mb-3">
          {!adicionando ? (
            <div className="flex gap-2">
              <select value={causaId} onChange={e => setCausaId(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Selecione a causa raiz…</option>
                {causas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <button type="button" onClick={() => setAdicionando(true)}
                className="px-3 py-2 text-sm text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 whitespace-nowrap flex items-center gap-1">
                <Plus size={14} />Nova
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome da nova causa raiz" autoFocus
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
              <button type="button" onClick={adicionarCausa} disabled={salvando || !novoNome.trim()}
                className="px-3 py-2 text-sm bg-orange-500 text-white rounded-lg disabled:opacity-40">{salvando ? '...' : 'Salvar'}</button>
              <button type="button" onClick={() => { setAdicionando(false); setNovoNome('') }} className="px-2 py-2 text-sm text-gray-400">✕</button>
            </div>
          )}

          {causaId && (
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Observação da causa raiz (opcional)"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          )}

          {causaId && (
            <button type="button" onClick={registrar} disabled={salvando}
              className="w-full py-2 text-sm font-semibold bg-gray-800 text-white rounded-lg disabled:opacity-40 flex items-center justify-center gap-2">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}Registrar causa raiz
            </button>
          )}
        </div>
      )}

      {/* Recorrência do campo */}
      {historico.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Recorrência neste campo ({historico.length}):</p>
          <ul className="space-y-1">
            {historico.map(o => (
              <li key={o.id} className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{o.causa_nome}</span>
                {o.observacao && <span> — {o.observacao}</span>}
                <span className="text-gray-400"> ({dataBR(o.criado_em)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
