'use client'

import { useState } from 'react'
import { Plus, Trash2, KeyRound, Search, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { UsuarioModal } from './UsuarioModal'

interface Usuario {
  id: string
  nome: string
  email: string
  cpf: string
  telefone: string
  perfil: string
  unidades: { id: string; nome: string }[]
}

const mock: Usuario[] = [
  { id: '1', nome: 'Claudio Moura',           email: 'ctmf81@gmail.com',                    cpf: '039.245.714-81', telefone: '', perfil: 'Admin de sistema', unidades: [] },
  { id: '2', nome: 'Anderson Pereira da Silva', email: 'anderson.pereira@pointer.com.br',    cpf: '', telefone: '(82) 9 8202-8012', perfil: 'Gestão do Setor', unidades: [{ id: '1', nome: 'Marechal' }] },
  { id: '3', nome: 'Angelo Stanchak',          email: 'usuariopointer265@pointer.com.br',    cpf: '', telefone: '', perfil: 'Gestão', unidades: [] },
  { id: '4', nome: 'Brena Larissa Nogueira',   email: 'brena.nogueira@pointer.com.br',       cpf: '', telefone: '', perfil: 'Operação', unidades: [{ id: '1', nome: 'Marechal' }] },
]

export default function UsuariosPage() {
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | undefined>()

  const filtrados = mock.filter(u =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase())
  )

  function abrirEdicao(u: Usuario) {
    setUsuarioEditando(u)
    setModalAberto(true)
  }

  function abrirCadastro() {
    setUsuarioEditando(undefined)
    setModalAberto(true)
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuários</span>
          <Button onClick={abrirCadastro}>
            <Plus size={16} />
            Adicionar usuário
          </Button>
        </div>

        {/* Busca e contagem */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome ou CPF"
              className="pl-8 pr-4 py-1.5 text-sm border-b border-gray-200 bg-transparent focus:outline-none focus:border-orange-400 w-56 transition-colors"
            />
          </div>
          <span className="text-sm text-gray-500">
            Quantidade: <span className="font-medium text-gray-700">{filtrados.length}</span>
          </span>
        </div>

        {/* Lista */}
        {filtrados.map(usuario => (
          <div
            key={usuario.id}
            className="flex items-center px-6 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
          >
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mr-3 flex-shrink-0">
              <UserCircle size={24} className="text-gray-400" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <button
                onClick={() => abrirEdicao(usuario)}
                className="font-medium text-sm text-gray-800 hover:text-orange-500 transition-colors text-left"
              >
                {usuario.nome}
              </button>
              <p className="text-xs text-gray-500 truncate">{usuario.email}</p>
            </div>

            {/* Perfil + ações */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 hidden sm:block">{usuario.perfil}</span>
              <button className="text-gray-300 hover:text-red-400 transition-colors p-1" title="Remover usuário">
                <Trash2 size={15} />
              </button>
              <button className="text-gray-300 hover:text-orange-400 transition-colors p-1 font-bold text-sm" title="Resetar senha">
                |**
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <UsuarioModal
          usuario={usuarioEditando}
          onClose={() => { setModalAberto(false); setUsuarioEditando(undefined) }}
        />
      )}
    </>
  )
}
