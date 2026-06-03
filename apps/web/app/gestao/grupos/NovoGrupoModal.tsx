'use client'

import { useState } from 'react'
import { X, LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Props {
  onClose: () => void
  onCriado?: () => void
}

export function NovoGrupoModal({ onClose, onCriado }: Props) {
  const { unidadeAtiva } = useSession()
  const [nome, setNome] = useState('')
  const [grupoLabel, setGrupoLabel] = useState('')       // como este grupo é chamado (ex: Setor)
  const [subgrupoLabel, setSubgrupoLabel] = useState('') // como os subgrupos são chamados (ex: Área)
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!unidadeAtiva?.id) { setErro('Nenhuma unidade selecionada.'); return }
    setErro('')
    setSalvando(true)

    const { error } = await createClient().from('grupos').insert({
      nome,
      display_name: grupoLabel || null,
      grupo_label: grupoLabel || null,
      subgrupo_label: subgrupoLabel || null,
      descricao: descricao || null,
      unidade_id: unidadeAtiva.id,
      status: 'ativo',
    })

    setSalvando(false)
    if (error) { setErro('Erro ao criar grupo. Tente novamente.'); return }

    onCriado?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800">Novo grupo</h2>
            {unidadeAtiva && (
              <p className="text-xs text-gray-400 mt-0.5">Unidade: <span className="text-orange-500 font-medium">{unidadeAtiva.nome}</span></p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do grupo</label>
                <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do grupo"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Como chamar o grupo
                    <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                  </label>
                  <input value={grupoLabel} onChange={e => setGrupoLabel(e.target.value)}
                    placeholder="ex: Setor, Área..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Como chamar os subgrupos
                    <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                  </label>
                  <input value={subgrupoLabel} onChange={e => setSubgrupoLabel(e.target.value)}
                    placeholder="ex: Área, Loja..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
                  placeholder="Descrição do grupo" rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
              </div>
            </div>

            <div className="flex items-start pt-6">
              <div className="relative">
                <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center">
                  <LayoutTemplate size={28} className="text-orange-300" />
                </div>
                <span className="absolute -bottom-1 -right-1 bg-orange-500 rounded-full w-5 h-5 flex items-center justify-center text-white text-xs font-bold">+</span>
              </div>
            </div>
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancelar</button>
            <Button type="submit" disabled={salvando || !unidadeAtiva}>
              {salvando ? 'Criando...' : 'Criar grupo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
