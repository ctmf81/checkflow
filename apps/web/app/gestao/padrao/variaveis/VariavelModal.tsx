'use client'

import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast } from '@/components/ui/feedback'

export interface Variavel {
  id: string
  nome: string
  ativo: boolean
  valores: { id: string; valor: string }[]
}

interface Props {
  variavel?: Variavel
  onClose: () => void
  onSalvo: () => void
}

export function VariavelModal({ variavel, onClose, onSalvo }: Props) {
  const { unidadeAtiva } = useSession()
  const toast = useToast()
  const isEdicao = !!variavel
  const [nome, setNome] = useState(variavel?.nome ?? '')
  const [valores, setValores] = useState<string[]>(variavel?.valores.map(v => v.valor) ?? [''])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function addValor() { setValores(v => [...v, '']) }
  function setValor(i: number, val: string) { setValores(v => v.map((x, idx) => idx === i ? val : x)) }
  function removerValor(i: number) { setValores(v => v.filter((_, idx) => idx !== i)) }

  async function salvar() {
    setErro('')
    const nomeOk = nome.trim()
    const valoresOk = valores.map(v => v.trim()).filter(Boolean)
    if (!nomeOk) { setErro('Informe o nome da variável.'); return }
    if (valoresOk.length === 0) { setErro('Cadastre ao menos um valor possível.'); return }

    setSalvando(true)
    const supabase = createClient()

    if (isEdicao) {
      const { error } = await supabase.from('variaveis').update({ nome: nomeOk }).eq('id', variavel.id)
      if (error) { setErro('Não foi possível salvar a variável.'); setSalvando(false); return }

      // Sincroniza valores: remove os que não existem mais, atualiza existentes, insere novos
      const existentesPorValor = new Map(variavel.valores.map(v => [v.valor, v.id]))
      const novosValoresSet = new Set(valoresOk)

      const aRemover = variavel.valores.filter(v => !novosValoresSet.has(v.valor)).map(v => v.id)
      if (aRemover.length > 0) {
        const { error: errDel } = await supabase.from('variavel_valores').delete().in('id', aRemover)
        if (errDel) { setErro('Não foi possível salvar os valores da variável.'); setSalvando(false); return }
      }

      const aInserir = valoresOk.filter(v => !existentesPorValor.has(v))
      if (aInserir.length > 0) {
        const { error: errIns } = await supabase.from('variavel_valores').insert(
          aInserir.map((valor, idx) => ({ variavel_id: variavel.id, valor, ordem: idx }))
        )
        if (errIns) { setErro('Não foi possível salvar os valores da variável.'); setSalvando(false); return }
      }
    } else {
      const { data: nova, error } = await supabase.from('variaveis')
        .insert({ nome: nomeOk, unidade_id: unidadeAtiva?.id ?? null }).select('id').single()
      if (error || !nova) { setErro('Não foi possível criar a variável.'); setSalvando(false); return }

      const { error: errIns } = await supabase.from('variavel_valores').insert(
        valoresOk.map((valor, idx) => ({ variavel_id: nova.id, valor, ordem: idx }))
      )
      if (errIns) { setErro('A variável foi criada, mas não foi possível salvar os valores. Edite-a para tentar de novo.'); setSalvando(false); return }
    }

    setSalvando(false)
    toast.success(isEdicao ? 'Variável salva.' : 'Variável criada.')
    onSalvo()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{isEdicao ? 'Editar variável' : 'Nova variável'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da variável</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: Tipo de caminhão"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Valores possíveis</label>
            <div className="space-y-2">
              {valores.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={v} onChange={e => setValor(i, e.target.value)}
                    placeholder="Ex: Toco, Truck, Bitruck..."
                    className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
                  <button onClick={() => removerValor(i)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addValor} className="mt-2 inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium">
              <Plus size={15} />Adicionar valor
            </button>
          </div>

          {erro && <p className="text-sm text-red-500">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>
    </div>
  )
}
