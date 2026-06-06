'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import {
  ArrowLeft, ChevronDown, ChevronUp, CheckCircle2, Circle,
  Type, Hash, ToggleLeft, List, BookOpen, Camera, PenLine,
  CalendarDays, MapPin, AlertCircle, Send, Clock
} from 'lucide-react'

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Atividade {
  id: string
  nome: string
  tipo: string
  obrigatorio: boolean
  config: any
  ordem: number
  atividade_pai_id: string | null
  valor_gatilho: string | null
  dependentes?: Atividade[]
  resposta?: any
}

interface Secao {
  id: string
  nome: string
  ordem: number
  atividades: Atividade[]
}

interface Checklist {
  id: string
  nome: string
  descricao: string | null
  tempo_guarda_meses: number
}

// ─── Icones por tipo ─────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<string, { bg: string; Icon: any }> = {
  texto:           { bg: 'bg-orange-400',  Icon: Type },
  numero:          { bg: 'bg-green-500',   Icon: Hash },
  sim_nao:         { bg: 'bg-emerald-500', Icon: ToggleLeft },
  multipla_escolha:{ bg: 'bg-blue-500',    Icon: List },
  catalogo:        { bg: 'bg-slate-500',   Icon: BookOpen },
  foto:            { bg: 'bg-rose-400',    Icon: Camera },
  assinatura:      { bg: 'bg-purple-500',  Icon: PenLine },
  data_hora:       { bg: 'bg-sky-400',     Icon: CalendarDays },
  localizacao:     { bg: 'bg-amber-600',   Icon: MapPin },
}

function TipoIcon({ tipo }: { tipo: string }) {
  const cfg = TIPO_CONFIG[tipo] ?? { bg: 'bg-gray-400', Icon: Circle }
  return (
    <div className={`w-8 h-8 ${cfg.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
      <cfg.Icon size={15} className="text-white" />
    </div>
  )
}

// ─── Campo de resposta por tipo ──────────────────────────────────────────────

function CampoResposta({ atividade, onChange }: { atividade: Atividade; onChange: (val: any) => void }) {
  const val = atividade.resposta
  const cfg = atividade.config ?? {}

  switch (atividade.tipo) {
    case 'texto':
      return (
        <textarea value={val ?? ''} onChange={e => onChange(e.target.value)}
          rows={2} placeholder="Digite aqui..."
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
      )

    case 'numero':
      return (
        <input type="number" value={val ?? ''} onChange={e => onChange(e.target.value)}
          placeholder={cfg.unidade ? `Ex: 10 ${cfg.unidade}` : 'Digite o número'}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
      )

    case 'sim_nao':
      return (
        <div className="flex gap-2">
          {['sim', 'nao'].map(op => (
            <button key={op} onClick={() => onChange(op)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                val === op
                  ? op === 'sim'
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-red-500 border-red-500 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              {op === 'sim' ? 'Sim' : 'Não'}
            </button>
          ))}
        </div>
      )

    case 'multipla_escolha': {
      const opcoes: string[] = cfg.opcoes ?? []
      const multiplo = cfg.multiplo ?? false
      return (
        <div className="space-y-2">
          {opcoes.map((op: string) => {
            const selecionado = multiplo
              ? Array.isArray(val) && val.includes(op)
              : val === op
            return (
              <button key={op} onClick={() => {
                if (multiplo) {
                  const arr: string[] = Array.isArray(val) ? [...val] : []
                  onChange(selecionado ? arr.filter(x => x !== op) : [...arr, op])
                } else {
                  onChange(selecionado ? null : op)
                }
              }}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm border-2 transition-all flex items-center gap-2 ${
                  selecionado
                    ? 'bg-orange-50 border-orange-400 text-orange-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selecionado ? 'border-orange-400 bg-orange-400' : 'border-gray-300'
                }`}>
                  {selecionado && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
                {op}
              </button>
            )
          })}
        </div>
      )
    }

    case 'data_hora':
      return (
        <input type="datetime-local" value={val ?? ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
      )

    case 'localizacao':
      return (
        <div className="px-4 py-3 bg-gray-50 rounded-xl text-sm text-gray-500 border border-gray-200">
          {val?.endereco
            ? <span className="text-gray-800 font-medium">{val.endereco}</span>
            : 'Localização será registrada automaticamente na execução'}
        </div>
      )

    case 'foto':
      return (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
          <Camera size={24} className="text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Foto (disponível no app móvel)</p>
        </div>
      )

    case 'assinatura':
      return (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
          <PenLine size={24} className="text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Assinatura (disponível no app móvel)</p>
        </div>
      )

    default:
      return (
        <input value={val ?? ''} onChange={e => onChange(e.target.value)}
          placeholder="Resposta"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
      )
  }
}

// ─── Componente de atividade ─────────────────────────────────────────────────

function AtividadeItem({
  atividade,
  onResposta,
  nivel = 0,
}: {
  atividade: Atividade
  onResposta: (id: string, val: any) => void
  nivel?: number
}) {
  const respondida = atividade.resposta !== undefined && atividade.resposta !== null && atividade.resposta !== ''

  // Dependentes visíveis de acordo com o gatilho
  const dependentesVisiveis = (atividade.dependentes ?? []).filter(dep => {
    if (!dep.valor_gatilho) return true
    const resp = atividade.resposta
    if (Array.isArray(resp)) return resp.includes(dep.valor_gatilho)
    return String(resp ?? '') === dep.valor_gatilho
  })

  return (
    <div className={nivel > 0 ? 'ml-4 border-l-2 border-orange-100 pl-3' : ''}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 mb-3">
          <TipoIcon tipo={atividade.tipo} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 leading-snug">
              {atividade.nome}
              {atividade.obrigatorio && <span className="text-red-400 ml-1">*</span>}
            </p>
          </div>
          {respondida && (
            <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
          )}
        </div>

        {/* Campo */}
        <CampoResposta
          atividade={atividade}
          onChange={val => onResposta(atividade.id, val)}
        />
      </div>

      {/* Dependentes */}
      {dependentesVisiveis.map(dep => (
        <AtividadeItem key={dep.id} atividade={dep} onResposta={onResposta} nivel={nivel + 1} />
      ))}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function ExecucaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { unidadeAtiva, user } = useSession() as any
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [respostas, setRespostas] = useState<Record<string, any>>({})
  const [secaoAberta, setSecaoAberta] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => { carregar() }, [id])

  async function carregar() {
    const sb = createClient()

    const { data: cl } = await sb.from('checklists')
      .select('id, nome, descricao, tempo_guarda_meses')
      .eq('id', id).single()
    if (!cl) { setLoading(false); return }
    setChecklist(cl)

    const { data: secoesData } = await sb.from('checklist_secoes')
      .select('id, nome, ordem')
      .eq('checklist_id', id).order('ordem')

    const { data: atvsData } = await sb.from('checklist_atividades')
      .select('id, nome, tipo, obrigatorio, config, ordem, atividade_pai_id, valor_gatilho, secao_id')
      .eq('checklist_id', id).order('ordem')

    if (!atvsData) { setLoading(false); return }

    // Monta árvore de dependentes
    const atvMap = new Map<string, Atividade>()
    atvsData.forEach((a: any) => atvMap.set(a.id, { ...a, dependentes: [] }))
    const raizes: Atividade[] = []
    atvsData.forEach((a: any) => {
      if (a.atividade_pai_id && atvMap.has(a.atividade_pai_id)) {
        atvMap.get(a.atividade_pai_id)!.dependentes!.push(atvMap.get(a.id)!)
      } else {
        raizes.push(atvMap.get(a.id)!)
      }
    })

    // Monta seções
    const secoesComAtv: Secao[] = (secoesData ?? []).map((s: any) => ({
      ...s,
      atividades: raizes.filter(a => a.secao_id === s.id),
    }))

    // Atividades sem seção
    const semSecao = raizes.filter(a => !a.secao_id)
    if (semSecao.length > 0) {
      secoesComAtv.push({ id: '__sem_secao__', nome: 'Atividades', ordem: 9999, atividades: semSecao })
    }

    setSecoes(secoesComAtv)
    if (secoesComAtv.length > 0) setSecaoAberta(secoesComAtv[0].id)
    setLoading(false)
  }

  function setResposta(atividadeId: string, valor: any) {
    setRespostas(prev => ({ ...prev, [atividadeId]: valor }))
  }

  // Injeta respostas nas atividades para renderizar
  function injetarRespostas(atividades: Atividade[]): Atividade[] {
    return atividades.map(a => ({
      ...a,
      resposta: respostas[a.id],
      dependentes: injetarRespostas(a.dependentes ?? []),
    }))
  }

  // Calcula progresso
  function calcularProgresso() {
    let total = 0, respondidas = 0
    function contar(atividades: Atividade[]) {
      atividades.forEach(a => {
        if (!a.atividade_pai_id || respostas[a.atividade_pai_id]) {
          total++
          const r = respostas[a.id]
          if (r !== undefined && r !== null && r !== '' && !(Array.isArray(r) && r.length === 0)) respondidas++
          contar(a.dependentes ?? [])
        }
      })
    }
    secoes.forEach(s => contar(s.atividades))
    return { total, respondidas }
  }

  async function finalizar() {
    if (!unidadeAtiva || !checklist) return
    setSalvando(true)
    const sb = createClient()
    const agora = new Date()
    const expiracao = new Date(agora)
    expiracao.setMonth(expiracao.getMonth() + (checklist.tempo_guarda_meses ?? 12))

    const { data: execucao } = await sb.from('checklist_execucoes').insert({
      checklist_id: checklist.id,
      unidade_id: unidadeAtiva.id,
      executado_por: user?.id,
      data_execucao: agora.toISOString(),
      data_expiracao: expiracao.toISOString().split('T')[0],
      status: 'concluido',
    }).select('id').single()

    // Salva respostas (quando tivermos a tabela de respostas)
    // Por ora só registra a execução

    setSalvando(false)
    setConcluido(true)
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ─── Concluído ──────────────────────────────────────────────────────────────
  if (concluido) return (
    <div className="flex items-center justify-center min-h-[80vh] px-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={40} className="text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Checklist concluído!</h2>
        <p className="text-sm text-gray-500 mb-6">Execução registrada com sucesso.</p>
        <button onClick={() => router.push('/operacao')}
          className="bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors">
          Voltar aos checklists
        </button>
      </div>
    </div>
  )

  if (!checklist) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <AlertCircle size={40} className="text-red-300 mx-auto" />
    </div>
  )

  const { total, respondidas } = calcularProgresso()
  const progresso = total > 0 ? Math.round((respondidas / total) * 100) : 0

  // ─── Execução ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto pb-32">
      {/* Header fixo */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/operacao')}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-800 text-sm leading-tight truncate">{checklist.nome}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all duration-300"
                  style={{ width: `${progresso}%` }} />
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{respondidas}/{total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Descrição */}
      {checklist.descricao && (
        <div className="px-4 sm:px-6 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs text-blue-700">{checklist.descricao}</p>
        </div>
      )}

      {/* Seções */}
      <div className="px-4 sm:px-6 pt-4 space-y-3">
        {secoes.map((secao, idx) => {
          const aberta = secaoAberta === secao.id
          const atvsComResp = injetarRespostas(secao.atividades)
          const respondHere = secao.atividades.filter(a => respostas[a.id] != null && respostas[a.id] !== '').length
          const totalHere = secao.atividades.length

          return (
            <div key={secao.id} className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
              {/* Cabeçalho da seção */}
              <button onClick={() => setSecaoAberta(aberta ? null : secao.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                    respondHere === totalHere && totalHere > 0
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {respondHere === totalHere && totalHere > 0
                      ? <CheckCircle2 size={14} />
                      : idx + 1}
                  </div>
                  <span className="font-semibold text-sm text-gray-800">{secao.nome}</span>
                  <span className="text-xs text-gray-400">({respondHere}/{totalHere})</span>
                </div>
                {aberta ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {/* Atividades */}
              {aberta && (
                <div className="px-4 pb-4 space-y-0">
                  {atvsComResp.map(atv => (
                    <AtividadeItem key={atv.id} atividade={atv} onResposta={setResposta} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Botão fixo de finalizar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-30">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={finalizar}
            disabled={salvando}
            className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-orange-600 disabled:opacity-60 transition-colors shadow-lg shadow-orange-200 active:scale-[0.99]"
          >
            {salvando
              ? <><Clock size={16} className="animate-pulse" /> Salvando...</>
              : <><Send size={16} /> Finalizar checklist</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
