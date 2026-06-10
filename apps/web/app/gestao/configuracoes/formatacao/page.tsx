'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

export default function FormatacaoPage() {
  const { unidadeAtiva, setUnidadeAtiva } = useSession()
  const [grupoLabel, setGrupoLabel] = useState('')
  const [subgrupoLabel, setSubgrupoLabel] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    createClient()
      .from('unidades').select('grupo_label, subgrupo_label').eq('id', unidadeAtiva.id).single()
      .then(({ data }) => {
        setGrupoLabel(data?.grupo_label || 'Grupo')
        setSubgrupoLabel(data?.subgrupo_label || 'Subgrupo')
        setLoading(false)
      })
  }, [unidadeAtiva?.id])

  async function salvar() {
    if (!unidadeAtiva?.id) return
    setSalvando(true)
    await createClient().from('unidades').update({
      grupo_label: grupoLabel || 'Grupo',
      subgrupo_label: subgrupoLabel || 'Subgrupo',
    }).eq('id', unidadeAtiva.id)

    // Atualiza o contexto de sessão para refletir imediatamente
    setUnidadeAtiva({ ...unidadeAtiva })
    setSalvando(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
      <p className="text-xs text-gray-400 mt-1">Selecione uma unidade no cabeçalho.</p>
    </div>
  )

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  const cfg = getOnboardingConfig('config-formatacao')!

  return (
    <div className="max-w-lg">
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <h1 className="text-xl font-semibold text-gray-800 mb-1">Formatação</h1>
      <p className="text-sm text-gray-500 mb-6">
        Defina como grupos e subgrupos são chamados na unidade <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span>.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Como chamar os <strong>grupos</strong>
          </label>
          <p className="text-xs text-gray-400 mb-2">Este nome aparece nos menus, títulos e botões relacionados a grupos.</p>
          <input
            value={grupoLabel}
            onChange={e => setGrupoLabel(e.target.value)}
            placeholder="ex: Grupo, Setor, Departamento, Distrito"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <p className="text-xs text-gray-400 mt-1">Padrão: <em>Grupo</em></p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Como chamar os <strong>subgrupos</strong>
          </label>
          <p className="text-xs text-gray-400 mb-2">Este nome aparece nos menus, títulos e botões relacionados a subgrupos.</p>
          <input
            value={subgrupoLabel}
            onChange={e => setSubgrupoLabel(e.target.value)}
            placeholder="ex: Subgrupo, Área, Loja, Célula, Linha"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <p className="text-xs text-gray-400 mt-1">Padrão: <em>Subgrupo</em></p>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">Preview</p>
          <div className="flex gap-2 flex-wrap">
            <span className="bg-orange-50 text-orange-600 text-xs px-2.5 py-1 rounded-full font-medium">
              Criar novo {(grupoLabel || 'Grupo').toLowerCase()}
            </span>
            <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full font-medium">
              Criar novo {(subgrupoLabel || 'Subgrupo').toLowerCase()}
            </span>
            <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full font-medium">
              {grupoLabel || 'Grupo'} → {subgrupoLabel || 'Subgrupo'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {salvo && <span className="text-xs text-green-600 font-medium">✓ Salvo com sucesso</span>}
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar formatação'}
          </Button>
        </div>
      </div>
    </div>
  )
}
