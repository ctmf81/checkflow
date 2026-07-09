'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Plus, Trash2, Save, Loader2, Link2, Check, ArrowUp, ArrowDown, RefreshCw, Tv } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast, useConfirm } from '@/components/ui/feedback'

const TIPOS_ELEGIVEIS = ['sim_nao', 'multipla_escolha', 'numero', 'padrao']
const TIPO_LABEL: Record<string, string> = {
  sim_nao: 'Sim/Não', multipla_escolha: 'Única escolha', numero: 'Número', padrao: 'Padrão',
}

interface Painel {
  id: string
  ordem: number
  titulo: string | null
  atividade_id: string
  janela_horas: number
  atividade_nome: string
  atividade_tipo: string
}

export default function EditorDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const toast = useToast()
  const confirm = useConfirm()

  const [nome, setNome] = useState('')
  const [token, setToken] = useState('')
  const [transicao, setTransicao] = useState('15')
  const [refresh, setRefresh] = useState('60')
  const [paineis, setPaineis] = useState<Painel[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  // Seletor de atividade do novo painel
  const [grupos, setGrupos] = useState<{ id: string; nome: string }[]>([])
  const [subgrupos, setSubgrupos] = useState<{ id: string; nome: string }[]>([])
  const [checklists, setChecklists] = useState<{ id: string; nome: string }[]>([])
  const [atividades, setAtividades] = useState<{ id: string; nome: string; tipo: string }[]>([])
  const [gSel, setGSel] = useState(''); const [sgSel, setSgSel] = useState('')
  const [clSel, setClSel] = useState(''); const [atvSel, setAtvSel] = useState('')
  const [janela, setJanela] = useState('24'); const [tituloPainel, setTituloPainel] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  async function carregar() {
    const sb = createClient()
    const { data: d } = await sb.from('dashboards').select('nome, token, transicao_segundos, refresh_segundos').eq('id', id).single()
    if (d) { setNome(d.nome); setToken(d.token); setTransicao(String(d.transicao_segundos)); setRefresh(String(d.refresh_segundos)) }
    await carregarPaineis()
    setLoading(false)
  }
  async function carregarPaineis() {
    const sb = createClient()
    const { data } = await sb.from('dashboard_paineis')
      .select('id, ordem, titulo, atividade_id, janela_horas, atividade:atividade_id(nome, tipo)')
      .eq('dashboard_id', id).order('ordem')
    setPaineis((data ?? []).map((p: any) => {
      const a = Array.isArray(p.atividade) ? p.atividade[0] : p.atividade
      return { id: p.id, ordem: p.ordem, titulo: p.titulo, atividade_id: p.atividade_id, janela_horas: p.janela_horas,
        atividade_nome: a?.nome ?? '—', atividade_tipo: a?.tipo ?? '' }
    }))
  }

  useEffect(() => { carregar() }, [id])

  // Cadeia grupo → subgrupo → checklist → atividade
  useEffect(() => {
    if (!unidadeAtiva?.id) return
    createClient().from('grupos').select('id, nome').eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => setGrupos(data ?? []))
  }, [unidadeAtiva?.id])
  useEffect(() => {
    setSgSel(''); setClSel(''); setAtvSel(''); setSubgrupos([]); setChecklists([]); setAtividades([])
    if (!gSel) return
    createClient().from('subgrupos').select('id, nome').eq('grupo_id', gSel).eq('status', 'ativo').order('nome')
      .then(({ data }) => setSubgrupos(data ?? []))
  }, [gSel])
  useEffect(() => {
    setClSel(''); setAtvSel(''); setChecklists([]); setAtividades([])
    if (!sgSel) return
    createClient().from('checklists').select('id, nome').eq('subgrupo_id', sgSel).eq('status', 'ativo').order('nome')
      .then(({ data }) => setChecklists(data ?? []))
  }, [sgSel])
  useEffect(() => {
    setAtvSel(''); setAtividades([])
    if (!clSel) return
    createClient().from('checklist_atividades').select('id, nome, tipo, config').eq('checklist_id', clSel).order('ordem')
      .then(({ data }) => setAtividades((data ?? []).filter((a: any) =>
        TIPOS_ELEGIVEIS.includes(a.tipo) && !(a.tipo === 'multipla_escolha' && a.config?.multiplo))))
  }, [clSel])

  async function salvarDados() {
    setSalvando(true)
    const { error } = await createClient().from('dashboards').update({
      nome: nome.trim() || 'Novo dashboard',
      transicao_segundos: Math.max(3, Number(transicao) || 15),
      refresh_segundos: Math.max(10, Number(refresh) || 60),
      atualizado_em: new Date().toISOString(),
    }).eq('id', id)
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar (verifique sua permissão).'); return }
    toast.success('Dashboard salvo.')
  }

  async function addPainel() {
    if (!atvSel) { toast.error('Escolha a atividade.'); return }
    const { error } = await createClient().from('dashboard_paineis').insert({
      dashboard_id: id, atividade_id: atvSel, ordem: paineis.length,
      janela_horas: Math.max(1, Number(janela) || 24), titulo: tituloPainel.trim() || null,
    })
    if (error) { toast.error('Não foi possível adicionar o painel.'); return }
    setAtvSel(''); setTituloPainel(''); setAddOpen(false)
    carregarPaineis()
  }
  async function delPainel(p: Painel) {
    if (!await confirm({ titulo: 'Remover este painel?', confirmarLabel: 'Remover', perigo: true })) return
    await createClient().from('dashboard_paineis').delete().eq('id', p.id)
    carregarPaineis()
  }
  async function mover(p: Painel, dir: -1 | 1) {
    const idx = paineis.findIndex(x => x.id === p.id)
    const alvo = paineis[idx + dir]
    if (!alvo) return
    const sb = createClient()
    await Promise.all([
      sb.from('dashboard_paineis').update({ ordem: alvo.ordem }).eq('id', p.id),
      sb.from('dashboard_paineis').update({ ordem: p.ordem }).eq('id', alvo.id),
    ])
    carregarPaineis()
  }

  async function regenerarToken() {
    if (!await confirm({ titulo: 'Gerar novo link?', mensagem: 'O link atual deixa de funcionar imediatamente.', confirmarLabel: 'Gerar novo' })) return
    // token é default no banco; para regerar, seta null e lê de volta não funciona — usa hex no cliente
    const novo = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')
    const { error } = await createClient().from('dashboards').update({ token: novo }).eq('id', id)
    if (error) { toast.error('Não foi possível gerar novo link.'); return }
    setToken(novo); toast.success('Novo link gerado.')
  }

  const linkPublico = `${typeof window !== 'undefined' ? window.location.origin : ''}/painel/${token}`
  async function copiar() {
    try { await navigator.clipboard.writeText(linkPublico); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }
    catch { toast.error('Não foi possível copiar.') }
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/gestao/configuracoes/dashboards')} className="text-gray-400 hover:text-orange-500"><ChevronLeft size={20} /></button>
          <h1 className="text-xl font-semibold text-gray-800">Editar dashboard</h1>
        </div>
        <div className="flex gap-2">
          <a href={linkPublico} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><Tv size={14} />Abrir TV</Button>
          </a>
          <Button size="sm" onClick={salvarDados} disabled={salvando}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
          </Button>
        </div>
      </div>

      {/* Config geral */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Transição entre painéis (seg)</label>
            <input type="number" min={3} value={transicao} onChange={e => setTransicao(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Atualizar dados a cada (seg)</label>
            <input type="number" min={10} value={refresh} onChange={e => setRefresh(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
        </div>
        {/* Link público */}
        <div className="border-t border-gray-100 pt-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Link público (TV) — qualquer pessoa com o link acessa</label>
          <div className="flex items-center gap-2">
            <input readOnly value={linkPublico} className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
            <button onClick={copiar} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              {copiado ? <><Check size={13} className="text-green-500" />Copiado</> : <><Link2 size={13} />Copiar</>}
            </button>
            <button onClick={regenerarToken} title="Gerar novo link (invalida o atual)" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Painéis */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Painéis</label>
          <button onClick={() => setAddOpen(v => !v)} className="text-xs font-medium text-orange-600 flex items-center gap-1"><Plus size={13} />Adicionar painel</button>
        </div>

        {paineis.length === 0 && <p className="text-xs text-gray-400">Nenhum painel ainda. Cada painel monitora o histórico de uma atividade.</p>}

        {paineis.map((p, idx) => (
          <div key={p.id} className="flex items-center gap-3 border border-gray-200 rounded-lg p-3">
            <div className="flex flex-col">
              <button onClick={() => mover(p, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-30"><ArrowUp size={14} /></button>
              <button onClick={() => mover(p, 1)} disabled={idx === paineis.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-30"><ArrowDown size={14} /></button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{p.titulo || p.atividade_nome}</p>
              <p className="text-xs text-gray-400">{TIPO_LABEL[p.atividade_tipo] ?? p.atividade_tipo} · últimas {p.janela_horas}h</p>
            </div>
            <button onClick={() => delPainel(p)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
          </div>
        ))}

        {/* Form de adicionar painel */}
        {addOpen && (
          <div className="border border-dashed border-orange-200 rounded-lg p-3 space-y-2 bg-orange-50/30">
            <div className="grid grid-cols-2 gap-2">
              <select value={gSel} onChange={e => setGSel(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
                <option value="">{grupoLabel}...</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
              <select value={sgSel} onChange={e => setSgSel(e.target.value)} disabled={!gSel} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white disabled:opacity-50">
                <option value="">{subgrupoLabel}...</option>
                {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <select value={clSel} onChange={e => setClSel(e.target.value)} disabled={!sgSel} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white disabled:opacity-50">
                <option value="">Checklist...</option>
                {checklists.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select value={atvSel} onChange={e => setAtvSel(e.target.value)} disabled={!clSel} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white disabled:opacity-50">
                <option value="">Atividade...</option>
                {atividades.map(a => <option key={a.id} value={a.id}>{a.nome} ({TIPO_LABEL[a.tipo]})</option>)}
              </select>
            </div>
            {clSel && atividades.length === 0 && (
              <p className="text-xs text-amber-600">Este checklist não tem atividades dos tipos suportados (sim/não, única escolha, número, padrão).</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input value={tituloPainel} onChange={e => setTituloPainel(e.target.value)} placeholder="Título (opcional)"
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white" />
              <div className="flex items-center gap-1.5">
                <input type="number" min={1} value={janela} onChange={e => setJanela(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white" />
                <span className="text-xs text-gray-400 whitespace-nowrap">últimas h</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAddOpen(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancelar</button>
              <button onClick={addPainel} disabled={!atvSel} className="text-xs font-medium text-white bg-orange-500 px-3 py-1.5 rounded-lg disabled:opacity-40">Adicionar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
