'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, X, Rocket, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

const STORAGE_KEY = 'checkflow_primeiros_passos_dispensado'

function dispensadas(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

interface Passo {
  chave: string
  titulo: string
  feito: boolean
  acaoLabel?: string
  href?: string
}

/**
 * Card de implantação guiada, exibido no topo da Home da gestão enquanto a
 * empresa é "nova". Os passos são detectados do banco (conclusão real); o
 * "dispensar" é guardado em localStorage por empresa. Some quando tudo é
 * concluído ou o usuário dispensa.
 */
export function PrimeirosPassos() {
  const router = useRouter()
  const { empresaAtiva } = useSession()
  const [passos, setPassos] = useState<Passo[] | null>(null)
  const [dispensado, setDispensado] = useState(false)

  useEffect(() => {
    if (!empresaAtiva?.id) return
    setDispensado(dispensadas().includes(empresaAtiva.id))

    const sb = createClient()
    let cancelado = false
    ;(async () => {
      const { data: unidades } = await sb.from('unidades').select('id').eq('empresa_id', empresaAtiva.id)
      const unidadeIds = (unidades ?? []).map(u => u.id)

      const [checklists, execucoes, usuarios] = await Promise.all([
        unidadeIds.length ? sb.from('checklists').select('id').in('unidade_id', unidadeIds).limit(1) : Promise.resolve({ data: [] as any[] }),
        unidadeIds.length ? sb.from('checklist_execucoes').select('id').in('unidade_id', unidadeIds).limit(1) : Promise.resolve({ data: [] as any[] }),
        sb.from('usuario_empresa').select('usuario_id').eq('empresa_id', empresaAtiva.id),
      ])

      if (cancelado) return
      setPassos([
        { chave: 'unidade', titulo: 'Configurar uma unidade', feito: unidadeIds.length > 0, acaoLabel: 'Abrir', href: '/gestao/acessos/empresa' },
        { chave: 'checklist', titulo: 'Criar seu primeiro checklist (comece por um modelo)', feito: (checklists.data?.length ?? 0) > 0, acaoLabel: 'Ver modelos', href: '/gestao/checklists/modelos' },
        { chave: 'execucao', titulo: 'Executar um checklist na Operação', feito: (execucoes.data?.length ?? 0) > 0, acaoLabel: 'Ir para Operação', href: '/operacao' },
        { chave: 'usuarios', titulo: 'Convidar a equipe', feito: (usuarios.data?.length ?? 0) > 1, acaoLabel: 'Convidar', href: '/gestao/acessos/usuarios' },
      ])
    })()
    return () => { cancelado = true }
  }, [empresaAtiva?.id])

  function dispensar() {
    if (!empresaAtiva?.id) return
    const atual = dispensadas()
    if (!atual.includes(empresaAtiva.id)) localStorage.setItem(STORAGE_KEY, JSON.stringify([...atual, empresaAtiva.id]))
    setDispensado(true)
  }

  if (!passos || dispensado) return null
  const feitos = passos.filter(p => p.feito).length
  if (feitos === passos.length) return null // tudo concluído → some sozinho
  const pct = Math.round((feitos / passos.length) * 100)
  const proximo = passos.find(p => !p.feito)

  return (
    <div className="bg-gradient-to-br from-orange-50 to-white border border-orange-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
            <Rocket size={18} className="text-white" />
          </span>
          <div>
            <h2 className="font-semibold text-gray-800">Primeiros passos</h2>
            <p className="text-xs text-gray-500">Deixe o CheckFlow pronto para usar — leva poucos minutos.</p>
          </div>
        </div>
        <button onClick={dispensar} className="text-gray-400 hover:text-gray-600" aria-label="Dispensar"><X size={16} /></button>
      </div>

      <div className="mt-3 mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>{feitos} de {passos.length} concluídos</span><span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="space-y-1.5">
        {passos.map(p => {
          const ehProximo = proximo?.chave === p.chave
          return (
            <li key={p.chave}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${ehProximo ? 'bg-white border border-orange-200' : ''}`}>
              {p.feito
                ? <CheckCircle2 size={17} className="text-green-500 flex-shrink-0" />
                : <Circle size={17} className="text-gray-300 flex-shrink-0" />}
              <span className={`text-sm flex-1 ${p.feito ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{p.titulo}</span>
              {!p.feito && p.href && (
                <button onClick={() => router.push(p.href!)}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700 inline-flex items-center gap-0.5">
                  {p.acaoLabel}<ChevronRight size={13} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
