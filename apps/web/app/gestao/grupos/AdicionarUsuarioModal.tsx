'use client'

import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AutocompleteUsuario } from '@/components/ui/AutocompleteUsuario'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Props {
  grupoId: string
  grupoNome: string
  subgrupoLabel: string
  onClose: () => void
  onSalvo?: () => void
}

interface Usuario { id: string; nome: string; email: string }
interface Subgrupo { id: string; nome: string }

// Valores do enum da coluna usuario_subgrupo.funcao (migration 20260606000008).
// ATENÇÃO: precisa ser exatamente 'operacao' | 'nivel_1' | 'nivel_2' — gravar o
// rótulo ('Nível 1') viola a constraint e o upsert falha em silêncio.
type Funcao = 'operacao' | 'nivel_1' | 'nivel_2'

export function AdicionarUsuarioModal({ grupoId, grupoNome, subgrupoLabel, onClose, onSalvo }: Props) {
  const { empresaAtiva } = useSession()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [usuarioId, setUsuarioId] = useState('')
  const [subgruposSelecionados, setSubgruposSelecionados] = useState<string[]>([])
  const [funcao, setFuncao] = useState<Funcao>('operacao')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()

      // Usuários da empresa
      if (empresaAtiva?.id) {
        const { data: ue } = await supabase
          .from('usuario_empresa')
          .select('usuario:usuario_id(id, nome, email)')
          .eq('empresa_id', empresaAtiva.id)
        if (ue) setUsuarios(ue.map((r: any) => r.usuario).filter(Boolean))
      }

      // Subgrupos do grupo
      const { data: subs } = await supabase
        .from('subgrupos')
        .select('id, nome')
        .eq('grupo_id', grupoId)
        .eq('status', 'ativo')
        .order('nome')
      if (subs) setSubgrupos(subs)

      setLoading(false)
    }
    carregar()
  }, [grupoId, empresaAtiva?.id])

  function toggleSubgrupo(id: string) {
    setSubgruposSelecionados(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!usuarioId) { setErro('Selecione um usuário.'); return }
    setErro('')
    setSalvando(true)

    const supabase = createClient()

    // Vincula usuário ao grupo
    await supabase.from('usuario_grupo')
      .upsert({ usuario_id: usuarioId, grupo_id: grupoId })

    // Vincula às subgrupos selecionados com função
    if (subgruposSelecionados.length > 0) {
      await supabase.from('usuario_subgrupo')
        .upsert(subgruposSelecionados.map(sid => ({
          usuario_id: usuarioId,
          subgrupo_id: sid,
          funcao: funcao,
        })))
    }

    setSalvando(false)
    onSalvo?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-800">Adicionar usuário</h2>
            <p className="text-xs text-gray-400 mt-0.5">{grupoNome}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
          ) : (
            <>
              {/* Seleção de usuário */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
                <AutocompleteUsuario
                  usuarios={usuarios}
                  value={usuarioId}
                  onChange={setUsuarioId}
                  placeholder="Buscar por nome ou e-mail..."
                />
                {usuarios.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Nenhum usuário cadastrado na empresa.</p>
                )}
              </div>

              {/* Seleção de subgrupos */}
              {subgrupos.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {subgrupoLabel} com acesso
                    <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                  </label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {subgrupos.map(s => {
                      const sel = subgruposSelecionados.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleSubgrupo(s.id)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                            sel ? 'bg-orange-50 text-orange-600 font-medium' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span>{s.nome}</span>
                          {sel && <Check size={14} className="text-orange-500" />}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Se nenhum for selecionado, o usuário terá acesso a todos.
                  </p>
                </div>
              )}

              {subgrupos.length === 0 && (
                <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
                  Não há {subgrupoLabel.toLowerCase()} cadastrado neste grupo ainda.
                </p>
              )}

              {/* Seleção de função */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Função no subgrupo</label>
                <select
                  value={funcao}
                  onChange={(e) => setFuncao(e.target.value as Funcao)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  <option value="operacao">Operação — executa checklists</option>
                  <option value="nivel_1">Nível 1 — executa + modera planos de ação</option>
                  <option value="nivel_2">Nível 2 — executa + N1 + escala planos</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Define a permissão do usuário neste subgrupo.
                </p>
              </div>
            </>
          )}

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
              Cancelar
            </button>
            <Button type="submit" disabled={salvando || loading}>
              {salvando ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
