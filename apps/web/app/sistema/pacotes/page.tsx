'use client'

import { useEffect, useState } from 'react'
import { Plus, Boxes, Pencil, Trash2, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast, useConfirm } from '@/components/ui/feedback'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

type TipoPacote = 'execucoes' | 'tokens_ia' | 'armazenamento'

interface Pacote {
  id: string
  nome: string
  descricao: string | null
  tipo: TipoPacote
  quantidade: number
  valor: number
  ativo: boolean
  ordem: number
}

const GB = 1024 * 1024 * 1024

const TIPO_LABEL: Record<TipoPacote, string> = {
  execucoes: 'Execuções',
  tokens_ia: 'Tokens de IA',
  armazenamento: 'Armazenamento',
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Para armazenamento, quantidade é em bytes — exibe/edita em GB.
function quantidadeLabel(p: Pacote): string {
  if (p.tipo === 'armazenamento') return `${+(p.quantidade / GB).toFixed(2)} GB`
  return p.quantidade.toLocaleString('pt-BR')
}

export default function PacotesPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [pacotes, setPacotes] = useState<Pacote[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Pacote | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  async function carregar() {
    setLoading(true)
    const { data } = await createClient().from('pacotes_adicionais')
      .select('*').order('ordem', { ascending: true }).order('nome')
    setPacotes((data ?? []) as Pacote[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function excluir(p: Pacote) {
    const ok = await confirm({
      titulo: `Excluir o pacote "${p.nome}"?`,
      mensagem: 'Esta ação não pode ser desfeita. Compras já realizadas deste pacote não são afetadas.',
      confirmarLabel: 'Excluir', perigo: true,
    })
    if (!ok) return
    const { error } = await createClient().from('pacotes_adicionais').delete().eq('id', p.id)
    if (error) { toast.error('Erro ao excluir pacote. Tente novamente.'); return }
    toast.success('Pacote excluído.')
    carregar()
  }

  const cfg = getOnboardingConfig('sistema-pacotes')

  return (
    <>
      {cfg && <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Pacotes adicionais</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">
            Pacotes avulsos que a empresa pode comprar além do plano. Execuções e tokens entram como saldo de consumo do período (use ou perde); armazenamento é capacidade permanente.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditando(null); setModalAberto(true) }}><Plus size={14} /> Novo</Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : pacotes.length === 0 ? (
        <div className="py-16 text-center">
          <Boxes size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum pacote cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pacotes.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-800">{p.nome}</h3>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{TIPO_LABEL[p.tipo]}</span>
                    {!p.ativo && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Inativo</span>}
                  </div>
                  {p.descricao && <p className="text-xs text-gray-500 mt-1">{p.descricao}</p>}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                    <span>Quantidade: <b className="text-gray-700">{quantidadeLabel(p)}</b></span>
                    <span className="font-medium text-gray-700">{moeda(Number(p.valor))}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditando(p); setModalAberto(true) }} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
                  <button onClick={() => excluir(p)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <PacoteModal
          pacote={editando}
          onClose={() => setModalAberto(false)}
          onSaved={() => { setModalAberto(false); carregar() }}
        />
      )}
    </>
  )
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function PacoteModal({ pacote, onClose, onSaved }: { pacote: Pacote | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState(pacote?.nome ?? '')
  const [descricao, setDescricao] = useState(pacote?.descricao ?? '')
  const [tipo, setTipo] = useState<TipoPacote>(pacote?.tipo ?? 'execucoes')
  // quantidade exibida na unidade da UI (GB para armazenamento, unidade bruta nos demais)
  const [quantidade, setQuantidade] = useState(
    pacote ? (pacote.tipo === 'armazenamento' ? String(+(pacote.quantidade / GB).toFixed(2)) : String(pacote.quantidade)) : ''
  )
  const [valor, setValor] = useState(pacote?.valor != null ? String(pacote.valor) : '')
  const [ativo, setAtivo] = useState(pacote?.ativo ?? true)
  const [ordem, setOrdem] = useState(pacote?.ordem != null ? String(pacote.ordem) : '0')

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome do pacote.'); return }
    const qtdNum = Number(quantidade)
    if (!quantidade.trim() || isNaN(qtdNum) || qtdNum <= 0) { toast.error('Informe uma quantidade válida.'); return }

    setSalvando(true)
    const quantidadeBruta = tipo === 'armazenamento' ? Math.round(qtdNum * GB) : Math.round(qtdNum)
    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      tipo,
      quantidade: quantidadeBruta,
      valor: Number(valor || 0),
      ativo,
      ordem: Number(ordem || 0),
      atualizado_em: new Date().toISOString(),
    }

    const sb = createClient()
    const { error } = pacote
      ? await sb.from('pacotes_adicionais').update(payload).eq('id', pacote.id)
      : await sb.from('pacotes_adicionais').insert(payload)

    setSalvando(false)
    if (error) { toast.error('Erro ao salvar pacote. Tente novamente.'); return }
    toast.success(pacote ? 'Pacote atualizado.' : 'Pacote criado.')
    onSaved()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'
  const unidade = tipo === 'armazenamento' ? 'GB' : tipo === 'tokens_ia' ? 'tokens' : 'execuções'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{pacote ? 'Editar pacote' : 'Novo pacote'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} placeholder="ex: +10.000 tokens" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição (opcional)</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de recurso</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as TipoPacote)} className={inputCls}>
              <option value="execucoes">Execuções (saldo do período)</option>
              <option value="tokens_ia">Tokens de IA (saldo do período)</option>
              <option value="armazenamento">Armazenamento (permanente)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantidade ({unidade})</label>
              <input type="number" step={tipo === 'armazenamento' ? '0.1' : '1'} value={quantidade} onChange={e => setQuantidade(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor (R$)</label>
              <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className={inputCls} placeholder="0,00" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ordem de exibição</label>
            <input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-orange-500" />
            Pacote ativo (disponível para compra)
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
