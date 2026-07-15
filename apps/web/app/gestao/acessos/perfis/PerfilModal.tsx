'use client'

import { useEffect, useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { recursos } from './permissoes'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast } from '@/components/ui/feedback'

// Recursos sempre disponíveis (independente do plano): administração básica.
const RECURSOS_CORE = new Set(['home', 'usuarios', 'perfis'])
import {
  permKey, recursoChecked, recursoIndeterminate, toggleRecurso, toggleAcao,
  permsFromRows, permissaoIdsToInsert,
} from '@/lib/perfis'
import { recursoVisivelNoPerfil } from '@/lib/entitlements/gating'

interface Perfil {
  id: string
  nome: string
  is_system?: boolean
}

interface Props {
  perfil?: Perfil
  empresaId: string
  onClose: () => void
}

export function PerfilModal({ perfil, empresaId, onClose }: Props) {
  const isEdicao = !!perfil
  const soLeitura = !!perfil?.is_system // perfil de sistema não é editável
  const toast = useToast()
  const { recursosHabilitados, flagsHabilitadas, grupoLabel, subgrupoLabel } = useSession()
  // Mostra recursos do plano (+ core) e os por característica quando o plano
  // inclui a flag (ex.: 'relatorios' aparece quando o plano tem IA). null = tudo.
  const recursosVisiveis = recursos.filter(r =>
    recursoVisivelNoPerfil(r, recursosHabilitados, flagsHabilitadas, RECURSOS_CORE)
  )

  // Grupos/Áreas usam o rótulo configurado da empresa (Subgrupo/Área/Loja...),
  // não o texto fixo do registro. Ex.: sem label "Área" definido → "Subgrupo".
  const plural = (s: string) => (/s$/i.test(s) ? s : s + 's')
  const trocarTermo = (texto: string, de: RegExp, termo: string) =>
    texto.replace(de, m => (m[0] === m[0].toUpperCase() ? termo : termo.toLowerCase()))
  const rotuloRecurso = (r: { key: string; label: string }) =>
    r.key === 'grupos' ? plural(grupoLabel)
      : r.key === 'subgrupos' ? plural(subgrupoLabel)
      : r.label
  const rotuloAcao = (rKey: string, label: string) =>
    rKey === 'grupos' ? trocarTermo(label, /grupos?/gi, grupoLabel)
      : rKey === 'subgrupos' ? trocarTermo(label, /subgrupos?/gi, subgrupoLabel)
      : label
  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [publico, setPublico] = useState(false)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(isEdicao)
  const [falhaCarga, setFalhaCarga] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Em edição, carrega o estado REAL do perfil (público + permissões salvas).
  // Sem isto o modal abriria zerado e o salvar apagaria as permissões existentes.
  // Se a carga falhar, bloqueia o salvar (não dá pra sobrescrever às cegas).
  useEffect(() => {
    if (!perfil) return
    const supabase = createClient()
    async function carregar() {
      const [{ data: p, error: e1 }, { data: pp, error: e2 }] = await Promise.all([
        supabase.from('perfis').select('publico').eq('id', perfil!.id).single(),
        supabase.from('perfil_permissoes').select('permissoes(recurso, acao)').eq('perfil_id', perfil!.id),
      ])
      if (e1 || e2 || !p || !pp) {
        setErro('Não foi possível carregar o perfil. Feche e tente novamente.')
        setFalhaCarga(true)
        setCarregando(false)
        return
      }
      setPublico(p.publico ?? false)
      setPerms(permsFromRows(pp.map((row: any) => row.permissoes).filter(Boolean)))
      setCarregando(false)
    }
    carregar()
  }, [perfil])

  function toggleExpand(key: string) {
    setExpandidos(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (soLeitura) return // perfil de sistema: não salva
    setErro('')
    const nomeOk = nome.trim()
    if (!nomeOk) { setErro('Informe o nome do perfil.'); return }
    setSalvando(true)
    const supabase = createClient()

    // Nome único por empresa (mesmo nome dificulta a gestão de acessos)
    const { data: existente } = await supabase
      .from('perfis').select('id').eq('empresa_id', empresaId).ilike('nome', nomeOk).maybeSingle()
    if (existente && existente.id !== perfil?.id) {
      setErro('Já existe um perfil com esse nome.'); setSalvando(false); return
    }

    // Substitui o conjunto inteiro de permissões. Retorna false se algo falhar
    // (RLS pode falhar em silêncio) para não reportar sucesso indevido.
    async function salvarPermissoes(perfilId: string): Promise<boolean> {
      const { data: permsDb, error: errLista } = await supabase.from('permissoes').select('id, recurso, acao')
      if (errLista || !permsDb) return false
      const { error: errDel } = await supabase.from('perfil_permissoes').delete().eq('perfil_id', perfilId)
      if (errDel) return false
      const inserts = permissaoIdsToInsert(permsDb, perms)
        .map(permissao_id => ({ perfil_id: perfilId, permissao_id }))
      if (inserts.length > 0) {
        const { error: errIns } = await supabase.from('perfil_permissoes').insert(inserts)
        if (errIns) return false
      }
      return true
    }

    if (isEdicao) {
      const { error } = await supabase.from('perfis').update({ nome: nomeOk, publico }).eq('id', perfil.id)
      if (error) { setErro('Não foi possível salvar o perfil.'); setSalvando(false); return }
      if (!await salvarPermissoes(perfil.id)) { setErro('Não foi possível salvar as permissões do perfil.'); setSalvando(false); return }
    } else {
      const { data: novoPerfil, error } = await supabase
        .from('perfis').insert({ nome: nomeOk, publico, empresa_id: empresaId, is_system: false }).select('id').single()
      if (error || !novoPerfil) { setErro('Não foi possível criar o perfil.'); setSalvando(false); return }
      if (!await salvarPermissoes(novoPerfil.id)) { setErro('O perfil foi criado, mas não foi possível salvar as permissões. Edite-o para tentar de novo.'); setSalvando(false); return }
    }

    setSalvando(false)
    toast.success(isEdicao ? 'Perfil salvo.' : 'Perfil criado.')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">
            {soLeitura ? 'Perfil de sistema' : isEdicao ? 'Editar perfil' : 'Criar novo perfil'}
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
                  disabled={soLeitura}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                />
              </div>
              <div className="flex flex-col items-center gap-1 pt-1">
                <span className="text-xs text-gray-500 whitespace-nowrap">Perfil público</span>
                <button
                  type="button"
                  onClick={() => !soLeitura && setPublico(!publico)}
                  disabled={soLeitura}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${publico ? 'bg-orange-500' : 'bg-gray-200'}`}
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

          {soLeitura && (
            <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700">
              Perfil de sistema — suas funções são fixas e não podem ser editadas. Visualização apenas.
            </div>
          )}

          {/* Árvore de permissões */}
          <div className="flex-1 overflow-y-auto px-6 py-2">
            {carregando && (
              <p className="text-sm text-gray-400 py-4 text-center">Carregando permissões...</p>
            )}
            {!carregando && recursosVisiveis.map(r => {
              const checked = recursoChecked(r, perms)
              const indeterminate = recursoIndeterminate(r, perms)
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
                      onClick={() => !soLeitura && setPerms(p => toggleRecurso(r, p))}
                      disabled={soLeitura}
                      className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${soLeitura ? 'cursor-not-allowed' : ''} ${
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
                      {rotuloRecurso(r)}
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
                              onClick={() => !soLeitura && setPerms(p => toggleAcao(r.key, a.key, p))}
                              disabled={soLeitura}
                              className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${soLeitura ? 'cursor-not-allowed' : ''} ${
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
                            <span className="text-sm text-gray-500">{rotuloAcao(r.key, a.label)}</span>
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
            {soLeitura ? (
              <Button type="button" onClick={onClose}>Fechar</Button>
            ) : (
              <>
                <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                  Cancelar
                </button>
                <Button type="submit" disabled={salvando || carregando || falhaCarga}>
                  {salvando ? 'Salvando...' : isEdicao ? 'Salvar alterações' : 'Criar perfil'}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
