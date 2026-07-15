'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, AlertCircle, Clock, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { usePolling } from '@/lib/usePolling'
import { TurnoModal } from './TurnoModal'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm, useToast } from '@/components/ui/feedback'

interface TurnoPeriodo { id: string; nome: string; ordem: number }

interface Turno {
  id: string
  nome: string
  tipo: 'administrativo' | 'escala'
  config: any
  ativo: boolean
  modo_fora_turno?: 'notificacao' | 'login' | 'aviso'
  periodos?: TurnoPeriodo[]
}

const DIA_LABEL: Record<number, string> = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' }
const ORDEM = [1, 2, 3, 4, 5, 6, 0]

function resumo(turno: Turno): React.ReactNode {
  if (turno.tipo === 'escala') {
    const c = turno.config ?? {}
    return (
      <div className="mt-0.5 space-y-1">
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Repeat size={12} className="text-gray-300" />
          Ciclo {c.horas_trabalho}h/{c.horas_folga}h · início {c.hora_inicio?.slice(0,5)} a partir de {c.data_referencia ? new Date(c.data_referencia + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
        </p>
        {(turno.periodos ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(turno.periodos ?? []).map(p => (
              <span key={p.id} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{p.nome}</span>
            ))}
          </div>
        )}
      </div>
    )
  }
  const dias: { dia: number; inicio: string; fim: string }[] = turno.config?.dias ?? []
  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {ORDEM.map(d => {
        const cfg = dias.find(x => x.dia === d)
        return (
          <span key={d} title={cfg ? `${cfg.inicio.slice(0,5)}–${cfg.fim.slice(0,5)}` : 'sem expediente'}
            className={`text-xs px-2 py-0.5 rounded-full ${cfg ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-300'}`}>
            {DIA_LABEL[d]}{cfg ? ` ${cfg.inicio.slice(0,5)}-${cfg.fim.slice(0,5)}` : ''}
          </span>
        )
      })}
    </div>
  )
}

export default function TurnosPage() {
  const { empresaAtiva } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Turno | undefined>()

  async function carregar() {
    if (!empresaAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const { data } = await createClient()
      .from('turnos')
      .select('id, nome, tipo, config, ativo, modo_fora_turno, periodos:turno_periodos(id, nome, ordem)')
      .eq('empresa_id', empresaAtiva.id)
      .eq('ativo', true)
      .order('nome')
    if (data) setTurnos(data as Turno[])
    setLoading(false)
  }

  async function excluir(id: string, nome: string) {
    if (!await confirm({ titulo: `Excluir o turno "${nome}"?`, mensagem: 'Usuários associados ficarão sem turno.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('turnos').update({ ativo: false }).eq('id', id)
    if (error) { toast.error('Não foi possível excluir o turno.'); return }
    toast.success('Turno excluído.')
    carregar()
  }

  useEffect(() => { carregar() }, [empresaAtiva?.id])
  usePolling(carregar, 45000, !!empresaAtiva?.id)

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma empresa selecionada</p>
    </div>
  )

  const cfg = getOnboardingConfig('acessos-turnos')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Turnos</h1>
          <p className="hidden sm:block text-sm text-gray-500 mt-0.5">
            Janelas de trabalho (administrativas ou em escala) usadas para restringir o envio de mensagens de moderação (WhatsApp) fora do expediente do usuário.
          </p>
        </div>
        <Button onClick={() => { setEditando(undefined); setModal(true) }}>
          <Plus size={16} />Novo
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : turnos.length === 0 ? (
        <div className="py-16 text-center">
          <Clock size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum turno cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">Sem turno, os usuários recebem mensagens de moderação a qualquer hora.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {turnos.map(turno => (
            <div key={turno.id}
              className="flex items-start gap-4 px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              {turno.tipo === 'escala'
                ? <Repeat size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />
                : <Clock size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800">{turno.nome}</p>
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                    turno.tipo === 'escala' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {turno.tipo === 'escala' ? 'Escala' : 'Administrativo'}
                  </span>
                </div>
                {resumo(turno)}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => { setEditando(turno); setModal(true) }}
                  className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => excluir(turno.id, turno.nome)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <TurnoModal
          turno={editando}
          onClose={() => { setModal(false); setEditando(undefined) }}
          onSalvo={() => { setModal(false); setEditando(undefined); carregar() }}
        />
      )}
    </>
  )
}
