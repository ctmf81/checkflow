'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { Plus, Search, FileCheck, MoreVertical, AlertCircle, CheckCircle2, Clock, Eye, ChevronLeft, Copy, EyeOff, Loader2, ChevronDown, LayoutGrid, Sparkles, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { ONBOARDING_CHECKLISTS } from '@/components/onboarding/configs'

interface Checklist {
  id: string
  nome: string
  descricao: string | null
  status: 'rascunho' | 'publicado' | 'inativo'
  versao_atual: number
  subgrupo: { nome: string } | null
  total_atividades?: number
}

interface Unidade { id: string; nome: string }
interface Grupo   { id: string; nome: string }
interface Subgrupo{ id: string; nome: string }

const STATUS_CONFIG = {
  rascunho:  { label: 'Rascunho',  cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
  publicado: { label: 'Publicado', cor: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  inativo:   { label: 'Inativo',   cor: 'bg-gray-100 text-gray-500',    icon: FileCheck },
}

export default function ChecklistsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-400">Carregando...</div>}>
      <ChecklistsContent />
    </Suspense>
  )
}

function ChecklistsContent() {
  const { unidadeAtiva, subgrupoLabel, empresaAtiva, faseAssinatura } = useSession()
  const toast = useToast()
  const confirm = useConfirm()
  const searchParams = useSearchParams()
  const router = useRouter()
  const filtroSubgrupoId = searchParams.get('subgrupo')
  const filtroSubgrupoNome = searchParams.get('subgrupoNome') ?? ''

  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [loading, setLoading] = useState(true)

  // Dropdown menu state
  const [menuAberto, setMenuAberto] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Inativar/reativar state
  const [inativando, setInativando] = useState<string | null>(null)
  const [mostrarInativos, setMostrarInativos] = useState(false)

  // Modal duplicar
  const [duplicando, setDuplicando] = useState<Checklist | null>(null)

  // Modal gerar com IA
  const [gerandoIA, setGerandoIA] = useState(false)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('checklists')
      .select('id, nome, descricao, status, versao_atual, subgrupo:subgrupo_id(nome)')
      .eq('unidade_id', unidadeAtiva.id)
      .order('nome')

    if (!mostrarInativos) query = query.neq('status', 'inativo')

    if (filtroSubgrupoId) query = query.eq('subgrupo_id', filtroSubgrupoId)

    const { data } = await query

    if (data) {
      const ids = data.map((c: any) => c.id)

      // Uma única query para contar atividades raiz de todos os checklists
      const { data: contagensRaw } = ids.length
        ? await supabase
            .from('checklist_atividades')
            .select('checklist_id')
            .in('checklist_id', ids)
            .is('atividade_pai_id', null)
        : { data: [] }

      const contagemMap: Record<string, number> = {}
      for (const row of (contagensRaw ?? [])) {
        contagemMap[row.checklist_id] = (contagemMap[row.checklist_id] ?? 0) + 1
      }

      const comContagens = data.map((c: any) => {
        const subgrupoNorm = Array.isArray(c.subgrupo) ? c.subgrupo[0] : c.subgrupo
        return {
          id: c.id,
          nome: c.nome,
          descricao: c.descricao,
          status: c.status,
          versao_atual: c.versao_atual,
          subgrupo: subgrupoNorm ? { nome: subgrupoNorm.nome } : null,
          total_atividades: contagemMap[c.id] ?? 0,
        } as Checklist
      })
      setChecklists(comContagens)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id, filtroSubgrupoId, mostrarInativos])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAberto(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function reativar(id: string, nome: string) {
    setMenuAberto(null)
    const ok = await confirm({
      titulo: 'Reativar este checklist?',
      mensagem: `"${nome}" voltará para rascunho e poderá ser editado e publicado novamente.`,
      confirmarLabel: 'Reativar',
    })
    if (!ok) return
    setInativando(id)
    const { error } = await createClient().from('checklists').update({ status: 'rascunho' }).eq('id', id)
    if (error) {
      toast.error('Não foi possível reativar este checklist.')
      setInativando(null)
      return
    }
    setChecklists(prev => mostrarInativos ? prev.map(c => c.id === id ? { ...c, status: 'rascunho' } : c) : prev.filter(c => c.id !== id))
    setInativando(null)
    toast.success('Checklist reativado como rascunho.')
  }

  async function inativar(id: string, nome: string) {
    setMenuAberto(null)
    const supabase = createClient()

    // Guard: checklist em uso por workflow publicado não pode ser inativado.
    // Precisa ser desvinculado do(s) workflow(s) primeiro. (Há também um
    // trigger no banco que bloqueia — aqui damos a mensagem amigável antes.)
    const { data: vinculos } = await supabase
      .from('workflow_estagio_itens')
      .select('estagio:estagio_id(workflow:workflow_id(nome, status))')
      .eq('checklist_id', id)

    const workflowsPublicados = Array.from(new Set(
      (vinculos ?? [])
        .map((v: any) => {
          const estagio = Array.isArray(v.estagio) ? v.estagio[0] : v.estagio
          const wf = estagio ? (Array.isArray(estagio.workflow) ? estagio.workflow[0] : estagio.workflow) : null
          return wf && wf.status === 'publicado' ? wf.nome : null
        })
        .filter(Boolean) as string[]
    ))

    if (workflowsPublicados.length > 0) {
      toast.error(
        `Não é possível inativar "${nome}": está vinculado ao(s) workflow(s) ${workflowsPublicados.map(n => `"${n}"`).join(', ')}. ` +
        `Remova o checklist desse(s) workflow(s) (ou inative o workflow) antes de inativar.`
      )
      return
    }

    const ok = await confirm({
      titulo: 'Inativar este checklist?',
      mensagem: `"${nome}" deixará de aparecer na listagem e não poderá mais ser executado. O histórico de execuções é preservado. Você pode duplicá-lo depois se precisar reutilizá-lo.`,
      confirmarLabel: 'Inativar',
      perigo: true,
    })
    if (!ok) return

    setInativando(id)
    const { error } = await supabase.from('checklists').update({ status: 'inativo' }).eq('id', id)
    if (error) {
      toast.error('Não foi possível inativar este checklist. Verifique se ele está em uso por algum workflow.')
      setInativando(null)
      return
    }
    setChecklists(prev => prev.filter(c => c.id !== id))
    setInativando(null)
    toast.success('Checklist inativado.')
  }

  const filtrados = checklists.filter(c => {
    const matchBusca = c.nome.toLowerCase().includes(busca.toLowerCase())
    const matchStatus = !filtroStatus || c.status === filtroStatus
    return matchBusca && matchStatus
  })

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  return (
    <>
      <Onboarding pageId="checklists" titulo="Checklists" cards={ONBOARDING_CHECKLISTS} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          {filtroSubgrupoId && (
            <button onClick={() => router.push('/gestao/checklists')}
              className="text-gray-400 hover:text-orange-500 transition-colors">
              <ChevronLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-semibold text-gray-800">
              {filtroSubgrupoId ? filtroSubgrupoNome : 'Checklists'}
            </h1>
            <p className="hidden sm:block text-xs text-gray-400 mt-0.5">
              {filtroSubgrupoId
                ? <><span className="text-orange-500 cursor-pointer hover:underline" onClick={() => router.push('/gestao/checklists')}>Checklists</span> · {subgrupoLabel}: {filtroSubgrupoNome}</>
                : <>Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></>
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {faseAssinatura !== 'ativa' ? (
            <Button disabled title="Criação bloqueada — período gratuito encerrado"><Plus size={16} />Novo</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setGerandoIA(true)}><Sparkles size={16} />Gerar com IA</Button>
              <Link href="/gestao/checklists/modelos">
                <Button variant="outline"><LayoutGrid size={16} />Usar um modelo</Button>
              </Link>
              <Link href={filtroSubgrupoId ? `/gestao/checklists/novo/montar?subgrupo=${filtroSubgrupoId}` : '/gestao/checklists/novo'}>
                <Button><Plus size={16} />Novo</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar checklist"
            className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 w-52" />
        </div>
        {['', 'rascunho', 'publicado', ...(mostrarInativos ? ['inativo'] : [])].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroStatus === s ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {s === '' ? 'Todos' : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label}
          </button>
        ))}
        <button
          onClick={() => { setMostrarInativos(v => !v); setFiltroStatus('') }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            mostrarInativos ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
          }`}
        >
          {mostrarInativos ? 'Ocultar inativos' : 'Mostrar inativos'}
        </button>
        <span className="text-sm text-gray-500 ml-auto">{filtrados.length} checklist{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-16 text-center">
          <FileCheck size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum checklist cadastrado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200" ref={menuRef}>
          {filtrados.map(cl => {
            const cfg = STATUS_CONFIG[cl.status]
            const Icon = cfg.icon
            return (
              <div key={cl.id} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <FileCheck size={18} className="text-gray-300 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <Link href={`/gestao/checklists/${cl.id}`}
                    className="font-medium text-sm text-gray-800 hover:text-orange-500 transition-colors">
                    {cl.nome}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    {cl.subgrupo && (
                      <span className="text-xs text-gray-400">{subgrupoLabel}: {cl.subgrupo.nome}</span>
                    )}
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{cl.total_atividades} atividades</span>
                    {cl.versao_atual > 0 && (
                      <>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">v{cl.versao_atual}</span>
                      </>
                    )}
                  </div>
                </div>

                <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.cor}`}>
                  <Icon size={11} />
                  {cfg.label}
                </span>

                <div className="flex items-center gap-2">
                  <Link href={`/gestao/checklists/${cl.id}`}
                    className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors">
                    <Eye size={15} />
                  </Link>

                  {/* Dropdown menu */}
                  <div className="relative">
                    <button
                      onClick={() => setMenuAberto(menuAberto === cl.id ? null : cl.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                      disabled={inativando === cl.id}
                    >
                      {inativando === cl.id
                        ? <Loader2 size={15} className="animate-spin" />
                        : <MoreVertical size={15} />
                      }
                    </button>

                    {menuAberto === cl.id && (
                      <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
                        <button
                          onClick={() => { setMenuAberto(null); setDuplicando(cl) }}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Copy size={14} className="text-gray-400" />
                          Duplicar
                        </button>
                        {cl.status === 'inativo' ? (
                          <button
                            onClick={() => reativar(cl.id, cl.nome)}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 transition-colors"
                          >
                            <RotateCcw size={14} className="text-green-500" />
                            Reativar
                          </button>
                        ) : (
                          <button
                            onClick={() => inativar(cl.id, cl.nome)}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <EyeOff size={14} className="text-red-400" />
                            Inativar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal duplicar */}
      {duplicando && (
        <DuplicarModal
          checklist={duplicando}
          empresaId={empresaAtiva?.id ?? ''}
          origemUnidadeId={unidadeAtiva.id}
          onClose={() => setDuplicando(null)}
          onDuplicado={() => { setDuplicando(null); carregar() }}
        />
      )}

      {/* Modal gerar com IA */}
      {gerandoIA && (
        <GerarIAModal
          unidadeId={unidadeAtiva.id}
          subgrupoId={filtroSubgrupoId}
          onClose={() => setGerandoIA(false)}
        />
      )}
    </>
  )
}

// ─── Modal Gerar com IA ───────────────────────────────────────────────────────

function GerarIAModal({ unidadeId, subgrupoId, onClose }: {
  unidadeId: string
  subgrupoId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [descricao, setDescricao] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  async function gerar() {
    if (descricao.trim().length < 15) { setErro('Descreva com mais detalhes — quanto mais específico, melhor o resultado.'); return }
    setGerando(true); setErro('')
    try {
      const sb = createClient()
      const { data: { session } } = await sb.auth.getSession()
      const res = await fetch('/api/checklists/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ descricao: descricao.trim(), unidade_id: unidadeId, subgrupo_id: subgrupoId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.id) { setErro(json.error ?? 'Não foi possível gerar. Tente novamente.'); setGerando(false); return }
      // Abre o montador com o rascunho gerado para revisão/publicação.
      router.push(`/gestao/checklists/${json.id}/montar`)
    } catch {
      setErro('Erro inesperado. Tente novamente.')
      setGerando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Sparkles size={18} className="text-orange-500" />Gerar checklist com IA
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">A IA cria as seções e atividades; você revisa, ajusta e publica no montador.</p>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700 leading-relaxed">
            💡 <strong>Seja bem detalhista.</strong> Quanto mais específico (o que inspecionar, faixas de valores, o que é crítico, o que abre plano de ação), melhor o resultado.
            <br />Ex.: <em>&ldquo;Inspeção diária de empilhadeira: nível de óleo (ok/baixo), pressão dos pneus (mín. 80 psi), buzina e luzes funcionando, vazamentos — se houver, abrir plano de ação; foto do horímetro.&rdquo;</em>
          </div>
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={6}
            autoFocus
            placeholder="Descreva em detalhes o checklist que você quer..."
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
          />
          {erro && <p className="text-xs text-red-500">{erro}</p>}
          {gerando && <p className="text-xs text-gray-400">Gerando com IA… isso pode levar alguns segundos.</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={gerando}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={gerar} disabled={gerando || descricao.trim().length < 15}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
            {gerando ? <><Loader2 size={14} className="animate-spin" />Gerando...</> : <><Sparkles size={14} />Gerar com IA</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Duplicação ──────────────────────────────────────────────────────

interface DuplicarModalProps {
  checklist: Checklist
  empresaId: string
  origemUnidadeId: string
  onClose: () => void
  onDuplicado: () => void
}

function DuplicarModal({ checklist, empresaId, origemUnidadeId, onClose, onDuplicado }: DuplicarModalProps) {
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])

  const [unidadeId, setUnidadeId] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [subgrupoId, setSubgrupoId] = useState('')
  const [nome, setNome] = useState(`${checklist.nome} (cópia)`)

  // Catálogos referenciados pelas atividades (config.catalogo_id).
  // Ao duplicar para outra unidade, esses catálogos são recriados no destino.
  const [catalogosVinculados, setCatalogosVinculados] = useState<string[]>([])

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const confirm = useConfirm()

  // Detecta catálogos usados pelo checklist de origem (para avisar o usuário)
  useEffect(() => {
    const supabase = createClient()
    supabase.from('checklist_atividades')
      .select('config')
      .eq('checklist_id', checklist.id)
      .eq('tipo', 'catalogo')
      .then(({ data }) => {
        const ids = Array.from(new Set(
          (data ?? [])
            .map((a: any) => a.config?.catalogo_id)
            .filter(Boolean) as string[]
        ))
        setCatalogosVinculados(ids)
      })
  }, [checklist.id])

  const outraUnidade = !!unidadeId && unidadeId !== origemUnidadeId
  const recriaCatalogos = outraUnidade && catalogosVinculados.length > 0

  useEffect(() => {
    if (!empresaId) return
    const supabase = createClient()
    supabase.from('unidades').select('id, nome').eq('empresa_id', empresaId).order('nome')
      .then(({ data }) => setUnidades(data ?? []))
  }, [empresaId])

  useEffect(() => {
    setGrupoId('')
    setSubgrupoId('')
    setGrupos([])
    setSubgrupos([])
    if (!unidadeId) return
    const supabase = createClient()
    supabase.from('grupos').select('id, nome').eq('unidade_id', unidadeId).eq('status', 'ativo').order('nome')
      .then(({ data }) => setGrupos(data ?? []))
  }, [unidadeId])

  useEffect(() => {
    setSubgrupoId('')
    setSubgrupos([])
    if (!grupoId) return
    const supabase = createClient()
    supabase.from('subgrupos').select('id, nome').eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => setSubgrupos(data ?? []))
  }, [grupoId])

  async function duplicar() {
    if (!unidadeId) { setErro('Selecione uma unidade de destino.'); return }
    if (!nome.trim()) { setErro('Informe um nome para o checklist.'); return }

    // Avisa que catálogos serão recriados no destino (cadastro de catálogos da outra unidade)
    if (recriaCatalogos) {
      const ok = await confirm({
        titulo: 'Recriar catálogos no destino?',
        mensagem: `Este checklist usa ${catalogosVinculados.length} catálogo(s). Como a cópia vai para outra unidade, será criado um novo catálogo (com seus valores) no cadastro de catálogos da unidade de destino. Deseja continuar?`,
        confirmarLabel: 'Duplicar e recriar catálogos',
      })
      if (!ok) return
    }

    setSalvando(true)
    setErro('')
    const supabase = createClient()
    let novoClId: string | null = null

    try {
      // 0. Recria catálogos no destino (só quando vai para outra unidade).
      //    No mesmo destino o catalogo_id continua válido.
      const mapaCatalogos: Record<string, string> = {}
      if (recriaCatalogos) {
        for (const catId of catalogosVinculados) {
          const { data: cat } = await supabase.from('catalogos').select('*').eq('id', catId).single()
          if (!cat) continue
          const { data: novoCat, error: errCat } = await supabase.from('catalogos').insert({
            unidade_id: unidadeId,
            nome: cat.nome, descricao: cat.descricao, campo_chave: cat.campo_chave,
            atributo_1: cat.atributo_1, atributo_2: cat.atributo_2,
            atributo_3: cat.atributo_3, atributo_4: cat.atributo_4,
            api_url: cat.api_url, api_headers: cat.api_headers, api_mapeamento: cat.api_mapeamento,
            status: 'ativo',
          }).select('id').single()
          if (errCat || !novoCat) throw new Error('Erro ao recriar catálogo no destino.')
          mapaCatalogos[catId] = novoCat.id

          // Copia os valores do catálogo
          const { data: valores } = await supabase.from('catalogo_valores')
            .select('valor_chave, atributo_1, atributo_2, atributo_3, atributo_4, imagem_url')
            .eq('catalogo_id', catId)
          if (valores && valores.length) {
            const { error: errVal } = await supabase.from('catalogo_valores')
              .insert(valores.map(v => ({ ...v, catalogo_id: novoCat.id })))
            if (errVal) throw new Error('Erro ao copiar valores do catálogo.')
          }
        }
      }

      // 1. Cria novo checklist
      const { data: novoCl, error: errCl } = await supabase
        .from('checklists')
        .insert({
          nome: nome.trim(),
          descricao: checklist.descricao,
          unidade_id: unidadeId,
          subgrupo_id: subgrupoId || null,
          status: 'rascunho',
          versao_atual: 0,
        })
        .select('id')
        .single()

      if (errCl || !novoCl) throw new Error('Erro ao criar checklist.')
      novoClId = novoCl.id

      // 2. Copia seções
      const { data: secoes } = await supabase
        .from('checklist_secoes')
        .select('id, nome, ordem')
        .eq('checklist_id', checklist.id)
        .order('ordem')

      const mapaSecoes: Record<string, string> = {}
      for (const s of (secoes ?? [])) {
        const { data: novaS, error: errS } = await supabase
          .from('checklist_secoes')
          .insert({ checklist_id: novoCl.id, nome: s.nome, ordem: s.ordem })
          .select('id')
          .single()
        if (errS) throw new Error('Erro ao copiar seções.')
        if (novaS) mapaSecoes[s.id] = novaS.id
      }

      // 3. Copia atividades (duas passagens: pais → filhos)
      const { data: atividades, error: errAtv } = await supabase
        .from('checklist_atividades')
        .select('*')
        .eq('checklist_id', checklist.id)
        .order('ordem')

      if (errAtv) throw new Error('Erro ao ler atividades.')

      const mapaAtividades: Record<string, string> = {}
      const ativsOrdenadas = (atividades ?? [])

      // Garante que pais existem no mapa antes dos filhos (suporte a múltiplos níveis)
      const pendentes = [...ativsOrdenadas]
      let tentativas = 0
      while (pendentes.length > 0 && tentativas < pendentes.length * 2) {
        const a = pendentes.shift()!
        if (a.atividade_pai_id && !mapaAtividades[a.atividade_pai_id]) {
          pendentes.push(a) // reagenda para depois do pai ser processado
          tentativas++
          continue
        }
        tentativas = 0
        // Remapeia o catálogo quando recriado no destino
        let configFinal = a.config
        if (a.tipo === 'catalogo' && a.config?.catalogo_id && mapaCatalogos[a.config.catalogo_id]) {
          configFinal = { ...a.config, catalogo_id: mapaCatalogos[a.config.catalogo_id] }
        }
        const { data: novaA, error: errA } = await supabase
          .from('checklist_atividades')
          .insert({
            checklist_id: novoCl.id,
            secao_id: a.secao_id ? (mapaSecoes[a.secao_id] ?? null) : null,
            nome: a.nome,
            descricao: a.descricao,
            tipo: a.tipo,
            ordem: a.ordem,
            obrigatoria: a.obrigatoria,
            critica: a.critica,
            gera_plano_acao: a.gera_plano_acao,
            config: configFinal,
            atividade_pai_id: a.atividade_pai_id ? (mapaAtividades[a.atividade_pai_id] ?? null) : null,
            valor_gatilho: a.valor_gatilho,
          })
          .select('id')
          .single()
        if (errA) throw new Error('Erro ao copiar atividades.')
        if (novaA) mapaAtividades[a.id] = novaA.id
      }

      // 4. Copia opções de múltipla escolha em lote
      if (ativsOrdenadas.length) {
        const { data: opcoes } = await supabase
          .from('checklist_atividade_opcoes')
          .select('*')
          .in('atividade_id', ativsOrdenadas.map(a => a.id))
          .order('ordem')

        const novasOpcoes = (opcoes ?? [])
          .filter(o => mapaAtividades[o.atividade_id])
          .map(o => ({
            atividade_id: mapaAtividades[o.atividade_id],
            label: o.label,
            valor: o.valor,
            ordem: o.ordem,
            e_valido: o.e_valido,
          }))
        if (novasOpcoes.length) {
          const { error: errOpc } = await supabase.from('checklist_atividade_opcoes').insert(novasOpcoes)
          if (errOpc) throw new Error('Erro ao copiar opções.')
        }
      }

      // 5. Copia os motivos de não execução vinculados (ignora os que o
      //    trigger já associou por padrão, evitando conflito de duplicata).
      const { data: motivos } = await supabase
        .from('checklist_nao_execucao_motivos')
        .select('motivo_id')
        .eq('checklist_id', checklist.id)
      if (motivos && motivos.length) {
        await supabase.from('checklist_nao_execucao_motivos').upsert(
          motivos.map(m => ({ checklist_id: novoCl.id, motivo_id: m.motivo_id })),
          { onConflict: 'checklist_id,motivo_id', ignoreDuplicates: true }
        )
      }

      setSalvando(false)
      onDuplicado()
    } catch (e: any) {
      // Rollback: remove o checklist parcialmente criado
      if (novoClId) await supabase.from('checklists').delete().eq('id', novoClId)
      setErro(e.message ?? 'Erro ao duplicar. Tente novamente.')
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Duplicar checklist</h2>
          <p className="text-xs text-gray-400 mt-0.5">Escolha o destino da cópia</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome do novo checklist</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>

          {/* Unidade */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Unidade de destino <span className="text-red-400">*</span></label>
            <div className="relative">
              <select
                value={unidadeId}
                onChange={e => setUnidadeId(e.target.value)}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white pr-8"
              >
                <option value="">Selecione...</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Grupo */}
          {grupos.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Grupo</label>
              <div className="relative">
                <select
                  value={grupoId}
                  onChange={e => setGrupoId(e.target.value)}
                  className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white pr-8"
                >
                  <option value="">Selecione...</option>
                  {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Subgrupo */}
          {subgrupos.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Subgrupo</label>
              <div className="relative">
                <select
                  value={subgrupoId}
                  onChange={e => setSubgrupoId(e.target.value)}
                  className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white pr-8"
                >
                  <option value="">Nenhum</option>
                  {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {recriaCatalogos && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
              ⚠️ Este checklist usa <strong>{catalogosVinculados.length} catálogo(s)</strong>. Como a cópia vai para outra unidade, um novo catálogo (com seus valores) será criado no cadastro de catálogos da unidade de destino.
            </div>
          )}

          {erro && <p className="text-xs text-red-500">{erro}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={duplicar}
            disabled={salvando || !unidadeId}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            {salvando ? 'Duplicando...' : 'Duplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
