'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/feedback'

interface Grupo {
  id: string
  nome: string
  display_name: string | null
  descricao?: string | null
}

interface Props {
  grupo: Grupo
  onClose: () => void
  onSalvo?: () => void
}

export function EditarGrupoModal({ grupo, onClose, onSalvo }: Props) {
  const toast = useToast()
  const [nome, setNome] = useState(grupo.nome)
  const [displayName, setDisplayName] = useState(grupo.display_name ?? '')
  const [descricao, setDescricao] = useState(grupo.descricao ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)

    const { error } = await createClient().from('grupos').update({
      nome,
      display_name: displayName || null,
      descricao: descricao || null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', grupo.id)

    setSalvando(false)
    if (error) { setErro('Erro ao salvar. Tente novamente.'); return }
    toast.success('Grupo atualizado.')
    onSalvo?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Editar grupo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do grupo</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
              rows={3} placeholder="Descrição do grupo"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancelar</button>
            <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar alterações'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
