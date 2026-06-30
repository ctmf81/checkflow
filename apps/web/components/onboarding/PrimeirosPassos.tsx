'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, X, Rocket, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { ehAdminDaEmpresa } from '@/lib/admin'

const STORAGE_KEY = 'checkflow_primeiros_passos_dispensado'

function dispensadas(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

interface Passo {
  chave: string
  titulo: string
  descricao?: string
  feito: boolean
  acaoLabel?: string
  href?: string
}

/**
 * Guia de implantação do ADMIN DA EMPRESA, no topo da Home da gestão. Mostra,
 * na ordem certa, o que ele precisa fazer para "deixar o CheckFlow pronto"
 * ANTES de operar: estrutura → equipe/funções → checklists → operação. Os
 * passos são detectados do banco (conclusão real); "dispensar" é por empresa
 * (localStorage). Some quando tudo é concluído ou o usuário dispensa.
 *
 * Só aparece para o **admin da empresa** (quem configura) — não para
 * operador/gestor de área, que não cuidam da implantação.
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
      // Guia de implantação é coisa de quem configura: só o admin da empresa.
      const isAdmin = await ehAdminDaEmpresa(sb, empresaAtiva.id)
      if (cancelado) return
      if (!isAdmin) { setPassos(null); return }

      const { data: unidades } = await sb.from('unidades').select('id').eq('empresa_id', empresaAtiva.id)
      const unidadeIds = (unidades ?? []).map(u => u.id)
      const vazio = Promise.resolve({ data: [] as any[] })

      const [grupos, checklists, execucoes, usuarios] = await Promise.all([
        unidadeIds.length ? sb.from('grupos').select('id').in('unidade_id', unidadeIds).limit(1) : vazio,
        unidadeIds.length ? sb.from('checklists').select('id').in('unidade_id', unidadeIds).limit(1) : vazio,
        unidadeIds.length ? sb.from('checklist_execucoes').select('id').in('unidade_id', unidadeIds).limit(1) : vazio,
        sb.from('usuario_empresa').select('usuario_id').eq('empresa_id', empresaAtiva.id),
      ])

      if (cancelado) return
      setPassos([
        { chave: 'estrutura', titulo: 'Criar a estrutura (grupos e subgrupos)',
          descricao: 'É onde ficam os checklists e as pessoas — organize por área, setor ou linha.',
          feito: (grupos.data?.length ?? 0) > 0, acaoLabel: 'Abrir Grupos', href: '/gestao/grupos' },
        { chave: 'equipe', titulo: 'Cadastrar a equipe e definir as funções',
          descricao: 'Adicione os usuários e dê a função no subgrupo: Operação, N1 ou N2.',
          feito: (usuarios.data?.length ?? 0) > 1, acaoLabel: 'Abrir Usuários', href: '/gestao/acessos/usuarios' },
        { chave: 'checklist', titulo: 'Criar seu primeiro checklist',
          descricao: 'Use um modelo, comece do zero ou gere com IA.',
          feito: (checklists.data?.length ?? 0) > 0, acaoLabel: 'Abrir Checklists', href: '/gestao/checklists' },
        { chave: 'operacao', titulo: 'Executar um checklist na Operação',
          descricao: 'Veja como o operador usa no dia a dia.',
          feito: (execucoes.data?.length ?? 0) > 0, acaoLabel: 'Ir para Operação', href: '/operacao' },
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

  const opcionais: { label: string; href: string }[] = [
    { label: 'perfis personalizados', href: '/gestao/acessos/perfis' },
    { label: 'turnos', href: '/gestao/acessos/turnos' },
    { label: 'catálogos', href: '/gestao/configuracoes/catalogos' },
    { label: 'documentos de apoio', href: '/gestao/configuracoes/documentos' },
  ]

  return (
    <div className="bg-gradient-to-br from-orange-50 to-white border border-orange-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
            <Rocket size={18} className="text-white" />
          </span>
          <div>
            <h2 className="font-semibold text-gray-800">Implantação — primeiros passos</h2>
            <p className="text-xs text-gray-500">Deixe o CheckFlow pronto antes de operar — siga a ordem abaixo.</p>
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
              className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${ehProximo ? 'bg-white border border-orange-200' : ''}`}>
              {p.feito
                ? <CheckCircle2 size={17} className="text-green-500 flex-shrink-0 mt-0.5" />
                : <Circle size={17} className="text-gray-300 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${p.feito ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>{p.titulo}</span>
                {p.descricao && !p.feito && <p className="text-xs text-gray-400 mt-0.5">{p.descricao}</p>}
              </div>
              {!p.feito && p.href && (
                <button onClick={() => router.push(p.href!)}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700 inline-flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                  {p.acaoLabel}<ChevronRight size={13} />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-orange-100">
        Opcional, se for usar:{' '}
        {opcionais.map((o, i) => (
          <span key={o.href}>
            <button onClick={() => router.push(o.href)} className="text-orange-500 hover:text-orange-600 hover:underline">{o.label}</button>
            {i < opcionais.length - 1 ? (i === opcionais.length - 2 ? ' e ' : ', ') : '.'}
          </span>
        ))}
      </p>
    </div>
  )
}
