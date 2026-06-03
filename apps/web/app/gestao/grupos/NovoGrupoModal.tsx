'use client'

import { useState } from 'react'
import { X, LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  onClose: () => void
}

export function NovoGrupoModal({ onClose }: Props) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Novo grupo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do grupo</label>
                <input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Nome do grupo"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição do grupo</label>
                <textarea
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  placeholder="Descrição do grupo"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
                />
              </div>
            </div>

            {/* Ícone ilustrativo */}
            <div className="flex items-start pt-6">
              <div className="relative">
                <div className="w-16 h-16 bg-orange-50 rounded-xl flex items-center justify-center">
                  <LayoutTemplate size={32} className="text-orange-300" />
                </div>
                <span className="absolute -bottom-1 -right-1 bg-orange-500 rounded-full w-5 h-5 flex items-center justify-center text-white text-xs font-bold">+</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
              Cancelar
            </button>
            <Button type="submit">Criar grupo</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
