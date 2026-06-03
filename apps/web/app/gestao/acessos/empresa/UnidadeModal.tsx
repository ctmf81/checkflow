'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

interface Unidade {
  id: string
  nome: string
  status: 'ativo' | 'inativo'
}

interface Props {
  empresaId: string
  unidade?: Unidade
  onClose: () => void
  onSalvo?: () => void
}

export function UnidadeModal({ empresaId, unidade, onClose, onSalvo }: Props) {
  const isEdicao = !!unidade
  const [nome, setNome] = useState(unidade?.nome ?? '')
  const [status, setStatus] = useState(unidade?.status ?? 'ativo')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (isEdicao) {
      const { error } = await supabase.from('unidades').update({
        nome, status, atualizado_por: user?.id, atualizado_em: new Date().toISOString()
      }).eq('id', unidade.id)
      if (error) { setErro('Erro ao salvar.'); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('unidades').insert({
        nome, status, empresa_id: empresaId,
        criado_por: user?.id, atualizado_por: user?.id
      })
      if (error) { setErro('Erro ao criar unidade.'); setSalvando(false); return }
    }

    onSalvo?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{isEdicao ? 'Editar unidade' : 'Nova unidade'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da unidade</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da unidade"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as 'ativo' | 'inativo')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancelar</button>
            <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : isEdicao ? 'Salvar' : 'Criar unidade'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
