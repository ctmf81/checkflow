'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, FileCheck, MoreVertical, AlertCircle, CheckCircle2, Clock, Eye, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Checklist {
  id: string
  nome: string
  descricao: string | null
  status: 'rascunho' | 'publicado' | 'inativo'
  versao_atual: number
  subgrupo: { nome: string } | null
  total_atividades?: number
}

const STATUS_CONFIG = {
  rascunho:  { label: 'Rascunho',  cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
  publicado: { label: 'Publicado', cor: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  inativo:   { label: 'Inativo',   cor: 'bg-gray-100 text-gray-500',    icon: FileCheck },
}

export default function ChecklistsPage() {
  const { unidadeAtiva, subgrupoLabel } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const filtroSubgrupoId = searchParams.get('subgrupo')
  const filtroSubgrupoNome = searchParams.get('subgrupoNome') ?? ''

  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [loading, setLoading] = useState(true)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('checklists')
      .select('id, nome, descricao, status, versao_atual, subgrupo:subgrupo_id(nome)')
      .eq('unidade_id', unidadeAtiva.id)
      .neq('status', 'inativo')
      .order('nome')

    if (filtroSubgrupoId) query = query.eq('subgrupo_id', filtroSubgrupoId)

    const { data } = await query

    if (data) {
      const comContagens = await Promise.all(data.map(async (c: any) => {
        const { count } = await supabase
          .from('checklist_atividades')
          .select('id', { count: 'exact', head: true })
          .eq('checklist_id', c.id)
          .is('atividade_pai_id', null)
        const subgrupoNorm = Array.isArray(c.subgrupo) ? c.subgrupo[0] : c.subgrupo
        return {
          id: c.id,
          nome: c.nome,
          descricao: c.descricao,
          status: c.status,
          versao_atual: c.versao_atual,
          subgrupo: subgrupoNorm ? { nome: subgrupoNorm.nome } : null,
          total_atividades: count ?? 0,
        } as Checklist
      }))
      setChecklists(comContagens)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id, filtroSubgrupoId])

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
      <div className="flex items-center justify-between mb-6">
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
            <p className="text-xs text-gray-400 mt-0.5">
              {filtroSubgrupoId
                ? <><span className="text-orange-500 cursor-pointer hover:underline" onClick={() => router.push('/gestao/checklists')}>Checklists</span> · {subgrupoLabel}: {filtroSubgrupoNome}</>
                : <>Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></>
              }
            </p>
          </div>
        </div>
        <Link href="/gestao/checklists/novo">
          <Button><Plus size={16} />Novo checklist</Button>
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar checklist"
            className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 w-52" />
        </div>
        {['', 'rascunho', 'publicado'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroStatus === s ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {s === '' ? 'Todos' : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label}
          </button>
        ))}
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
        <div className="bg-white rounded-xl border border-gray-200">
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
                  <button className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                    <MoreVertical size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
