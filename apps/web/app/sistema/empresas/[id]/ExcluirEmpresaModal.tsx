'use client'

import { useState } from 'react'
import { AlertTriangle, X, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

interface Props {
  empresaId: string
  empresaNome: string
  onClose: () => void
  onExcluida: () => void
}

export function ExcluirEmpresaModal({ empresaId, empresaNome, onClose, onExcluida }: Props) {
  const [confirmacao, setConfirmacao] = useState('')
  const [ciente, setCiente] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState('')

  const podeExcluir = confirmacao.trim() === empresaNome && ciente && !excluindo

  async function excluir() {
    if (!podeExcluir) return
    setExcluindo(true)
    setErro('')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch(`/api/empresas/${empresaId}/excluir`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(json.error ?? 'Erro ao excluir empresa. Verifique e tente novamente.')
        setExcluindo(false)
        return
      }
    } catch {
      setErro('Falha de conexão ao excluir a empresa.')
      setExcluindo(false)
      return
    }
    onExcluida()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <h2 className="text-base font-semibold text-gray-800">Excluir empresa permanentemente</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-600 mt-2">
          Esta ação é <strong>irreversível</strong>. Todos os dados de{' '}
          <strong>{empresaNome}</strong> — unidades, grupos, usuários vinculados, checklists,
          execuções, planos de ação, tickets e workflows — serão apagados permanentemente do banco
          de dados, <strong>incluindo os arquivos</strong> (fotos, vídeos, PDFs, logo) do armazenamento.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Para confirmar, digite o nome da empresa: <span className="font-mono text-red-600">{empresaNome}</span>
          </label>
          <input
            value={confirmacao}
            onChange={e => setConfirmacao(e.target.value)}
            placeholder={empresaNome}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-200"
          />
        </div>

        <label className="flex items-start gap-2 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={ciente}
            onChange={e => setCiente(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-gray-600">
            Estou ciente de que esta ação não pode ser desfeita e que todos os dados serão perdidos.
          </span>
        </label>

        {erro && <p className="text-xs text-red-500 mt-3">{erro}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={excluindo}>
            Cancelar
          </Button>
          <Button
            onClick={excluir}
            disabled={!podeExcluir}
            className="!bg-red-600 hover:!bg-red-700 disabled:opacity-50"
          >
            {excluindo ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {excluindo ? 'Excluindo...' : 'Excluir definitivamente'}
          </Button>
        </div>
      </div>
    </div>
  )
}
