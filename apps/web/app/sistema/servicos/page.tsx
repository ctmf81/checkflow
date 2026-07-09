'use client'

import { useEffect, useState } from 'react'
import { Plus, ListChecks, Pencil, Trash2, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { recursos as recursosRegistry } from '@/app/gestao/acessos/perfis/permissoes'

type TipoServico = 'modulo' | 'caracteristica'

interface Servico {
  id: string
  chave: string
  nome: string
  descricao: string | null
  tipo: TipoServico
  recursos: string[]
  flag: string | null
  ordem: number
  ativo: boolean
}

// Recursos disponíveis p/ mapear (do construtor de perfil), fora core.
const RECURSOS_OPCOES = recursosRegistry
  .filter(r => !['home', 'usuarios', 'perfis'].includes(r.key))
  .map(r => ({ key: r.key, label: r.label }))

export default function ServicosPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [servicos, setServicos] = useState<Servico[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Servico | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  async function carregar() {
    setLoading(true)
    const { data } = await createClient().from('servicos').select('*').order('ordem').order('nome')
    setServicos((data ?? []) as Servico[])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function excluir(s: Servico) {
    if (!await confirm({ titulo: `Excluir o serviço "${s.nome}"?`, mensagem: 'Ele será removido dos planos que o incluem.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('servicos').delete().eq('id', s.id)
    if (error) { toast.error('Erro ao excluir.'); return }
    toast.success('Serviço excluído.')
    carregar()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Serviços</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Catálogo de serviços (módulos e características). Cada plano marca quais inclui; o módulo libera os recursos de permissão no perfil/menu da empresa.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditando(null); setModalAberto(true) }}><Plus size={14} /> Novo serviço</Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : servicos.length === 0 ? (
        <div className="py-16 text-center">
          <ListChecks size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum serviço cadastrado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {servicos.map(s => (
            <div key={s.id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-800">{s.nome}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.tipo === 'modulo' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>{s.tipo === 'modulo' ? 'Módulo' : 'Característica'}</span>
                  {!s.ativo && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Inativo</span>}
                </div>
                {s.descricao && <p className="text-xs text-gray-400 mt-0.5">{s.descricao}</p>}
                {s.tipo === 'modulo' && s.recursos.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">Recursos: {s.recursos.join(', ')}</p>
                )}
                {s.tipo === 'caracteristica' && s.flag && <p className="text-xs text-gray-400 mt-0.5">Flag: {s.flag}</p>}
              </div>
              <button onClick={() => { setEditando(s); setModalAberto(true) }} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
              <button onClick={() => excluir(s)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {modalAberto && <ServicoModal servico={editando} onClose={() => setModalAberto(false)} onSaved={() => { setModalAberto(false); carregar() }} />}
    </>
  )
}

function ServicoModal({ servico, onClose, onSaved }: { servico: Servico | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)
  const [chave, setChave] = useState(servico?.chave ?? '')
  const [nome, setNome] = useState(servico?.nome ?? '')
  const [descricao, setDescricao] = useState(servico?.descricao ?? '')
  const [tipo, setTipo] = useState<TipoServico>(servico?.tipo ?? 'modulo')
  const [recursosSel, setRecursosSel] = useState<Set<string>>(new Set(servico?.recursos ?? []))
  const [flag, setFlag] = useState(servico?.flag ?? '')
  const [ordem, setOrdem] = useState(servico?.ordem != null ? String(servico.ordem) : '0')
  const [ativo, setAtivo] = useState(servico?.ativo ?? true)

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome.'); return }
    const chaveFinal = (chave.trim() || nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')).replace(/^_+|_+$/g, '')
    if (!chaveFinal) { toast.error('Chave inválida.'); return }
    setSalvando(true)
    const payload = {
      chave: chaveFinal, nome: nome.trim(), descricao: descricao.trim() || null, tipo,
      recursos: tipo === 'modulo' ? Array.from(recursosSel) : [],
      flag: tipo === 'caracteristica' ? (flag.trim() || null) : null,
      ordem: Number(ordem || 0), ativo,
    }
    const sb = createClient()
    const { error } = servico
      ? await sb.from('servicos').update(payload).eq('id', servico.id)
      : await sb.from('servicos').insert(payload)
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar (chave duplicada?).'); return }
    toast.success(servico ? 'Serviço atualizado.' : 'Serviço criado.')
    onSaved()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">{servico ? 'Editar serviço' : 'Novo serviço'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
              <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} placeholder="ex: Tickets" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Chave <span className="text-gray-400 font-normal">(auto)</span></label>
              <input value={chave} onChange={e => setChave(e.target.value)} className={inputCls} placeholder="tickets" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} className={inputCls} placeholder="Aparece na comparação de planos" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as TipoServico)} className={inputCls}>
                <option value="modulo">Módulo (libera recursos)</option>
                <option value="caracteristica">Característica (flag)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ordem</label>
              <input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} className={inputCls} />
            </div>
          </div>

          {tipo === 'modulo' ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Recursos liberados</label>
              <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto">
                {RECURSOS_OPCOES.map(r => (
                  <label key={r.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={recursosSel.has(r.key)}
                      onChange={e => setRecursosSel(prev => { const n = new Set(prev); e.target.checked ? n.add(r.key) : n.delete(r.key); return n })}
                      className="accent-orange-500" />
                    {r.label} <span className="text-xs text-gray-400">({r.key})</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Flag <span className="text-gray-400 font-normal">(ex.: ia)</span></label>
              <input value={flag} onChange={e => setFlag(e.target.value)} className={inputCls} placeholder="ia" />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-orange-500" />
            Serviço ativo
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
