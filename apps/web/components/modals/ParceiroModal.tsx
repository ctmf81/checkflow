'use client'

import { useState } from 'react'
import { X, Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

export interface ParceiroSelecionado {
  id: string
  nome: string
  email: string
  novo: boolean // true = acabou de ser criado agora (precisa do email de boas-vindas)
}

interface Props {
  onClose: () => void
  onSelecionado: (parceiro: ParceiroSelecionado) => void
}

/**
 * Busca um parceiro existente por e-mail ou cadastra um novo.
 * Um parceiro pode estar vinculado a várias empresas — por isso a busca
 * evita duplicar cadastros com o mesmo e-mail.
 */
export function ParceiroModal({ onClose, onSelecionado }: Props) {
  const [email, setEmail] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [buscou, setBuscou] = useState(false)
  const [encontrado, setEncontrado] = useState<{ id: string; nome: string; email: string } | null>(null)
  const [erro, setErro] = useState('')

  // Form de novo parceiro
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [documento, setDocumento] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setBuscando(true)
    setBuscou(false)
    setEncontrado(null)

    const supabase = createClient()
    const { data } = await supabase
      .from('parceiros')
      .select('id, nome, email')
      .ilike('email', email.trim())
      .maybeSingle()

    setEncontrado(data ?? null)
    setBuscou(true)
    setBuscando(false)
  }

  async function criarNovo(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!nome.trim() || !email.trim()) {
      setErro('Nome e e-mail são obrigatórios.')
      return
    }
    setSalvando(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: novo, error } = await supabase.from('parceiros').insert({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      telefone: telefone.trim() || null,
      documento: documento.trim() || null,
      criado_por: user?.id ?? null,
    }).select('id, nome, email').single()

    setSalvando(false)

    if (error || !novo) {
      setErro(error?.message?.includes('duplicate') || error?.code === '23505'
        ? 'Já existe um parceiro com este e-mail.'
        : 'Erro ao cadastrar parceiro. Tente novamente.')
      return
    }

    onSelecionado({ id: novo.id, nome: novo.nome, email: novo.email, novo: true })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Vincular parceiro</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erro && (
            <div className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2">{erro}</div>
          )}

          {/* Busca por e-mail */}
          <form onSubmit={buscar} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Buscar parceiro por e-mail</label>
            <div className="flex gap-2">
              <input
                type="email" required value={email}
                onChange={e => { setEmail(e.target.value); setBuscou(false); setEncontrado(null) }}
                placeholder="email@parceiro.com"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
              <Button type="submit" variant="outline" disabled={buscando || !email.trim()}>
                <Search size={14} />
                {buscando ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </form>

          {/* Resultado: parceiro existente */}
          {buscou && encontrado && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{encontrado.nome}</p>
                <p className="text-xs text-gray-500 truncate">{encontrado.email}</p>
              </div>
              <Button size="sm" onClick={() => onSelecionado({ ...encontrado, novo: false })}>
                Selecionar
              </Button>
            </div>
          )}

          {/* Resultado: não encontrado → cadastrar novo */}
          {buscou && !encontrado && (
            <form onSubmit={criarNovo} className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <UserPlus size={14} />
                Nenhum parceiro com este e-mail. Cadastre um novo:
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input value={nome} onChange={e => setNome(e.target.value)} required
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(xx) xxxxx-xxxx"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ</label>
                  <input value={documento} onChange={e => setDocumento(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button type="submit" disabled={salvando}>
                  {salvando ? 'Cadastrando...' : 'Cadastrar e vincular'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
