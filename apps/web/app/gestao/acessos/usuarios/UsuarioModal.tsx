'use client'

import { useEffect, useState } from 'react'
import { X, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

interface Unidade { id: string; nome: string }

interface Usuario {
  id: string
  nome: string
  email: string
  cpf: string | null
  telefone: string | null
  perfil: string
  perfilId?: string
  unidades: Unidade[]
  turnoId?: string | null
}

interface Perfil { id: string; nome: string; publico: boolean; is_system: boolean }

const ADMIN_EMPRESA_ID = '00000000-0000-0000-0000-000000000002'
const ADMIN_SISTEMA_ID = '00000000-0000-0000-0000-000000000001'
interface Turno { id: string; nome: string; tipo: 'administrativo' | 'escala' }

interface Props {
  usuario?: Usuario
  empresaId?: string
  onClose: () => void
  perfilFixo?: string // se informado, só mostra este perfil (ex: 'Admin da empresa')
}

function formatCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatTelefone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{1})(\d{4})(\d{4})$/, '$1 $2-$3')
}

export function UsuarioModal({ usuario, empresaId, onClose, perfilFixo }: Props) {
  const isEdicao = !!usuario
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [cpf, setCpf] = useState(usuario?.cpf ?? '')
  const [telefone, setTelefone] = useState(usuario?.telefone ?? '')
  const [perfilId, setPerfilId] = useState(usuario?.perfilId ?? '')
  const [unidadesSel, setUnidadesSel] = useState<Unidade[]>(usuario?.unidades ?? [])
  const [turnoId, setTurnoId] = useState(usuario?.turnoId ?? '')
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const supabase = createClient()

    async function carregarPerfis() {
      // Verifica se quem está editando é Admin da empresa (ou Admin de sistema):
      // só esses podem atribuir perfis "não públicos". Quem não é admin só
      // pode escolher entre perfis marcados como público (ex: substituir
      // temporariamente um líder de férias).
      const { data: { user } } = await supabase.auth.getUser()
      let souAdmin = false
      if (user && empresaId) {
        const { data: vinculo } = await supabase
          .from('usuario_empresa')
          .select('perfil_id')
          .eq('usuario_id', user.id)
          .eq('empresa_id', empresaId)
          .maybeSingle()
        souAdmin = vinculo?.perfil_id === ADMIN_EMPRESA_ID || vinculo?.perfil_id === ADMIN_SISTEMA_ID
      }

      let q = supabase.from('perfis').select('id, nome, publico, is_system').order('nome')
      if (perfilFixo) q = q.eq('nome', perfilFixo) as typeof q
      const { data } = await q
      if (!data) return

      const lista = souAdmin
        ? data
        : data.filter(p => p.publico || p.id === usuario?.perfilId)

      setPerfis(lista)
      // Se não tem perfil selecionado, usa Operação como padrão
      if (!perfilId) {
        const operacao = lista.find(p => p.nome === 'Operação')
        if (operacao) setPerfilId(operacao.id)
      }
    }
    carregarPerfis()

    let uq = supabase.from('unidades').select('id, nome').order('nome')
    if (empresaId) uq = uq.eq('empresa_id', empresaId) as typeof uq
    uq.then(({ data }) => { if (data) setUnidades(data) })

    let tq = supabase.from('turnos').select('id, nome, tipo').eq('ativo', true).order('nome')
    if (empresaId) tq = tq.eq('empresa_id', empresaId) as typeof tq
    tq.then(({ data }) => { if (data) setTurnos(data as Turno[]) })
  }, [perfilFixo, empresaId, usuario?.perfilId])

  function toggleUnidade(u: Unidade) {
    setUnidadesSel(prev =>
      prev.find(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)

    const supabase = createClient()

    try {
      if (isEdicao) {
        // Atualiza dados do usuário existente
        await supabase.from('usuarios').update({
          nome, cpf: cpf || null, telefone: telefone || null, turno_id: turnoId || null
        }).eq('id', usuario.id)
      } else {
        // Cria usuário no Supabase Auth com senha temporária
        const senhaTemp = Math.random().toString(36).slice(-10) + 'A1!'
        const res = await fetch('/api/usuarios/criar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, nome, cpf, telefone, senhaTemp }),
        })
        if (!res.ok) {
          const err = await res.json()
          setErro(err.message ?? 'Erro ao criar usuário.')
          setSalvando(false)
          return
        }
      }

      onClose()
    } catch {
      setErro('Erro inesperado. Tente novamente.')
    }

    setSalvando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">
            {isEdicao ? 'Editar usuário' : 'Adicionar usuário'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {/* Foto */}
          <div className="flex justify-center mb-2">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                <ImagePlus size={24} className="text-gray-300" />
              </div>
              <span className="absolute bottom-0 right-0 bg-orange-500 rounded-full w-6 h-6 flex items-center justify-center text-white text-xs font-bold cursor-pointer">+</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com"
              disabled={isEdicao}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-60" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
            <input value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input value={telefone} onChange={e => setTelefone(formatTelefone(e.target.value))} placeholder="(00) 9 0000-0000"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
              <select value={perfilId} onChange={e => setPerfilId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Selecione</option>
                {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Turno</label>
            <select value={turnoId} onChange={e => setTurnoId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Sem turno (recebe mensagens a qualquer hora)</option>
              {turnos.map(t => (
                <option key={t.id} value={t.id}>{t.nome} ({t.tipo === 'escala' ? 'escala' : 'administrativo'})</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Fora do turno, o usuário não recebe mensagens de moderação por WhatsApp (mas continua podendo moderar normalmente pelo sistema).
            </p>
          </div>

          {/* Unidades */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Unidades com acesso</label>
            {unidadesSel.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {unidadesSel.map(u => (
                  <span key={u.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-md">
                    <button type="button" onClick={() => toggleUnidade(u)} className="text-gray-400 hover:text-red-500 font-bold">×</button>
                    {u.nome}
                  </span>
                ))}
              </div>
            )}
            {unidades.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-2 border border-gray-200 rounded-lg">Nenhuma unidade cadastrada</p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                {unidades.map(u => {
                  const sel = unidadesSel.some(x => x.id === u.id)
                  return (
                    <button key={u.id} type="button" onClick={() => toggleUnidade(u)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 transition-colors ${sel ? 'bg-orange-50 text-orange-600 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}>
                      {u.nome}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {!isEdicao && (
            <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
              Uma senha temporária será gerada e o usuário receberá instruções de acesso por e-mail.
            </p>
          )}

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancelar</button>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : isEdicao ? 'Salvar alterações' : 'Adicionar usuário'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
