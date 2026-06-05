'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, AlertCircle, Database, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { NovoCatalogoModal, Catalogo } from './NovoCatalogoModal'
import { ValoresModal } from './ValoresModal'

interface CatalogoCard extends Catalogo {
  totalValores: number
}

export default function CatalogosPage() {
  const { unidadeAtiva } = useSession()
  const [catalogos, setCatalogos] = useState<CatalogoCard[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [editando, setEditando] = useState<Catalogo | undefined>()
  const [valoresCatalogo, setValoresCatalogo] = useState<Catalogo | null>(null)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('catalogos')
      .select('id, nome, descricao, campo_chave, atributo_1, atributo_2, atributo_3, atributo_4')
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
    if (!confirm(`Excluir catálogo "${nome}"? Todos os valores serão removidos.`)) return
    await createClient().from('catalogos').update({ status: 'inativo' }).eq('id', id)
    carregar()
  }

  function handleSalvo(cat: Catalogo) {
    setModalNovo(false)
    setEditando(undefined)
    carregar()
    // Após criar, abre direto o gerenciador de valores
    if (!editando) setValoresCatalogo(cat)
  }

  const atributoCount = (c: Catalogo) =>
    [c.atributo_1, c.atributo_2, c.atributo_3, c.atributo_4].filter(Boolean).length

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  return (
    <>
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
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => { setEditando(cat); setModalNovo(true) }}
                    className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => excluir(cat.id, cat.nome)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Estrutura */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                  🔑 {cat.campo_chave}
                </span>
                {[cat.atributo_1, cat.atributo_2, cat.atributo_3, cat.atributo_4]
                  .filter(Boolean).map((a, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {a}
                    </span>
                  ))}
              </div>

              {/* Botão de valores */}
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
        <NovoCatalogoModal
          catalogo={editando}
          onClose={() => { setModalNovo(false); setEditando(undefined) }}
          onSalvo={handleSalvo}
        />
      )}

      {valoresCatalogo && (
        <ValoresModal
          catalogo={valoresCatalogo}
          onClose={() => { setValoresCatalogo(null); carregar() }}
        />
      )}
    </>
  )
}
