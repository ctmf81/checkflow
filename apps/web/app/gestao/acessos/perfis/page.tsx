'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, UserCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PerfilModal } from './PerfilModal'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm, useToast } from '@/components/ui/feedback'

interface Perfil {
  id: string
  nome: string
  totalUsuarios: number
  is_system: boolean
}

function AvatarStack({ total }: { total: number }) {
  const visible = Math.min(total, 3)
  const resto = total - visible
  return (
    <div className="flex items-center">
      {Array.from({ length: visible }).map((_, i) => (
        <div key={i} className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white -ml-2 first:ml-0 flex items-center justify-center">
          <UserCircle size={20} className="text-gray-400" />
        </div>
      ))}
      {resto > 0 && (
        <div className="w-8 h-8 rounded-full bg-blue-50 border-2 border-white -ml-2 flex items-center justify-center">
          <span className="text-xs font-semibold text-blue-500">+{resto}</span>
        </div>
      )}
    </div>
  )
}

export default function PerfisPage() {
  const { empresaAtiva } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [perfilEditando, setPerfilEditando] = useState<Perfil | undefined>()

  async function carregar() {
    if (!empresaAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()

    // Perfis da empresa + perfis de sistema (empresa_id null)
    const { data, error } = await supabase
      .from('perfis')
      .select('id, nome, is_system')
      .or(`empresa_id.eq.${empresaAtiva.id},empresa_id.is.null`)
      .order('nome')

    if (error || !data) {
      toast.error('Não foi possível carregar os perfis.')
      setLoading(false)
      return
    }

    // Contagem de usuários por perfil numa única query (evita N+1)
    const { data: vinculos } = await supabase
      .from('usuario_empresa')
      .select('perfil_id')
      .eq('empresa_id', empresaAtiva.id)
    const contagem = new Map<string, number>()
    vinculos?.forEach(v => contagem.set(v.perfil_id, (contagem.get(v.perfil_id) ?? 0) + 1))

    setPerfis(data.map(p => ({ ...p, totalUsuarios: contagem.get(p.id) ?? 0 })))
    setLoading(false)
  }

  useEffect(() => { carregar() }, [empresaAtiva?.id])

  async function excluir(perfil: Perfil) {
    if (perfil.totalUsuarios > 0) {
      toast.error(`"${perfil.nome}" está atribuído a ${perfil.totalUsuarios} usuário(s). Reatribua-os antes de excluir.`)
      return
    }
    if (!await confirm({ titulo: `Excluir o perfil "${perfil.nome}"?`, mensagem: 'Esta ação não pode ser desfeita.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('perfis').delete().eq('id', perfil.id)
    if (error) { toast.error('Não foi possível excluir o perfil.'); return }
    toast.success('Perfil excluído.')
    carregar()
  }

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma empresa selecionada</p>
      <p className="text-xs text-gray-400 mt-1">Acesse uma empresa pelo Painel de sistema.</p>
    </div>
  )

  const cfg = getOnboardingConfig('perfis')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Perfis de acesso</span>
            <p className="text-xs text-gray-400 mt-0.5">Empresa: <span className="text-orange-500 font-medium">{empresaAtiva.nome}</span></p>
          </div>
          <Button onClick={() => { setPerfilEditando(undefined); setModalAberto(true) }}>
            <Plus size={16} />Criar novo perfil
          </Button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
        ) : perfis.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">Nenhum perfil cadastrado.</div>
        ) : perfis.map(perfil => (
          <div key={perfil.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
            <div>
              <button onClick={() => { setPerfilEditando(perfil); setModalAberto(true) }}
                className="text-sm font-medium text-gray-800 hover:text-orange-500 transition-colors text-left">
                {perfil.nome}
              </button>
              {perfil.is_system && (
                <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">sistema</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <AvatarStack total={perfil.totalUsuarios} />
              {!perfil.is_system && (
                <button onClick={() => excluir(perfil)}
                  className="text-gray-300 hover:text-red-400 transition-colors p-1 ml-1">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <PerfilModal
          perfil={perfilEditando}
          empresaId={empresaAtiva.id}
          onClose={() => { setModalAberto(false); carregar() }}
        />
      )}
    </>
  )
}
