'use client'

import { useEffect, useState } from 'react'
import { Plus, Variable, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { usePolling } from '@/lib/usePolling'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { VariavelModal, Variavel } from './VariavelModal'

export default function VariaveisPage() {
  const { unidadeAtiva } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const [variaveis, setVariaveis] = useState<Variavel[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Variavel | undefined>()

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('variaveis')
      .select('id, nome, ativo, variavel_valores(id, valor, ordem)')
      .eq('unidade_id', unidadeAtiva.id).eq('ativo', true).order('nome')

    if (data) {
      setVariaveis(data.map((v: any) => ({
        id: v.id, nome: v.nome, ativo: v.ativo,
        valores: (v.variavel_valores ?? []).sort((a: any, b: any) => a.ordem - b.ordem),
      })))
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])
  usePolling(carregar, 45000, !!unidadeAtiva?.id)

  async function excluir(v: Variavel) {
    if (!await confirm({ titulo: `Excluir a variável "${v.nome}"?`, mensagem: 'Padrões que a usam podem deixar de funcionar corretamente.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('variaveis').update({ ativo: false }).eq('id', v.id)
    if (error) { toast.error('Não foi possível excluir a variável.'); return }
    toast.success('Variável excluída.')
    carregar()
  }

  const cfg = getOnboardingConfig('padrao-variaveis')!

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Variáveis</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">Cadastre as variáveis usadas para compor padrões de validação (ex: tipo de caminhão, tipo de container)</p>
        </div>
        <Button onClick={() => { setEditando(undefined); setModal(true) }}>
          <Plus size={16} />Nova
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : variaveis.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Variable size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma variável cadastrada ainda</p>
        </div>
      ) : (
        <div className="space-y-2">
          {variaveis.map(v => (
            <div key={v.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-gray-900">{v.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">{v.valores.map(x => x.valor).join(' · ') || 'sem valores cadastrados'}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditando(v); setModal(true) }}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><Pencil size={15} /></button>
                <button onClick={() => excluir(v)}
                  className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <VariavelModal variavel={editando} onClose={() => setModal(false)}
          onSalvo={() => { setModal(false); carregar() }} />
      )}
    </div>
  )
}
