'use client'

import { useEffect, useState } from 'react'
import { X, Check, Loader2, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useToast, useConfirm } from '@/components/ui/feedback'

interface PreCadastro {
  id: string; nome: string; cpf: string; telefone: string | null
  email: string | null; observacao: string | null; criado_em: string
}
interface Perfil { id: string; nome: string }
interface Unidade { id: string; nome: string }

// "Admin de sistema" (seed) nunca pode ser atribuído pela moderação — seria
// escalada de privilégio. É um papel de plataforma, não de enquadramento na empresa.
const ADMIN_SISTEMA_ID = '00000000-0000-0000-0000-000000000001'

export function ModeracaoPreCadastroModal({ empresaId, onClose, onChange }: {
  empresaId: string
  onClose: () => void
  onChange: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [pendentes, setPendentes] = useState<PreCadastro[]>([])
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [loading, setLoading] = useState(true)

  // Aprovação inline
  const [aprovarAlvo, setAprovarAlvo] = useState<string | null>(null)
  const [perfilSel, setPerfilSel] = useState('')
  const [unidadesSel, setUnidadesSel] = useState<string[]>([])
  const [processando, setProcessando] = useState(false)

  async function carregar() {
    setLoading(true)
    const sb = createClient()
    const [pc, pf, un] = await Promise.all([
      sb.from('pre_cadastros').select('id, nome, cpf, telefone, email, observacao, criado_em')
        .eq('empresa_id', empresaId).eq('status', 'pendente').order('criado_em', { ascending: false }),
      sb.from('perfis').select('id, nome').or(`empresa_id.eq.${empresaId},empresa_id.is.null`).neq('id', ADMIN_SISTEMA_ID).order('nome'),
      sb.from('unidades').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    ])
    setPendentes(pc.data ?? [])
    setPerfis(pf.data ?? [])
    setUnidades(un.data ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [empresaId])

  function abrirAprovacao(id: string) {
    setAprovarAlvo(id)
    setPerfilSel('')
    setUnidadesSel([])
  }

  async function aprovar(pc: PreCadastro) {
    if (!perfilSel) { toast.error('Escolha um perfil para aprovar.'); return }
    setProcessando(true)
    try {
      const sb = createClient()
      const { data: { session, user } } = await (async () => {
        const s = await sb.auth.getSession()
        const u = await sb.auth.getUser()
        return { data: { session: s.data.session, user: u.data.user } }
      })()
      const senhaTemp = Math.random().toString(36).slice(-10) + 'A1!'

      const res = await fetch('/api/usuarios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          email: pc.email ?? '', nome: pc.nome, cpf: pc.cpf, telefone: pc.telefone ?? '', senhaTemp,
          empresaId, perfilId: perfilSel, unidades: unidadesSel,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.message ?? 'Erro ao aprovar.'); setProcessando(false); return }

      await sb.from('pre_cadastros').update({
        status: 'aprovado', usuario_id: json.id ?? null,
        moderado_por: user?.id ?? null, moderado_em: new Date().toISOString(),
      }).eq('id', pc.id)

      if (!json.vinculado) {
        if (json.codigoEnviado) toast.success('Usuário aprovado — código de acesso enviado por WhatsApp.')
        else toast.error(`Usuário criado, mas o código NÃO saiu pelo WhatsApp. ${json.envioErro ?? ''} Reenvie em Usuários (botão Resetar senha) ou verifique a conexão do WhatsApp em Sistema.`)
      } else if (json.codigoReenviado) {
        toast.success('Pessoa vinculada — código de acesso reenviado por WhatsApp.')
      } else if (json.envioErro) {
        toast.error(`Pessoa vinculada, mas o reenvio do código falhou. ${json.envioErro}`)
      } else {
        toast.success('Pessoa vinculada à empresa (ela já tinha acesso, sem novo código).')
      }
      setAprovarAlvo(null)
      onChange()
      carregar()
    } catch {
      toast.error('Erro inesperado.')
    } finally {
      setProcessando(false)
    }
  }

  async function rejeitar(pc: PreCadastro) {
    if (!await confirm({ titulo: 'Rejeitar pré-cadastro?', mensagem: `${pc.nome} não será cadastrado.`, confirmarLabel: 'Rejeitar', perigo: true })) return
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    await sb.from('pre_cadastros').update({
      status: 'rejeitado', moderado_por: user?.id ?? null, moderado_em: new Date().toISOString(),
    }).eq('id', pc.id)
    onChange()
    carregar()
  }

  function toggleUnidade(id: string) {
    setUnidadesSel(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id])
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-800">Pré-cadastros pendentes</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="py-10 text-center"><Loader2 size={20} className="animate-spin text-gray-300 mx-auto" /></div>
          ) : pendentes.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">Nenhum pré-cadastro pendente.</p>
          ) : pendentes.map(pc => (
            <div key={pc.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{pc.nome}</p>
                  <p className="text-xs text-gray-500">CPF {pc.cpf} · {pc.telefone ?? 'sem telefone'}</p>
                  {pc.email && <p className="text-xs text-gray-400 truncate">{pc.email}</p>}
                  {pc.observacao && <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{pc.observacao}&rdquo;</p>}
                </div>
                {aprovarAlvo !== pc.id && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => abrirAprovacao(pc.id)}
                      className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-1.5 rounded-lg transition-colors">
                      <UserPlus size={13} /> Aprovar
                    </button>
                    <button onClick={() => rejeitar(pc)}
                      className="text-xs font-medium text-gray-500 hover:text-red-500 border border-gray-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors">
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>

              {aprovarAlvo === pc.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Perfil <span className="text-red-400">*</span></label>
                    <select value={perfilSel} onChange={e => setPerfilSel(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                      <option value="">Escolha o perfil</option>
                      {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                  {unidades.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Unidades <span className="text-gray-400 font-normal">(opcional)</span></label>
                      <div className="flex flex-wrap gap-1.5">
                        {unidades.map(u => (
                          <button key={u.id} type="button" onClick={() => toggleUnidade(u.id)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              unidadesSel.includes(u.id) ? 'bg-orange-50 border-orange-300 text-orange-600' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}>
                            {u.nome}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => aprovar(pc)} disabled={processando}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                      {processando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Confirmar e enviar acesso
                    </button>
                    <button onClick={() => setAprovarAlvo(null)} disabled={processando}
                      className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
