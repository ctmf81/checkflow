'use client'

import { useState, useEffect } from 'react'
import { X, AlertTriangle, Upload, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { notificarTicket } from '@/lib/notificacoes'
import { registrarUsoArmazenamento } from '@/lib/uso'

interface Grupo    { id: string; nome: string }
interface Subgrupo { id: string; nome: string; grupo_id: string }
interface Categoria { id: string; nome: string; pai_id: string | null; e_generica: boolean }

interface Props {
  open: boolean
  onClose: () => void
  execucaoId?: string          // pré-preenche origem quando aberto da tela de operação
  onCriado?: (ticketId: string) => void
}

const PRIORIDADES = [
  { value: 'critica', label: 'Crítica',  cor: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'alta',    label: 'Alta',     cor: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'media',   label: 'Média',    cor: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'baixa',   label: 'Baixa',    cor: 'bg-green-100 text-green-700 border-green-200' },
]

export default function NovoTicketModal({ open, onClose, execucaoId, onCriado }: Props) {
  const { unidadeAtiva, empresaAtiva, grupoLabel, subgrupoLabel } = useSession()
  const supabase = createClient()

  const [grupos, setGrupos]       = useState<Grupo[]>([])
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])

  const [grupoId,    setGrupoId]    = useState('')
  const [subgrupoId, setSubgrupoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [prioridade, setPrioridade] = useState('media')
  const [titulo,     setTitulo]     = useState('')
  const [descricao,  setDescricao]  = useState('')
  const [arquivos,   setArquivos]   = useState<File[]>([])
  const [salvando,   setSalvando]   = useState(false)
  const [erro,       setErro]       = useState<string | null>(null)

  useEffect(() => {
    if (!open || !unidadeAtiva) return
    setGrupoId(''); setSubgrupoId(''); setCategoriaId(''); setSubcategoriaId('')
    setTitulo(''); setDescricao(''); setArquivos([]); setErro(null)

    supabase.from('grupos').select('id, nome').eq('unidade_id', unidadeAtiva.id).eq('status', 'ativo').order('nome')
      .then(({ data }) => setGrupos(data ?? []))

    supabase.from('ticket_categorias').select('id, nome, pai_id, e_generica').eq('unidade_id', unidadeAtiva.id).eq('ativo', true).order('nome')
      .then(({ data }) => {
        if (!data || data.length === 0) {
          // garante categoria genérica via RPC
          supabase.rpc('garantir_categoria_generica', { p_unidade_id: unidadeAtiva.id })
            .then(({ data: id }) => {
              setCategorias([{ id, nome: 'Sem categoria', pai_id: null, e_generica: true }])
              setCategoriaId(id)
            })
        } else {
          setCategorias(data)
        }
      })
  }, [open, unidadeAtiva])

  useEffect(() => {
    if (!grupoId) { setSubgrupos([]); setSubgrupoId(''); return }
    supabase.from('subgrupos').select('id, nome, grupo_id').eq('grupo_id', grupoId).eq('status', 'ativo').order('nome')
      .then(({ data }) => { setSubgrupos(data ?? []); setSubgrupoId('') })
  }, [grupoId])

  const raizes     = categorias.filter(c => !c.pai_id)
  const categoriaRaizSelecionada = categorias.find(c => c.id === categoriaId)
  const subcategorias = categorias.filter(c => c.pai_id === categoriaId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!grupoId || !subgrupoId) { setErro(`${grupoLabel} e ${subgrupoLabel} são obrigatórios.`); return }
    if (!titulo.trim())          { setErro('Informe um título para o ticket.'); return }
    if (!descricao.trim())       { setErro('Descrição é obrigatória.'); return }
    setSalvando(true); setErro(null)

    const catFinal = subcategoriaId || categoriaId || null

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErro('Sessão expirada. Faça login novamente.'); setSalvando(false); return }

    const { data: ticket, error } = await supabase.from('tickets').insert({
      unidade_id:   unidadeAtiva!.id,
      grupo_id:     grupoId,
      subgrupo_id:  subgrupoId,
      categoria_id: catFinal,
      titulo:       titulo.trim(),
      descricao:    descricao.trim(),
      prioridade,
      execucao_id:  execucaoId ?? null,
      aberto_por_id: user.id,
    }).select('id').single()

    if (error || !ticket) {
      console.error('Erro ao criar ticket:', error)
      setErro('Erro ao criar ticket. Tente novamente.')
      setSalvando(false)
      return
    }

    // evento de abertura
    await supabase.from('ticket_eventos').insert({
      ticket_id: ticket.id, tipo: 'abertura', texto: descricao.trim(), autor_id: user.id,
    })

    // upload de evidências
    for (const file of arquivos) {
      const ext  = file.name.split('.').pop()
      const path = `tickets/${ticket.id}/${Date.now()}.${ext}`
      const { data: up } = await supabase.storage.from('execucoes').upload(path, file, { upsert: false })
      if (up) {
        registrarUsoArmazenamento(empresaAtiva?.id, 'ticket', file.size)
        const { data: pub } = supabase.storage.from('execucoes').getPublicUrl(path)
        const tipo = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'foto' : 'documento'
        await supabase.from('ticket_evidencias').insert({
          ticket_id: ticket.id, url: pub.publicUrl, tipo, nome: file.name, uploaded_by: user.id,
        })
      }
    }

    // notifica grupo/subgrupo destino (fire-and-forget)
    notificarTicket({ ticket_id: ticket.id, evento: 'aberto', ator_id: user.id, texto: descricao.trim() })

    setSalvando(false)
    onCriado?.(ticket.id)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl shadow-xl flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">Abrir Ticket</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-0 overflow-y-auto">
          <div className="px-4 py-4 flex flex-col gap-4">

            {/* Prioridade */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Prioridade</label>
              <div className="flex gap-2 flex-wrap">
                {PRIORIDADES.map(p => (
                  <button key={p.value} type="button"
                    onClick={() => setPrioridade(p.value)}
                    className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${prioridade === p.value ? p.cor + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Destino: Grupo + Subgrupo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{grupoLabel} destino *</label>
                <select value={grupoId} onChange={e => setGrupoId(e.target.value)} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecione…</option>
                  {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{subgrupoLabel} destino *</label>
                <select value={subgrupoId} onChange={e => setSubgrupoId(e.target.value)} required disabled={!grupoId}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">Selecione…</option>
                  {subgrupos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
            </div>

            {/* Categoria + Subcategoria */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
                <select value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setSubcategoriaId('') }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Sem categoria</option>
                  {raizes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Subcategoria</label>
                <select value={subcategoriaId} onChange={e => setSubcategoriaId(e.target.value)} disabled={subcategorias.length === 0}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">Nenhuma</option>
                  {subcategorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            {/* Título */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Título *</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} required maxLength={120}
                placeholder="Ex: Motor da linha 3 parou"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Descrição *</label>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} required rows={3}
                placeholder="Descreva o que aconteceu, onde e quando…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {/* Evidências */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Evidências (opcional)</label>
              <label className="flex items-center gap-2 cursor-pointer border border-dashed border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                <Upload size={15} />
                <span>{arquivos.length > 0 ? `${arquivos.length} arquivo(s) selecionado(s)` : 'Fotos ou vídeos'}</span>
                <input type="file" multiple accept="image/*,video/*" className="hidden"
                  onChange={e => setArquivos(Array.from(e.target.files ?? []))} />
              </label>
            </div>

            {erro && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />{erro}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {salvando && <Loader2 size={14} className="animate-spin" />}
              {salvando ? 'Enviando…' : 'Abrir Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
