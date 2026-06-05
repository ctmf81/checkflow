'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Search, UserCircle, AlertCircle, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { UsuarioModal } from './UsuarioModal'
import { ImportarUsuariosModal } from './ImportarUsuariosModal'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Usuario {
  id: string
  nome: string
  email: string
  cpf: string | null
  telefone: string | null
  perfil: string
  unidades: { id: string; nome: string }[]
}

export default function UsuariosPage() {
  const { empresaAtiva } = useSession()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [importarAberto, setImportarAberto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | undefined>()
  const [loading, setLoading] = useState(true)

  async function carregar() {
    if (!empresaAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()

    // Busca usuários vinculados à empresa via usuario_empresa
    const { data: ue } = await supabase
      .from('usuario_empresa')
      .select('usuario:usuario_id(id, nome, email, cpf, telefone), perfil:perfil_id(nome)')
      .eq('empresa_id', empresaAtiva.id)

    if (ue) {
      setUsuarios(ue.map((r: any) => ({
        id: r.usuario.id,
        nome: r.usuario.nome,
        email: r.usuario.email,
        cpf: r.usuario.cpf,
        telefone: r.usuario.telefone,
        perfil: r.perfil?.nome ?? '',
        unidades: [],
      })))
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [empresaAtiva?.id])

  const filtrados = usuarios.filter(u =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase()) ||
    (u.cpf ?? '').includes(busca)
  )

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma empresa selecionada</p>
      <p className="text-xs text-gray-400 mt-1">Acesse uma empresa pelo Painel de sistema.</p>
    </div>
  )

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuários</span>
            <p className="text-xs text-gray-400 mt-0.5">Empresa: <span className="text-orange-500 font-medium">{empresaAtiva.nome}</span></p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setImportarAberto(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
              <Upload size={14} />Importar
            </button>
            <Button onClick={() => { setUsuarioEditando(undefined); setModalAberto(true) }}>
              <Plus size={16} />Adicionar usuário
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou CPF"
              className="pl-8 pr-4 py-1.5 text-sm border-b border-gray-200 bg-transparent focus:outline-none focus:border-orange-400 w-56 transition-colors" />
          </div>
          <span className="text-sm text-gray-500">Quantidade: <span className="font-medium text-gray-700">{filtrados.length}</span></span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center">
            <UserCircle size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nenhum usuário nesta empresa.</p>
          </div>
        ) : filtrados.map(usuario => (
          <div key={usuario.id} className="flex items-center px-6 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mr-3 flex-shrink-0">
              <UserCircle size={24} className="text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <button onClick={() => { setUsuarioEditando(usuario); setModalAberto(true) }}
                className="font-medium text-sm text-gray-800 hover:text-orange-500 transition-colors text-left">
                {usuario.nome}
              </button>
              <p className="text-xs text-gray-500 truncate">{usuario.email}</p>
            </div>
            <div className="flex items-center gap-4">
              {usuario.perfil && <span className="text-sm text-gray-400 hidden sm:block">{usuario.perfil}</span>}
              <button className="text-gray-300 hover:text-red-400 transition-colors p-1"><Trash2 size={15} /></button>
              <button className="text-gray-300 hover:text-orange-400 transition-colors p-1 font-bold text-sm" title="Resetar senha">|**</button>
            </div>
          </div>
        ))}
      </div>

      {importarAberto && empresaAtiva && (
        <ImportarUsuariosModal
          empresaId={empresaAtiva.id}
          onClose={() => setImportarAberto(false)}
          onImportado={() => { setImportarAberto(false); carregar() }}
        />
      )}

      {modalAberto && (
        <UsuarioModal
          usuario={usuarioEditando}
          empresaId={empresaAtiva.id}
          onClose={() => { setModalAberto(false); carregar() }}
        />
      )}
    </>
  )
}
