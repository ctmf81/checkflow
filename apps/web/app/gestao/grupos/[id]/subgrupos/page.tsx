'use client'

import { useState, useEffect, use } from 'react'
import { Plus, MoreVertical, FileText, Users, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { NovoSubgrupoModal } from './NovoSubgrupoModal'
import { createClient } from '@/lib/supabase'

interface Subgrupo {
  id: string
  nome: string
  totalChecklists: number
  totalUsuarios: number
}

export default function SubgruposPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [modal, setModal] = useState(false)
  const [grupo, setGrupo] = useState<{ nome: string; subgrupo_label?: string } | null>(null)
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()

    const { data: g } = await supabase.from('grupos').select('nome, subgrupo_label').eq('id', id).single()
    if (g) setGrupo(g)

    const { data: subs } = await supabase.from('subgrupos').select('id, nome').eq('grupo_id', id).order('nome')
    if (subs) {
      const comContagens = await Promise.all(subs.map(async s => {
        const { count: users } = await supabase.from('usuario_subgrupo').select('usuario_id', { count: 'exact', head: true }).eq('subgrupo_id', s.id)
        return { ...s, totalChecklists: 0, totalUsuarios: users ?? 0 }
      }))
      setSubgrupos(comContagens)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [id])

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-gray-700">
          <Link href="/gestao/grupos" className="text-gray-400 hover:text-orange-500 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <span className="font-semibold text-lg">{grupo?.nome ?? '...'}</span>
          <span className="text-gray-400">/</span>
          <span className="text-gray-500">Áreas</span>
        </div>
        <Button onClick={() => setModal(true)}>
          <Plus size={16} />
          Criar novo {(grupo?.subgrupo_label ?? 'subgrupo').toLowerCase()}
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : subgrupos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-500">Nenhuma área cadastrada.</p>
          <p className="text-xs text-gray-400 mt-1">Clique em &quot;Criar nova área&quot; para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subgrupos.map(sub => (
            <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">{sub.nome}</h2>
                <button className="text-gray-400 hover:text-gray-600 p-1">
                  <MoreVertical size={16} />
                </button>
              </div>

              <div className="flex gap-2 mb-3">
                <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-2 rounded-lg flex-1">
                  <FileText size={14} className="text-blue-400" />
                  <span className="text-blue-500 font-bold text-sm">{sub.totalChecklists}</span>
                  <span className="text-gray-500 text-xs">Checklists</span>
                </div>
                <div className="flex items-center gap-1.5 bg-green-50 px-3 py-2 rounded-lg flex-1">
                  <Users size={14} className="text-green-400" />
                  <span className="text-green-500 font-bold text-sm">{sub.totalUsuarios}</span>
                  <span className="text-gray-500 text-xs">Usuários</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <NovoSubgrupoModal
          grupoId={id}
          subgrupoLabel={grupo?.subgrupo_label ?? 'Subgrupo'}
          onClose={() => setModal(false)}
          onCriado={() => { setModal(false); carregar() }}
        />
      )}
    </>
  )
}
