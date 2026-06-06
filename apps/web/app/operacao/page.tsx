'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { CheckSquare, ChevronRight, AlertCircle, Layers, Search } from 'lucide-react'

interface Checklist {
  id: string
  nome: string
  descricao: string | null
  total_atividades: number
  subgrupo_id: string | null
  subgrupo_nome: string | null
  grupo_id: string | null
  grupo_nome: string | null
}

interface GrupoAgrupado {
  id: string
  nome: string
  subgrupos: {
    id: string | null
    nome: string | null
    checklists: Checklist[]
  }[]
}

export default function OperacaoPage() {
  const { unidadeAtiva } = useSession()
  const router = useRouter()
  const [grupos, setGrupos] = useState<GrupoAgrupado[]>([])
  const [semGrupo, setSemGrupo] = useState<Checklist[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    carregar()
  }, [unidadeAtiva?.id])

  async function carregar() {
    setLoading(true)
    const sb = createClient()

    const { data } = await sb
      .from('checklists')
      .select(`
        id, nome, descricao, subgrupo_id,
        subgrupo:subgrupo_id (
          id, nome,
          grupo:grupo_id ( id, nome )
        )
      `)
      .eq('unidade_id', unidadeAtiva!.id)
      .eq('status', 'publicado')
      .order('nome')

    if (!data) { setLoading(false); return }

    const comContagem = await Promise.all(data.map(async (c: any) => {
      const { count } = await sb.from('checklist_atividades')
        .select('id', { count: 'exact', head: true })
        .eq('checklist_id', c.id).is('atividade_pai_id', null)
      const sub = Array.isArray(c.subgrupo) ? c.subgrupo[0] : c.subgrupo
      const grp = sub ? (Array.isArray(sub.grupo) ? sub.grupo[0] : sub.grupo) : null
      return {
        id: c.id,
        nome: c.nome,
        descricao: c.descricao,
        total_atividades: count ?? 0,
        subgrupo_id: sub?.id ?? null,
        subgrupo_nome: sub?.nome ?? null,
        grupo_id: grp?.id ?? null,
        grupo_nome: grp?.nome ?? null,
      } as Checklist
    }))

    const gruposMap = new Map<string, GrupoAgrupado>()
    const semGrupoList: Checklist[] = []

    for (const cl of comContagem) {
      if (!cl.grupo_id) { semGrupoList.push(cl); continue }
      if (!gruposMap.has(cl.grupo_id)) {
        gruposMap.set(cl.grupo_id, { id: cl.grupo_id, nome: cl.grupo_nome!, subgrupos: [] })
      }
      const grupo = gruposMap.get(cl.grupo_id)!
      const subId = cl.subgrupo_id ?? '__sem__'
      let sub = grupo.subgrupos.find(s => s.id === subId)
      if (!sub) {
        sub = { id: cl.subgrupo_id, nome: cl.subgrupo_nome, checklists: [] }
        grupo.subgrupos.push(sub)
      }
      sub.checklists.push(cl)
    }

    setGrupos(Array.from(gruposMap.values()))
    setSemGrupo(semGrupoList)
    setLoading(false)
  }

  function filtrar(cls: Checklist[]) {
    if (!busca.trim()) return cls
    return cls.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Carregando checklists...</p>
      </div>
    </div>
  )

  if (!unidadeAtiva) return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center">
        <AlertCircle size={48} className="text-amber-300 mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Nenhuma unidade selecionada</p>
        <p className="text-sm text-gray-400 mt-1">Entre em contato com o administrador.</p>
      </div>
    </div>
  )

  const temConteudo = grupos.length > 0 || semGrupo.length > 0

  if (!temConteudo) return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center">
        <CheckSquare size={48} className="text-gray-200 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">Nenhum checklist disponível</p>
        <p className="text-sm text-gray-400 mt-1">Não há checklists publicados para esta unidade.</p>
      </div>
    </div>
  )

  const gruposFiltrados = grupos.map(g => ({
    ...g,
    subgrupos: g.subgrupos.map(s => ({ ...s, checklists: filtrar(s.checklists) })).filter(s => s.checklists.length > 0),
  })).filter(g => g.subgrupos.length > 0)

  const semGrupoFiltrado = filtrar(semGrupo)
  const semResultado = busca && gruposFiltrados.length === 0 && semGrupoFiltrado.length === 0

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-16">
      {/* Busca */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar checklist..."
          className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
        />
      </div>

      {semResultado && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">Nenhum resultado para "{busca}"</p>
        </div>
      )}

      {/* Checklists por grupo */}
      {gruposFiltrados.map(grupo => (
        <section key={grupo.id} className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Layers size={16} className="text-orange-400" />
            <h2 className="text-base font-bold text-gray-800">{grupo.nome}</h2>
          </div>

          {grupo.subgrupos.map(sub => (
            <div key={sub.id ?? 'sem'} className="mb-4">
              {sub.nome && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                  {sub.nome}
                </p>
              )}
              <div className="space-y-2">
                {sub.checklists.map(cl => (
                  <ChecklistCard key={cl.id} checklist={cl}
                    onClick={() => router.push(`/operacao/${cl.id}`)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {/* Sem grupo */}
      {semGrupoFiltrado.length > 0 && (
        <section className="mb-8">
          {grupos.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare size={16} className="text-gray-400" />
              <h2 className="text-base font-bold text-gray-800">Outros</h2>
            </div>
          )}
          <div className="space-y-2">
            {semGrupoFiltrado.map(cl => (
              <ChecklistCard key={cl.id} checklist={cl}
                onClick={() => router.push(`/operacao/${cl.id}`)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ChecklistCard({ checklist, onClick }: { checklist: Checklist; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-4 flex items-center gap-3 hover:border-orange-300 hover:shadow-sm active:scale-[0.99] transition-all"
    >
      <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <CheckSquare size={18} className="text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm leading-snug">{checklist.nome}</p>
        {checklist.descricao && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{checklist.descricao}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          {checklist.total_atividades} {checklist.total_atividades === 1 ? 'atividade' : 'atividades'}
        </p>
      </div>
      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
    </button>
  )
}
