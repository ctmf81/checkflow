'use client'

import { useEffect, useState } from 'react'
import { Plus, Users, AlertCircle, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { NovoGrupoModal } from './NovoGrupoModal'
import { GrupoMenu } from './GrupoMenu'
import { AdicionarUsuarioModal } from './AdicionarUsuarioModal'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Grupo {
  id: string
  nome: string
  display_name: string | null
  totalSubgrupos: number
  totalUsuarios: number
  status: string
}

export default function GruposPage() {
  const { unidadeAtiva, grupoLabel, subgrupoLabel } = useSession()
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [grupoUsuario, setGrupoUsuario] = useState<Grupo | null>(null)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()

    const { data } = await supabase
      .from('grupos')
      .select('id, nome, display_name')
      .eq('unidade_id', unidadeAtiva.id)
      .eq('status', 'ativo')
      .order('nome')

    if (data) {
      const comContagens = await Promise.all(data.map(async g => {
        const { count: subs } = await supabase.from('subgrupos').select('id', { count: 'exact', head: true }).eq('grupo_id', g.id).eq('status', 'ativo')
        const { count: users } = await supabase.from('usuario_grupo').select('usuario_id', { count: 'exact', head: true }).eq('grupo_id', g.id)
        return { ...g, totalSubgrupos: subs ?? 0, totalUsuarios: users ?? 0, status: 'ativo' }
      }))
      setGrupos(comContagens)
    }
    setLoading(false)
  }

  async function desativarGrupo(id: string, nome: string) {
    if (!confirm(`Desativar o grupo "${nome}"?`)) return
    await createClient().from('grupos').update({ status: 'inativo' }).eq('id', id)
    carregar()
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
      <p className="text-xs text-gray-400 mt-1">Selecione uma unidade no cabeçalho.</p>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">{grupoLabel}</h1>
          <p className="text-xs text-gray-400 mt-0.5">Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={() => setModal(true)}>
          <Plus size={16} />Criar novo {grupoLabel.toLowerCase()}
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-500">Nenhum {grupoLabel.toLowerCase()} cadastrado nesta unidade.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grupos.map(grupo => (
            <div key={grupo.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow relative">
              <div className="flex items-center justify-between mb-4">
                <Link href={`/gestao/grupos/${grupo.id}/subgrupos`} className="font-semibold text-gray-800 hover:text-orange-500 transition-colors">
                  {grupo.display_name || grupo.nome}
                </Link>
                <GrupoMenu
                  grupoId={grupo.id}
                  grupoNome={grupo.display_name || grupo.nome}
                  onEditar={() => {}}
                  onAdicionarUsuario={() => setGrupoUsuario(grupo)}
                  onExcluir={() => desativarGrupo(grupo.id, grupo.display_name || grupo.nome)}
                />
              </div>

              <Link href={`/gestao/grupos/${grupo.id}/subgrupos`} className="flex gap-2 block">
                <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-2 rounded-lg flex-1">
                  <LayoutGrid size={14} className="text-orange-400" />
                  <span className="text-orange-500 font-bold text-sm">{grupo.totalSubgrupos}</span>
                  <span className="text-gray-500 text-xs">{subgrupoLabel}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-green-50 px-3 py-2 rounded-lg flex-1">
                  <Users size={14} className="text-green-400" />
                  <span className="text-green-500 font-bold text-sm">{grupo.totalUsuarios}</span>
                  <span className="text-gray-500 text-xs">Usuários</span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <NovoGrupoModal onClose={() => setModal(false)} onCriado={() => { setModal(false); carregar() }} />
      )}

      {grupoUsuario && (
        <AdicionarUsuarioModal
          grupoId={grupoUsuario.id}
          grupoNome={grupoUsuario.display_name || grupoUsuario.nome}
          subgrupoLabel={subgrupoLabel}
          onClose={() => setGrupoUsuario(null)}
          onSalvo={() => { setGrupoUsuario(null); carregar() }}
        />
      )}
    </>
  )
}
