'use client'

import { useEffect, useState } from 'react'
import { X, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import type { Catalogo } from './NovoCatalogoModal'

interface Props {
  catalogo: Catalogo
  onClose: () => void
  onDuplicado?: () => void
}

interface Unidade { id: string; nome: string }

export function DuplicarCatalogoModal({ catalogo, onClose, onDuplicado }: Props) {
  const { unidadeAtiva, empresaAtiva } = useSession()
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [unidadeId, setUnidadeId] = useState(unidadeAtiva?.id ?? '')
  const [duplicando, setDuplicando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!empresaAtiva?.id) return
    createClient().from('unidades').select('id, nome')
      .eq('empresa_id', empresaAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => { if (data) setUnidades(data) })
  }, [empresaAtiva?.id])

  async function duplicar() {
    if (!unidadeId) { setErro('Selecione uma unidade.'); return }
    setErro('')
    setDuplicando(true)
    const supabase = createClient()

    // Cria o catálogo duplicado
    const { data: novo, error } = await supabase.from('catalogos').insert({
      nome: `${catalogo.nome} (cópia)`,
      descricao: catalogo.descricao,
      campo_chave: catalogo.campo_chave,
      atributo_1: catalogo.atributo_1,
      atributo_2: catalogo.atributo_2,
      atributo_3: catalogo.atributo_3,
      atributo_4: catalogo.atributo_4,
      unidade_id: unidadeId,
      status: 'ativo',
    }).select('id').single()

    if (error || !novo) { setErro('Erro ao duplicar.'); setDuplicando(false); return }

    // Duplica os valores
    const { data: valores } = await supabase.from('catalogo_valores')
      .select('valor_chave, atributo_1, atributo_2, atributo_3, atributo_4, imagem_url')
      .eq('catalogo_id', catalogo.id)

    if (valores && valores.length > 0) {
      await supabase.from('catalogo_valores').insert(
        valores.map(v => ({ ...v, catalogo_id: novo.id }))
      )
    }

    setDuplicando(false)
    onDuplicado?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Copy size={16} className="text-orange-400" />
            <h2 className="font-semibold text-gray-800">Duplicar catálogo</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Duplicando: <span className="font-medium text-gray-700">{catalogo.nome}</span>
          </p>
          <p className="text-xs text-gray-400">
            Serão copiados a estrutura do catálogo e todos os seus valores.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unidade de destino</label>
            <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Selecione a unidade</option>
              {unidades.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nome}{u.id === unidadeAtiva?.id ? ' (atual)' : ''}
                </option>
              ))}
            </select>
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={duplicar} disabled={duplicando || !unidadeId}>
              {duplicando ? 'Duplicando...' : 'Duplicar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
