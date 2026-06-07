'use client'

import { useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { recursos, Recurso } from './permissoes'
import { createClient } from '@/lib/supabase'

interface Perfil {
  id: string
  nome: string
  publico: boolean
  permissoes: string[] // 'recurso.acao' ou 'recurso' para acesso total
}

interface Props {
  perfil?: Perfil
  empresaId: string
  onClose: () => void
}

function permKey(recurso: string, acao?: string) {
  return acao ? `${recurso}.${acao}` : recurso
}

export function PerfilModal({ perfil, empresaId, onClose }: Props) {
  const isEdicao = !!perfil
  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [publico, setPublico] = useState(perfil?.publico ?? false)
  const [perms, setPerms] = useState<Set<string>>(new Set(perfil?.permissoes ?? []))
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function toggleExpand(key: string) {
    setExpandidos(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  function isRecursoChecked(r: Recurso) {
    if (r.acoes.length === 0) return perms.has(r.key)
    return r.acoes.every(a => perms.has(permKey(r.key, a.key)))
  }

  function isRecursoIndeterminate(r: Recurso) {
    if (r.acoes.length === 0) return false
    const checked = r.acoes.filter(a => perms.has(permKey(r.key, a.key)))
    return checked.length > 0 && checked.length < r.acoes.length
  }

  function toggleRecurso(r: Recurso) {
    setPerms(prev => {
      const n = new Set(prev)
      if (r.acoes.length === 0) {
        n.has(r.key) ? n.delete(r.key) : n.add(r.key)
      } else {
        const allChecked = isRecursoChecked(r)
        r.acoes.forEach(a => {
          const k = permKey(r.key, a.key)
          allChecked ? n.delete(k) : n.add(k)
        })
      }
      return n
    })
  }

  function toggleAcao(recurso: string, acao: string) {
    const k = permKey(recurso, acao)
    setPerms(prev => {
      const n = new Set(prev)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const supabase = createClient()

    if (isEdicao) {
      const { error } = await supabase.from('perfis').update({ nome }).eq('id', perfil.id)
      if (error) { setErro('Erro ao salvar perfil.'); setSalvando(false); return }
    } else {
      const { data: novoPerfil, error } = await supabase
        .from('perfis').insert({ nome, empresa_id: empresaId, is_system: false }).select('id').single()
      if (error || !novoPerfil) { setErro('Erro ao criar perfil.'); setSalvando(false); return }

      // Salva permissões
      if (perms.size > 0) {
        const { data: permsDb } = await supabase.from('permissoes').select('id, recurso, acao')
        if (permsDb) {
          const inserts = permsDb
            .filter(p => perms.has(`${p.recurso}.${p.acao}`) || perms.has(p.recurso))
            .map(p => ({ perfil_id: novoPerfil.id, permissao_id: p.id }))
          if (inserts.length > 0) await supabase.from('perfil_permissoes').insert(inserts)
        }
      }
    }

    setSalvando(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">
            {isEdicao ? 'Editar perfil' : 'Criar novo perfil'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex flex-col flex-1">
          <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do perfil</label>
                <input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Nome do perfil"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  required
                />
              </div>
              <div className="flex flex-col items-center gap-1 pt-1">
                <span className="text-xs text-gray-500 whitespace-nowrap">Perfil público</span>
                <button
                  type="button"
                  onClick={() => setPublico(!publico)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${publico ? 'bg-orange-500' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${publico ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              <strong>Perfil público:</strong> pode ser atribuído a um usuário diretamente pela gestão de
              usuários do grupo/setor (ex: substituição temporária de um líder em férias, sem precisar do
              administrador da empresa). Perfis <strong>não públicos</strong> só podem ser atribuídos pelo
              administrador da empresa.
            </p>
          </div>

          {/* Árvore de permissões */}
          <div className="flex-1 overflow-y-auto px-6 py-2">
            {recursos.map(r => {
              const checked = isRecursoChecked(r)
              const indeterminate = isRecursoIndeterminate(r)
              const expanded = expandidos.has(r.key)

              return (
                <div key={r.key} className="py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    {/* Expand/collapse */}
                    {r.acoes.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.key)}
                        className="text-orange-400 hover:text-orange-600 flex-shrink-0"
                      >
                        {expanded ? <Minus size={16} /> : <Plus size={16} />}
                      </button>
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}

                    {/* Checkbox do recurso */}
                    <button
                      type="button"
                      onClick={() => toggleRecurso(r)}
                      className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                        checked
                          ? 'bg-orange-500 border-orange-500'
                          : indeterminate
                          ? 'bg-orange-100 border-orange-400'
                          : 'border-gray-300 hover:border-orange-400'
                      }`}
                    >
                      {checked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      {indeterminate && <span className="w-2 h-0.5 bg-orange-500 block" />}
                    </button>

                    <span
                      className="text-sm text-gray-700 cursor-pointer select-none"
                      onClick={() => r.acoes.length > 0 && toggleExpand(r.key)}
                    >
                      {r.label}
                    </span>
                  </div>

                  {/* Sub-ações */}
                  {expanded && r.acoes.length > 0 && (
                    <div className="ml-10 mt-1.5 space-y-1.5">
                      {r.acoes.map(a => {
                        const k = permKey(r.key, a.key)
                        const acaoChecked = perms.has(k)
                        return (
                          <div key={a.key} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleAcao(r.key, a.key)}
                              className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                                acaoChecked
                                  ? 'bg-orange-500 border-orange-500'
                                  : 'border-gray-300 hover:border-orange-400'
                              }`}
                            >
                              {acaoChecked && (
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </button>
                            <span className="text-sm text-gray-500">{a.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {erro && <p className="px-6 pb-2 text-xs text-red-500">{erro}</p>}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
              Cancelar
            </button>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : isEdicao ? 'Salvar alterações' : 'Criar perfil'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
