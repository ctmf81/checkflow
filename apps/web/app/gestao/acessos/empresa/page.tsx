'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Building2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { UnidadeModal } from './UnidadeModal'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  logo_url: string | null
  status: 'ativo' | 'inativo' | 'pendente' | 'bloqueada'
}

interface Unidade {
  id: string
  nome: string
  status: 'ativo' | 'inativo'
}


export default function EmpresaPage() {
  const { empresaAtiva } = useSession()
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Edição dados empresa
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')

  // Modal unidade
  const [modalUnidade, setModalUnidade] = useState(false)
  const [unidadeEditando, setUnidadeEditando] = useState<Unidade | undefined>()

  async function carregar() {
    if (!empresaAtiva?.id) { setLoading(false); return }
    const supabase = createClient()

    const { data: emp } = await supabase.from('empresas').select('id, nome, cnpj, logo_url, status').eq('id', empresaAtiva.id).single()
    if (emp) {
      setEmpresa(emp)
      setNome(emp.nome)
      setCnpj(emp.cnpj ?? '')
    }

    const { data: unis } = await supabase.from('unidades').select('id, nome, status').eq('empresa_id', empresaAtiva.id).order('nome')
    if (unis) setUnidades(unis)

    setLoading(false)
  }

  useEffect(() => { carregar() }, [empresaAtiva?.id])

  async function salvarEmpresa() {
    if (!empresa) return
    setSalvando(true)
    const supabase = createClient()
    await supabase.from('empresas').update({ nome, cnpj: cnpj || null, atualizado_em: new Date().toISOString() }).eq('id', empresa.id)
    setSalvando(false)
    setEditando(false)
    await carregar()
  }

  async function deletarUnidade(id: string) {
    if (!confirm('Remover esta unidade?')) return
    await createClient().from('unidades').delete().eq('id', id)
    carregar()
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <Building2 size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhuma empresa selecionada.</p>
      <p className="text-xs text-gray-400 mt-1">Selecione uma empresa no Painel de sistema.</p>
    </div>
  )

  return (
    <>
      <div className="space-y-6 max-w-2xl">

        {/* Card dados da empresa */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dados da empresa</span>
            <button onClick={() => setEditando(!editando)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-500 transition-colors">
              <Pencil size={14} />
              {editando ? 'Cancelar' : 'Editar'}
            </button>
          </div>

          <div className="px-6 py-5">
            {/* Logo */}
            {empresa?.logo_url && (
              <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={empresa.logo_url} alt="Logo" className="h-12 object-contain" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Nome</label>
                {editando ? (
                  <input value={nome} onChange={e => setNome(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                ) : (
                  <p className="text-sm font-medium text-gray-800">{empresa?.nome}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CNPJ</label>
                {editando ? (
                  <input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                ) : (
                  <p className="text-sm text-gray-700">{empresa?.cnpj ?? '—'}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                {empresa && <Badge status={empresa.status} />}
              </div>
            </div>

            {editando && (
              <div className="flex justify-end mt-4">
                <Button onClick={salvarEmpresa} disabled={salvando} size="sm">
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Card unidades */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Unidades</span>
            <Button size="sm" onClick={() => { setUnidadeEditando(undefined); setModalUnidade(true) }}>
              <Plus size={14} />Nova unidade
            </Button>
          </div>

          {unidades.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-500">Nenhuma unidade cadastrada.</p>
            </div>
          ) : (
            unidades.map(u => (
              <div key={u.id} className="flex items-center justify-between px-6 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{u.nome}</p>
                  <span className={`text-xs ${u.status === 'ativo' ? 'text-green-600' : 'text-gray-400'}`}>
                    {u.status === 'ativo' ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setUnidadeEditando(u); setModalUnidade(true) }}
                    className="p-1.5 text-gray-400 hover:text-orange-500 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deletarUnidade(u.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {modalUnidade && empresa && (
        <UnidadeModal
          empresaId={empresa.id}
          unidade={unidadeEditando}
          onClose={() => setModalUnidade(false)}
          onSalvo={() => { setModalUnidade(false); carregar() }}
        />
      )}
    </>
  )
}
