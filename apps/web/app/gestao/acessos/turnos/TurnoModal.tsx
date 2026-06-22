'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast } from '@/components/ui/feedback'

interface DiaConfig { dia: number; inicio: string; fim: string }

type ModoForaTurno = 'notificacao' | 'login' | 'aviso'

interface Turno {
  id: string
  nome: string
  tipo: 'administrativo' | 'escala'
  config: any
  ativo: boolean
  modo_fora_turno?: ModoForaTurno
}

interface Props {
  turno?: Turno
  onClose: () => void
  onSalvo?: () => void
}

const MODOS: { v: ModoForaTurno; label: string; desc: string }[] = [
  { v: 'notificacao', label: 'Só bloquear notificação', desc: 'Fora do turno não recebe WhatsApp de moderação; acessa o sistema normal.' },
  { v: 'login', label: 'Bloquear login', desc: 'Fora do turno não consegue entrar. Quem já está logado continua. (Admins isentos.)' },
  { v: 'aviso', label: 'Só avisar', desc: 'Fora do turno mostra um aviso, mas não bloqueia nada.' },
]

const DIAS = [
  { v: 1, label: 'Segunda' },
  { v: 2, label: 'Terça' },
  { v: 3, label: 'Quarta' },
  { v: 4, label: 'Quinta' },
  { v: 5, label: 'Sexta' },
  { v: 6, label: 'Sábado' },
  { v: 0, label: 'Domingo' },
]

function diasDoConfig(config: any): DiaConfig[] {
  if (Array.isArray(config?.dias)) return config.dias
  return []
}

export function TurnoModal({ turno, onClose, onSalvo }: Props) {
  const { empresaAtiva } = useSession()
  const toast = useToast()
  const isEdicao = !!turno

  const [nome, setNome] = useState(turno?.nome ?? '')
  const [tipo, setTipo] = useState<'administrativo' | 'escala'>(turno?.tipo ?? 'administrativo')
  const [modoFora, setModoFora] = useState<ModoForaTurno>(turno?.modo_fora_turno ?? 'notificacao')

  // Administrativo: mapa dia -> { ativo, inicio, fim }
  const diasIniciais = diasDoConfig(turno?.config)
  const [diasAtivos, setDiasAtivos] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {}
    DIAS.forEach(d => { m[d.v] = diasIniciais.some(x => x.dia === d.v) })
    if (diasIniciais.length === 0) { [1,2,3,4,5].forEach(d => m[d] = true) } // padrão seg-sex
    return m
  })
  const [horarios, setHorarios] = useState<Record<number, { inicio: string; fim: string }>>(() => {
    const m: Record<number, { inicio: string; fim: string }> = {}
    DIAS.forEach(d => {
      const cfg = diasIniciais.find(x => x.dia === d.v)
      m[d.v] = { inicio: cfg?.inicio ?? '08:00', fim: cfg?.fim ?? '17:00' }
    })
    return m
  })

  // Escala
  const [dataReferencia, setDataReferencia] = useState(turno?.config?.data_referencia ?? '')
  const [horaInicioEscala, setHoraInicioEscala] = useState(turno?.config?.hora_inicio ?? '07:00')
  const [horasTrabalho, setHorasTrabalho] = useState(turno?.config?.horas_trabalho ?? 12)
  const [horasFolga, setHorasFolga] = useState(turno?.config?.horas_folga ?? 36)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function toggleDia(v: number) {
    setDiasAtivos(prev => ({ ...prev, [v]: !prev[v] }))
  }

  function setHorario(v: number, campo: 'inicio' | 'fim', valor: string) {
    setHorarios(prev => ({ ...prev, [v]: { ...prev[v], [campo]: valor } }))
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome do turno.'); return }

    let config: any = {}
    if (tipo === 'administrativo') {
      const dias: DiaConfig[] = DIAS
        .filter(d => diasAtivos[d.v])
        .map(d => ({ dia: d.v, inicio: horarios[d.v].inicio, fim: horarios[d.v].fim }))
      if (dias.length === 0) { setErro('Selecione ao menos um dia da semana.'); return }
      config = { dias }
    } else {
      if (!dataReferencia) { setErro('Informe a data de referência da escala.'); return }
      if (!horasTrabalho || !horasFolga) { setErro('Informe as horas de trabalho e de folga.'); return }
      config = {
        data_referencia: dataReferencia,
        hora_inicio: horaInicioEscala,
        horas_trabalho: Number(horasTrabalho),
        horas_folga: Number(horasFolga),
      }
    }

    setErro('')
    setSalvando(true)
    const supabase = createClient()

    const payload = {
      nome: nome.trim(),
      tipo,
      config,
      modo_fora_turno: modoFora,
      atualizado_em: new Date().toISOString(),
    }

    if (isEdicao) {
      const { error } = await supabase.from('turnos').update(payload).eq('id', turno.id)
      if (error) { setErro('Erro ao salvar.'); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('turnos').insert({
        ...payload, empresa_id: empresaAtiva?.id ?? null, ativo: true,
      })
      if (error) { setErro('Erro ao criar.'); setSalvando(false); return }
    }

    setSalvando(false)
    toast.success(isEdicao ? 'Turno salvo.' : 'Turno criado.')
    onSalvo?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">{isEdicao ? 'Editar Turno' : 'Novo Turno'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Comercial, Escala 12x36"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de turno</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTipo('administrativo')}
                className={`px-3 py-2.5 text-left rounded-lg border text-sm transition-colors ${
                  tipo === 'administrativo' ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                <span className="font-medium block">Administrativo</span>
                <span className="text-xs text-gray-400">Horário fixo por dia da semana</span>
              </button>
              <button type="button" onClick={() => setTipo('escala')}
                className={`px-3 py-2.5 text-left rounded-lg border text-sm transition-colors ${
                  tipo === 'escala' ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                <span className="font-medium block">Escala</span>
                <span className="text-xs text-gray-400">Ciclo trabalho/folga (ex: 12x36)</span>
              </button>
            </div>
          </div>

          {tipo === 'administrativo' ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Dias e horários</label>
              {DIAS.map(d => (
                <div key={d.v} className="flex items-center gap-3">
                  <button type="button" onClick={() => toggleDia(d.v)}
                    className={`w-28 flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border text-left transition-colors ${
                      diasAtivos[d.v] ? 'bg-orange-50 border-orange-300 text-orange-600' : 'bg-gray-50 border-gray-200 text-gray-400'
                    }`}>
                    {d.label}
                  </button>
                  <input type="time" value={horarios[d.v].inicio} disabled={!diasAtivos[d.v]}
                    onChange={e => setHorario(d.v, 'inicio', e.target.value)}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                  <span className="text-gray-300 text-xs">até</span>
                  <input type="time" value={horarios[d.v].fim} disabled={!diasAtivos[d.v]}
                    onChange={e => setHorario(d.v, 'fim', e.target.value)}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              ))}
              <p className="text-xs text-gray-400">Ex: segunda a sexta das 08h às 17h e sábado das 08h às 11h — configure cada dia individualmente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data de referência</label>
                  <input type="date" value={dataReferencia} onChange={e => setDataReferencia(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Início do 1º turno</label>
                  <input type="time" value={horaInicioEscala} onChange={e => setHoraInicioEscala(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horas de trabalho</label>
                  <input type="number" min={1} value={horasTrabalho} onChange={e => setHorasTrabalho(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horas de folga</label>
                  <input type="number" min={1} value={horasFolga} onChange={e => setHorasFolga(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Ex: 12x36 = 12h de trabalho + 36h de folga, repetindo continuamente a partir da data/hora de referência informada.
              </p>
            </div>
          )}

          <div className="space-y-2 pt-1">
            <label className="block text-sm font-medium text-gray-700">Fora do turno</label>
            {MODOS.map(m => (
              <button type="button" key={m.v} onClick={() => setModoFora(m.v)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  modoFora === m.v ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <span className="flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 ${
                    modoFora === m.v ? 'border-orange-500 bg-orange-500 ring-2 ring-orange-200' : 'border-gray-300'
                  }`} />
                  <span className={`font-medium ${modoFora === m.v ? 'text-orange-700' : 'text-gray-700'}`}>{m.label}</span>
                </span>
                <span className="block text-xs text-gray-400 mt-0.5 ml-[22px]">{m.desc}</span>
              </button>
            ))}
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : isEdicao ? 'Salvar alterações' : 'Criar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
