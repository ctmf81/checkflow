'use client'

import { useEffect, useState } from 'react'
import { Plus, MoreVertical, Sun, FileText, Users, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { NovoGrupoModal } from './NovoGrupoModal'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Grupo {
  id: string
  nome: string
  display_name: string | null
  totalSubgrupos: number
  totalChecklists: number
  totalUsuarios: number
}

export default function GruposPage() {
  const { unidadeAtiva } = useSession()
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(true)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('grupos')
      .select('id, nome, display_name')
      .eq('unidade_id', unidadeAtiva.id)
      .order('nome')
    if (data) {
      const comContagens = await Promise.all(data.map(async g => {
        const { count: subs } = await supabase.from('subgrupos').select('id', { count: 'exact', head: true }).eq('grupo_id', g.id)
        const { count: users } = await supabase.from('usuario_grupo').select('usuario_id', { count: 'exact', head: true }).eq('grupo_id', g.id)
        return { ...g, totalSubgrupos: subs ?? 0, totalChecklists: 0, totalUsuarios: users ?? 0 }
      }))
      setGrupos(comContagens)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
      <p className="text-xs text-gray-400 mt-1">Selecione uma unidade no seletor do cabeçalho para continuar.</p>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Grupos</h1>
          <p className="text-xs text-gray-400 mt-0.5">Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={() => setModal(true)}><Plus size={16} />Criar novo grupo</Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-500">Nenhum grupo cadastrado nesta unidade.</p>
          <p className="text-xs text-gray-400 mt-1">Clique em &quot;Criar novo grupo&quot; para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grupos.map(grupo => (
            <Link key={grupo.id} href={`/gestao/grupos/${grupo.id}/subgrupos`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow block">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">{grupo.display_name || grupo.nome}</h2>
                <button className="text-gray-400 hover:text-gray-600 p-1" onClick={e => e.preventDefault()}>
                  <MoreVertical size={16} />
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-2 rounded-lg flex-1">
                  <Sun size={14} className="text-orange-400" />
                  <span className="text-orange-500 font-bold text-sm">{grupo.totalSubgrupos}</span>
                  <span className="text-gray-500 text-xs">Áreas</span>
                </div>
                <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-2 rounded-lg flex-1">
                  <FileText size={14} className="text-blue-400" />
                  <span className="text-blue-500 font-bold text-sm">{grupo.totalChecklists}</span>
                  <span className="text-gray-500 text-xs">Checklists</span>
                </div>
                <div className="flex items-center gap-1.5 bg-green-50 px-3 py-2 rounded-lg flex-1">
                  <Users size={14} className="text-green-400" />
                  <span className="text-green-500 font-bold text-sm">{grupo.totalUsuarios}</span>
                  <span className="text-gray-500 text-xs">Usuários</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {modal && <NovoGrupoModal onClose={() => { setModal(false); carregar() }} />}
    </>
  )
}
