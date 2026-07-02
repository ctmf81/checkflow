'use client'

import { useEffect, useState } from 'react'
import { Bot, Check, Loader2, ExternalLink, ArrowUp, ArrowDown, FileText, Image as ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/feedback'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

type Provedor = 'gemini' | 'anthropic' | 'openai' | 'groq' | 'custom1' | 'custom2'

interface ProvedorRow {
  provedor: Provedor
  chave_mascara: string | null
  modelo: string | null
  base_url: string | null
  nome_exibicao: string | null
  ativo: boolean
  ordem: number
}

const META: Record<string, { nome: string; modeloPadrao: string; aceitaPdf: boolean; url: string; obs: string; custom?: boolean }> = {
  gemini:    { nome: 'Google Gemini',    modeloPadrao: 'gemini-2.5-flash',               aceitaPdf: true,  url: 'https://aistudio.google.com/apikey', obs: 'PDF e imagem' },
  anthropic: { nome: 'Anthropic Claude', modeloPadrao: 'claude-3-5-haiku-20241022',      aceitaPdf: true,  url: 'https://console.anthropic.com',      obs: 'PDF e imagem' },
  openai:    { nome: 'OpenAI',           modeloPadrao: 'gpt-4o-mini',                    aceitaPdf: false, url: 'https://platform.openai.com/api-keys', obs: 'somente imagem' },
  groq:      { nome: 'Groq',             modeloPadrao: 'llama-3.2-90b-vision-preview',   aceitaPdf: false, url: 'https://console.groq.com/keys',       obs: 'somente imagem' },
  custom1:   { nome: 'Customizado 1',    modeloPadrao: '',                               aceitaPdf: false, url: '',                                   obs: 'OpenAI-compatible · imagem', custom: true },
  custom2:   { nome: 'Customizado 2',    modeloPadrao: '',                               aceitaPdf: false, url: '',                                   obs: 'OpenAI-compatible · imagem', custom: true },
}

function mascara(chave: string): string {
  const limpa = chave.trim()
  if (limpa.length <= 4) return '••••'
  return '••••' + limpa.slice(-4)
}

export default function IntegracoesIAPage() {
  const toast = useToast()
  const [rows, setRows] = useState<ProvedorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState<Provedor | null>(null)
  // edições locais: nova chave digitada e modelo por provedor
  const [novaChave, setNovaChave] = useState<Record<string, string>>({})
  const [falhas, setFalhas] = useState<{ id: string; contexto: string; provedor: string; modelo: string | null; erro: string | null; criado_em: string }[]>([])

  async function carregar() {
    setLoading(true)
    const sb = createClient()
    // NÃO seleciona api_key — só a máscara segura
    const { data } = await sb.from('ia_provedores')
      .select('provedor, chave_mascara, modelo, base_url, nome_exibicao, ativo, ordem')
      .order('ordem', { ascending: true })
    setRows((data ?? []) as ProvedorRow[])
    const { data: f } = await sb.from('ia_falhas')
      .select('id, contexto, provedor, modelo, erro, criado_em')
      .order('criado_em', { ascending: false }).limit(15)
    setFalhas((f as any) ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function salvar(row: ProvedorRow) {
    setSalvando(row.provedor)
    const sb = createClient()
    const patch: Record<string, any> = {
      modelo: row.modelo?.trim() || null,
      ativo: row.ativo,
      ordem: row.ordem,
      atualizado_em: new Date().toISOString(),
    }
    if (META[row.provedor].custom) {
      patch.base_url = row.base_url?.trim() || null
      patch.nome_exibicao = row.nome_exibicao?.trim() || null
    }
    const chave = novaChave[row.provedor]?.trim()
    if (chave) {
      patch.api_key = chave
      patch.chave_mascara = mascara(chave)
    }
    const { error } = await sb.from('ia_provedores').update(patch).eq('provedor', row.provedor)
    setSalvando(null)
    if (error) { toast.error('Erro ao salvar integração. Tente novamente.'); return }
    setNovaChave(prev => ({ ...prev, [row.provedor]: '' }))
    toast.success(`${META[row.provedor].nome} salvo.`)
    carregar()
  }

  function mover(idx: number, dir: -1 | 1) {
    const alvo = idx + dir
    if (alvo < 0 || alvo >= rows.length) return
    const novo = [...rows]
    ;[novo[idx], novo[alvo]] = [novo[alvo], novo[idx]]
    // reatribui ordem sequencial e persiste ambos
    novo.forEach((r, i) => { r.ordem = i + 1 })
    setRows(novo)
    const sb = createClient()
    Promise.all(novo.map(r =>
      sb.from('ia_provedores').update({ ordem: r.ordem }).eq('provedor', r.provedor)
    )).then(() => toast.success('Ordem de failover atualizada.'))
  }

  function setRow(provedor: Provedor, patch: Partial<ProvedorRow>) {
    setRows(prev => prev.map(r => r.provedor === provedor ? { ...r, ...patch } : r))
  }

  const cfg = getOnboardingConfig('sistema-integracoes-ia')

  return (
    <>
      {cfg && <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Integrações de IA</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Provedores usados na Consulta Inteligente. São tentados na ordem abaixo (failover):
          se um falhar ou atingir o limite, o próximo ativo assume automaticamente.
        </p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {rows.map((row, idx) => {
            const meta = META[row.provedor]
            return (
              <div key={row.provedor} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                      <Bot size={18} className="text-gray-400" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-800">{(meta.custom && row.nome_exibicao) || meta.nome}</h3>
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${meta.aceitaPdf ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                          {meta.aceitaPdf ? <FileText size={11} /> : <ImageIcon size={11} />}
                          {meta.obs}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {row.chave_mascara
                          ? <span className="text-xs text-green-600 inline-flex items-center gap-1"><Check size={12} /> Chave configurada {row.chave_mascara}</span>
                          : <span className="text-xs text-gray-400">Sem chave</span>}
                      </div>
                    </div>
                  </div>

                  {/* Ordem + ativo */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex flex-col">
                      <button onClick={() => mover(idx, -1)} disabled={idx === 0}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-30"><ArrowUp size={14} /></button>
                      <button onClick={() => mover(idx, 1)} disabled={idx === rows.length - 1}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-30"><ArrowDown size={14} /></button>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={row.ativo}
                        onChange={e => setRow(row.provedor, { ativo: e.target.checked })}
                        className="accent-orange-500" />
                      Ativo
                    </label>
                  </div>
                </div>

                {meta.custom && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nome (exibição)</label>
                      <input
                        value={row.nome_exibicao ?? ''}
                        onChange={e => setRow(row.provedor, { nome_exibicao: e.target.value })}
                        placeholder="ex: SiliconFlow"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Base URL (OpenAI-compatible)</label>
                      <input
                        value={row.base_url ?? ''}
                        onChange={e => setRow(row.provedor, { base_url: e.target.value })}
                        placeholder="https://api.siliconflow.cn/v1"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {row.chave_mascara ? 'Substituir chave (deixe em branco para manter)' : 'API Key'}
                    </label>
                    <input
                      type="password"
                      value={novaChave[row.provedor] ?? ''}
                      onChange={e => setNovaChave(prev => ({ ...prev, [row.provedor]: e.target.value }))}
                      placeholder={row.chave_mascara ?? 'cole a chave aqui'}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Modelo (opcional)</label>
                    <input
                      value={row.modelo ?? ''}
                      onChange={e => setRow(row.provedor, { modelo: e.target.value })}
                      placeholder={meta.modeloPadrao}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  {meta.url ? (
                    <a href={meta.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-orange-500">
                      <ExternalLink size={11} /> Obter chave
                    </a>
                  ) : <span className="text-xs text-gray-300">{meta.custom ? 'Defina nome, base URL, modelo e chave' : ''}</span>}
                  <Button size="sm" onClick={() => salvar(row)} disabled={salvando === row.provedor}>
                    {salvando === row.provedor ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : 'Salvar'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Últimas falhas de IA (failover) */}
      {falhas.length > 0 && (
        <div className="mt-8 max-w-2xl">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Últimas falhas (failover)</h2>
          <p className="text-xs text-gray-400 mb-3">Quando um provedor falha, o sistema tenta o próximo. Aqui ficam os motivos — útil para detectar chave/cota/modelo com problema.</p>
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-50">
            {falhas.map(f => (
              <div key={f.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-700">{f.provedor}{f.modelo ? ` · ${f.modelo}` : ''}</span>
                  <span className="text-xs text-gray-400">{f.contexto} · {new Date(f.criado_em).toLocaleString('pt-BR')}</span>
                </div>
                {f.erro && <p className="text-xs text-red-500 mt-0.5 break-words">{f.erro}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
