'use client'

import { useEffect, useState } from 'react'
import { Compass, Eye, EyeOff, Pencil, Save, X, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { ONBOARDING_REGISTRY, getOnboardingConfig } from '@/components/onboarding/registry'
import { OnboardingCardData } from '@/components/onboarding/OnboardingPanel'
import { Onboarding } from '@/components/onboarding/Onboarding'

interface LinhaConfig {
  page_id: string
  titulo: string
  ativo: boolean
  cards_override: OnboardingCardData[] | null
}

export default function OnboardingAdminPage() {
  const [linhas, setLinhas] = useState<LinhaConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('onboarding_paginas')
      .select('page_id, titulo, ativo, cards_override')

    const porId = new Map((data ?? []).map(d => [d.page_id, d]))

    // Mescla com o registro do código — garante que toda tela apareça,
    // mesmo que a migration ainda não tenha rodado para ela.
    const merged: LinhaConfig[] = ONBOARDING_REGISTRY.map(cfg => {
      const db = porId.get(cfg.pageId)
      return {
        page_id: cfg.pageId,
        titulo: db?.titulo ?? cfg.titulo,
        ativo: db?.ativo ?? true,
        cards_override: (db?.cards_override as OnboardingCardData[] | null) ?? null,
      }
    })

    setLinhas(merged)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function alternarAtivo(linha: LinhaConfig) {
    setSalvando(linha.page_id)
    const supabase = createClient()
    const novoAtivo = !linha.ativo
    await supabase.from('onboarding_paginas').upsert({
      page_id: linha.page_id,
      titulo: linha.titulo,
      ativo: novoAtivo,
      cards_override: linha.cards_override,
      updated_at: new Date().toISOString(),
    })
    setLinhas(ls => ls.map(l => l.page_id === linha.page_id ? { ...l, ativo: novoAtivo } : l))
    setSalvando(null)
  }

  function abrirEdicao(linha: LinhaConfig) {
    const cards = linha.cards_override ?? getOnboardingConfig(linha.page_id)?.cards ?? []
    setRascunho(JSON.stringify(cards, null, 2))
    setErro('')
    setEditando(linha.page_id)
  }

  function restaurarPadrao() {
    const cfg = getOnboardingConfig(editando ?? '')
    setRascunho(JSON.stringify(cfg?.cards ?? [], null, 2))
    setErro('')
  }

  async function salvarConteudo(linha: LinhaConfig) {
    let parsed: OnboardingCardData[]
    try {
      parsed = JSON.parse(rascunho)
      if (!Array.isArray(parsed)) throw new Error('precisa ser uma lista (array)')
    } catch (e: any) {
      setErro('JSON inválido: ' + e.message)
      return
    }

    setSalvando(linha.page_id)
    const supabase = createClient()
    const { error } = await supabase.from('onboarding_paginas').upsert({
      page_id: linha.page_id,
      titulo: linha.titulo,
      ativo: linha.ativo,
      cards_override: parsed,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      setErro('Erro ao salvar: ' + error.message)
    } else {
      setLinhas(ls => ls.map(l => l.page_id === linha.page_id ? { ...l, cards_override: parsed } : l))
      setEditando(null)
    }
    setSalvando(null)
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  const cfg = getOnboardingConfig('sistema-onboarding')!

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center gap-2 mb-1">
        <Compass size={20} className="text-orange-500" />
        <h1 className="text-xl font-semibold text-gray-800">Onboarding das telas</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Ative ou desative o painel de dicas de cada tela e edite o conteúdo exibido aos usuários.
        Desativar esconde tanto o painel quanto o ícone "?" para todos os usuários.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {linhas.map(linha => (
          <div key={linha.page_id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{linha.titulo}</p>
                <p className="text-xs text-gray-400 font-mono">{linha.page_id}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {linha.cards_override && (
                  <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">customizado</span>
                )}
                <button
                  onClick={() => abrirEdicao(linha)}
                  title="Editar conteúdo"
                  className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors">
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => alternarAtivo(linha)}
                  disabled={salvando === linha.page_id}
                  title={linha.ativo ? 'Desativar onboarding nesta tela' : 'Ativar onboarding nesta tela'}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    linha.ativo
                      ? 'bg-green-50 text-green-600 hover:bg-green-100'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}>
                  {linha.ativo ? <Eye size={13} /> : <EyeOff size={13} />}
                  {linha.ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            </div>

            {editando === linha.page_id && (
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-2">
                  Lista de cards em JSON. Campos: <code>icon</code>, <code>titulo</code>, <code>texto</code>,{' '}
                  <code>dicas</code> (array de strings, opcional), <code>fluxo</code> (array de strings, opcional).
                </p>
                <textarea
                  value={rascunho}
                  onChange={e => setRascunho(e.target.value)}
                  rows={14}
                  className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200" />
                {erro && <p className="text-xs text-red-500 mt-2">{erro}</p>}
                <div className="flex items-center justify-between mt-3">
                  <button onClick={restaurarPadrao}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                    <RotateCcw size={13} />Restaurar conteúdo padrão
                  </button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditando(null)}>
                      <X size={14} />Cancelar
                    </Button>
                    <Button onClick={() => salvarConteudo(linha)} disabled={salvando === linha.page_id}>
                      <Save size={14} />{salvando === linha.page_id ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
