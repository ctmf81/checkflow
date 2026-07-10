'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm, useToast } from '@/components/ui/feedback'

interface Categoria { id: string; nome: string; pai_id: string | null; e_generica: boolean; ativo: boolean }

export default function TicketCategoriasPage() {
  const { unidadeAtiva } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const supabase = createClient()

  const [cats,    setCats]    = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [editId,  setEditId]  = useState<string | null>(null)
  const [nome,    setNome]    = useState('')
  const [paiId,   setPaiId]   = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mostrando, setMostrando] = useState<'form' | null>(null)

  async function carregar() {
    if (!unidadeAtiva) return
    setLoading(true)
    const { data } = await supabase
      .from('ticket_categorias').select('*')
      .eq('unidade_id', unidadeAtiva.id).order('nome')
    setCats(data ?? [])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [unidadeAtiva])

  function iniciarNova(paiIdParam: string | null = null) {
    setEditId(null); setNome(''); setPaiId(paiIdParam); setMostrando('form')
  }
  function iniciarEditar(c: Categoria) {
    setEditId(c.id); setNome(c.nome); setPaiId(c.pai_id); setMostrando('form')
  }

  async function salvar() {
    if (!nome.trim() || !unidadeAtiva) return
    setSalvando(true)
    if (editId) {
      await supabase.from('ticket_categorias').update({ nome: nome.trim() }).eq('id', editId)
    } else {
      await supabase.from('ticket_categorias').insert({ unidade_id: unidadeAtiva.id, nome: nome.trim(), pai_id: paiId })
    }
    setSalvando(false); setMostrando(null); carregar()
  }

  async function excluir(c: Categoria) {
    if (c.e_generica) return
    if (!await confirm({ titulo: `Excluir categoria "${c.nome}"?`, confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await supabase.from('ticket_categorias').update({ ativo: false }).eq('id', c.id)
    if (error) { toast.error('Não foi possível excluir a categoria.'); return }
    toast.success('Categoria excluída.')
    carregar()
  }

  const raizes = cats.filter(c => !c.pai_id)
  const filhos = (paiId: string) => cats.filter(c => c.pai_id === paiId)

  const cfg = getOnboardingConfig('tickets-categorias')!

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Categorias de Tickets</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">Árvore de categorias para classificar os chamados</p>
        </div>
        <button onClick={() => iniciarNova(null)}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus size={15} /> Nova
        </button>
      </div>

      {mostrando === 'form' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {paiId ? `Subcategoria de: ${cats.find(c => c.id === paiId)?.nome}` : 'Categoria raiz'}
            </label>
            <input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da categoria"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={salvar} disabled={salvando || !nome.trim()}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            {salvando && <Loader2 size={13} className="animate-spin" />}
            {editId ? 'Salvar' : 'Criar'}
          </button>
          <button onClick={() => setMostrando(null)}
            className="border border-gray-200 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>
      ) : raizes.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">Nenhuma categoria cadastrada.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {raizes.map(cat => (
            <div key={cat.id}>
              <div className="flex items-center px-4 py-3 gap-2">
                <span className="flex-1 text-sm font-medium text-gray-800">{cat.nome}</span>
                {cat.e_generica && <span className="text-xs text-gray-400 italic">padrão</span>}
                {!cat.e_generica && (
                  <>
                    <button onClick={() => iniciarNova(cat.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
                      + Subcategoria
                    </button>
                    <button onClick={() => iniciarEditar(cat)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => excluir(cat)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
              {filhos(cat.id).map(sub => (
                <div key={sub.id} className="flex items-center pl-8 pr-4 py-2.5 gap-2 bg-gray-50/50">
                  <ChevronRight size={12} className="text-gray-300 shrink-0" />
                  <span className="flex-1 text-sm text-gray-600">{sub.nome}</span>
                  <button onClick={() => iniciarEditar(sub)}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => excluir(sub)}
                    className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
