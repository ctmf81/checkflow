'use client'

import { useState } from 'react'
import { X, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  onClose: () => void
}

export function NovaEmpresaModal({ onClose }: Props) {
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // integração com API vem aqui
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Adicionar uma nova empresa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
                <input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Nome da empresa"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input
                  value={cnpj}
                  onChange={e => setCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
              </div>
            </div>

            {/* Upload logo */}
            <div className="flex flex-col items-center justify-center w-32 h-28 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-orange-300 transition-colors bg-gray-50">
              <div className="relative">
                <ImagePlus size={28} className="text-gray-300" />
                <span className="absolute -bottom-1 -right-1 bg-orange-500 rounded-full w-4 h-4 flex items-center justify-center text-white text-xs">+</span>
              </div>
              <span className="text-xs text-gray-400 mt-2 text-center">500 x 200 ou maior</span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
              Cancelar
            </button>
            <Button type="submit">Criar empresa</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
