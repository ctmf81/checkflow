'use client'

import { useState } from 'react'
import { X, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

export interface Catalogo {
  id: string
  nome: string
  descricao: string | null
  campo_chave: string
  atributo_1: string | null
  atributo_2: string | null
  atributo_3: string | null
  atributo_4: string | null
}

interface Props {
  catalogo?: Catalogo
  onClose: () => void
  onSalvo: (catalogo: Catalogo) => void
}

export function NovoCatalogoModal({ catalogo, onClose, onSalvo }: Props) {
  const { unidadeAtiva } = useSession()
  const isEdicao = !!catalogo

  const [nome, setNome] = useState(catalogo?.nome ?? '')
  const [descricao, setDescricao] = useState(catalogo?.descricao ?? '')
  const [campoChave, setCampoChave] = useState(catalogo?.campo_chave ?? '')
  const [attrs, setAttrs] = useState([
    catalogo?.atributo_1 ?? '',
    catalogo?.atributo_2 ?? '',
    catalogo?.atributo_3 ?? '',
    catalogo?.atributo_4 ?? '',
  ])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function setAttr(i: number, v: string) {
    setAttrs(prev => prev.map((a, idx) => idx === i ? v : a))
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome do catálogo.'); return }
    if (!campoChave.trim()) { setErro('Informe o nome do campo chave.'); return }
    setErro('')
    setSalvando(true)
    const supabase = createClient()

    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      campo_chave: campoChave.trim(),
      atributo_1: attrs[0].trim() || null,
      atributo_2: attrs[1].trim() || null,
      atributo_3: attrs[2].trim() || null,
      atributo_4: attrs[3].trim() || null,
    }

    if (isEdicao) {
      const { error } = await supabase.from('catalogos')
        .update({ ...payload, atualizado_em: new Date().toISOString() }).eq('id', catalogo.id)
      if (error) { setErro('Erro ao salvar.'); setSalvando(false); return }
      onSalvo({ id: catalogo.id, ...payload })
    } else {
      const { data, error } = await supabase.from('catalogos')
        .insert({ ...payload, unidade_id: unidadeAtiva?.id, status: 'ativo' })
        .select('id, nome, descricao, campo_chave, atributo_1, atributo_2, atributo_3, atributo_4')
        .single()
      if (error || !data) { setErro('Erro ao criar.'); setSalvando(false); return }
      onSalvo(data as Catalogo)
    }
    setSalvando(false)
  }

  const attrExemplos = ['Nome do produto', 'Acabamento', 'Formato', 'Nº de faces']

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">{isEdicao ? 'Editar Catálogo' : 'Novo Catálogo'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Catálogo</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="nome do catálogo"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" autoFocus />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição do Catálogo</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="descrição do catálogo" rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
              Nome do campo chave <Info size={13} className="text-gray-400" />
            </label>
            <input value={campoChave} onChange={e => setCampoChave(e.target.value)} placeholder="nome do campo chave"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            <p className="text-xs text-orange-500 font-medium mt-1">Ex.: Código do Produto</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do atributo {i + 1}</label>
                <input value={attrs[i]} onChange={e => setAttr(i, e.target.value)}
                  placeholder={`atributo ${i + 1}`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                {i === 0 && <p className="text-xs text-orange-500 font-medium mt-1">Ex.: {attrExemplos[0]}</p>}
              </div>
            ))}
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : isEdicao ? 'Salvar' : 'Continuar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
