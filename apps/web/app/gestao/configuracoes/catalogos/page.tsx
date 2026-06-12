'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, AlertCircle, Database, ChevronRight, MoreVertical, Pencil, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm } from '@/components/ui/feedback'
import { NovoCatalogoModal, Catalogo } from './NovoCatalogoModal'
import { ValoresModal } from './ValoresModal'
import { DuplicarCatalogoModal } from './DuplicarCatalogoModal'

interface CatalogoCard extends Catalogo { totalValores: number }

function CardMenu({ catalogo, onEditar, onDuplicar, onExcluir }: {
  catalogo: Catalogo
  onEditar: () => void
  onDuplicar: () => void
  onExcluir: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={() => setAberto(!aberto)}
        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
        <MoreVertical size={15} />
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100 truncate">{catalogo.nome}</div>
          <button onClick={() => { setAberto(false); onEditar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <Pencil size={13} className="text-gray-400" />Editar
          </button>
          <button onClick={() => { setAberto(false); onDuplicar() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <Copy size={13} className="text-gray-400" />Duplicar
          </button>
          <div className="border-t border-gray-100 mt-1">
            <button onClick={() => { setAberto(false); onExcluir() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50">
              <Trash2 size={13} />Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CatalogosPage() {
  const { unidadeAtiva } = useSession()
  const confirm = useConfirm()
  const [catalogos, setCatalogos] = useState<CatalogoCard[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [editando, setEditando] = useState<Catalogo | undefined>()
  const [valoresCatalogo, setValoresCatalogo] = useState<Catalogo | null>(null)
  const [duplicando, setDuplicando] = useState<Catalogo | null>(null)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('catalogos')
      .select('id, nome, descricao, campo_chave, atributo_1, atributo_2, atributo_3, atributo_4, api_url, api_headers, api_mapeamento')
      .eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')

    if (data) {
      const comContagens = await Promise.all(data.map(async c => {
        const { count } = await supabase.from('catalogo_valores')
          .select('id', { count: 'exact', head: true }).eq('catalogo_id', c.id)
        return { ...c, totalValores: count ?? 0 }
      }))
      setCatalogos(comContagens)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])

  async function excluir(id: string, nome: string) {
    if (!await confirm({ titulo: `Excluir catálogo "${nome}"?`, mensagem: 'Todos os valores serão removidos.', confirmarLabel: 'Excluir', perigo: true })) return
    await createClient().from('catalogos').update({ status: 'inativo' }).eq('id', id)
    carregar()
  }

  function handleSalvo(cat: Catalogo) {
    setModalNovo(false)
    setEditando(undefined)
    carregar()
    if (!editando) setValoresCatalogo(cat)
  }

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  const cfg = getOnboardingConfig('config-catalogos')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Catálogos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Campos dinâmicos com atributos vinculados a um código</p>
          <p className="text-xs text-gray-400 mt-0.5">Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={() => { setEditando(undefined); setModalNovo(true) }}>
          <Plus size={16} />Novo catálogo
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : catalogos.length === 0 ? (
        <div className="py-16 text-center">
          <Database size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum catálogo cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {catalogos.map(cat => (
            <div key={cat.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800">{cat.nome}</h3>
                  {cat.descricao && <p className="text-xs text-gray-400 mt-0.5 truncate">{cat.descricao}</p>}
                </div>
                <CardMenu
                  catalogo={cat}
                  onEditar={() => { setEditando(cat); setModalNovo(true) }}
                  onDuplicar={() => setDuplicando(cat)}
                  onExcluir={() => excluir(cat.id, cat.nome)}
                />
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                  🔑 {cat.campo_chave}
                </span>
                {[cat.atributo_1, cat.atributo_2, cat.atributo_3, cat.atributo_4]
                  .filter(Boolean).map((a, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a}</span>
                  ))}
              </div>

              <button onClick={() => setValoresCatalogo(cat)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-orange-50 rounded-lg transition-colors group">
                <div className="flex items-center gap-2">
                  <Database size={14} className="text-gray-400 group-hover:text-orange-400" />
                  <span className="text-sm text-gray-600 group-hover:text-orange-600">
                    <span className="font-semibold">{cat.totalValores}</span> valores cadastrados
                  </span>
                </div>
                <ChevronRight size={14} className="text-gray-400 group-hover:text-orange-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {modalNovo && (
        <NovoCatalogoModal catalogo={editando}
          onClose={() => { setModalNovo(false); setEditando(undefined) }}
          onSalvo={handleSalvo} />
      )}

      {valoresCatalogo && (
        <ValoresModal catalogo={valoresCatalogo}
          onClose={() => { setValoresCatalogo(null); carregar() }} />
      )}

      {duplicando && (
        <DuplicarCatalogoModal catalogo={duplicando}
          onClose={() => setDuplicando(null)}
          onDuplicado={() => { setDuplicando(null); carregar() }} />
      )}
    </>
  )
}
