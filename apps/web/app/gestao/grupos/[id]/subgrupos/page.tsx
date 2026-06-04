'use client'

import { useState, useEffect, use, useRef } from 'react'
import { Plus, Users, ChevronLeft, MoreVertical, Pencil, PowerOff, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { NovoSubgrupoModal } from './NovoSubgrupoModal'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Subgrupo {
  id: string
  nome: string
  descricao: string | null
  totalUsuarios: number
}

function SubgrupoMenu({ subgrupo, onEditar, onDesativar }: {
  subgrupo: Subgrupo
  onEditar: () => void
  onDesativar: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto(!aberto)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100 truncate">{subgrupo.nome}</div>
          <button onClick={() => { setAberto(false); onEditar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Pencil size={14} className="text-gray-400" />Editar
          </button>
          <div className="border-t border-gray-100 mt-1">
            <button onClick={() => { setAberto(false); onDesativar() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
              <PowerOff size={14} />Desativar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditarSubgrupoModal({ subgrupo, onClose, onSalvo }: {
  subgrupo: Subgrupo
  onClose: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState(subgrupo.nome)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await createClient().from('subgrupos').update({
      nome, atualizado_em: new Date().toISOString()
    }).eq('id', subgrupo.id)
    setSalvando(false)
    if (error) { setErro('Erro ao salvar.'); return }
    onSalvo()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Editar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required />
          </div>
          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SubgruposPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { subgrupoLabel } = useSession()
  const [modal, setModal] = useState(false)
  const [grupo, setGrupo] = useState<{ nome: string } | null>(null)
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Subgrupo | null>(null)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const { data: g } = await supabase.from('grupos').select('nome').eq('id', id).single()
    if (g) setGrupo(g)

    const { data: subs } = await supabase
      .from('subgrupos').select('id, nome, descricao')
      .eq('grupo_id', id).eq('status', 'ativo').order('nome')

    if (subs) {
      const comContagens = await Promise.all(subs.map(async s => {
        const { count } = await supabase.from('usuario_subgrupo').select('usuario_id', { count: 'exact', head: true }).eq('subgrupo_id', s.id)
        return { ...s, totalUsuarios: count ?? 0 }
      }))
      setSubgrupos(comContagens)
    }
    setLoading(false)
  }

  async function desativar(sub: Subgrupo) {
    if (!confirm(`Desativar "${sub.nome}"?`)) return
    await createClient().from('subgrupos').update({ status: 'inativo' }).eq('id', sub.id)
    carregar()
  }

  useEffect(() => { carregar() }, [id])

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/gestao/grupos" className="text-gray-400 hover:text-orange-500 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <span className="font-semibold text-lg text-gray-800">{grupo?.nome ?? '...'}</span>
          <span className="text-gray-400">/</span>
          <span className="text-gray-500">{subgrupoLabel}</span>
        </div>
        <Button onClick={() => setModal(true)}>
          <Plus size={16} />Criar novo {subgrupoLabel.toLowerCase()}
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : subgrupos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-500">Nenhum {subgrupoLabel.toLowerCase()} cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subgrupos.map(sub => (
            <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">{sub.nome}</h2>
                <SubgrupoMenu
                  subgrupo={sub}
                  onEditar={() => setEditando(sub)}
                  onDesativar={() => desativar(sub)}
                />
              </div>
              <div className="flex gap-2">
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
        <NovoSubgrupoModal grupoId={id} subgrupoLabel={subgrupoLabel}
          onClose={() => setModal(false)} onCriado={() => { setModal(false); carregar() }} />
      )}

      {editando && (
        <EditarSubgrupoModal subgrupo={editando}
          onClose={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />
      )}
    </>
  )
}
