'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, LayoutDashboard, AlertCircle, Loader2, Pencil, Trash2, Link2, Tv, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { usePolling } from '@/lib/usePolling'
import { useToast, useConfirm } from '@/components/ui/feedback'

interface Dashboard {
  id: string
  nome: string
  token: string
  total_paineis: number
}

export default function DashboardsPage() {
  const { unidadeAtiva } = useSession()
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('dashboards')
      .select('id, nome, token')
      .eq('unidade_id', unidadeAtiva.id).order('criado_em', { ascending: false })
    if (data) {
      const comContagem = await Promise.all(data.map(async (d: any) => {
        const { count } = await sb.from('dashboard_paineis').select('id', { count: 'exact', head: true }).eq('dashboard_id', d.id)
        return { ...d, total_paineis: count ?? 0 }
      }))
      setDashboards(comContagem)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])
  usePolling(carregar, 45000, !!unidadeAtiva?.id)

  async function novo() {
    if (!unidadeAtiva?.id) return
    setCriando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const { data, error } = await sb.from('dashboards')
      .insert({ unidade_id: unidadeAtiva.id, nome: 'Novo dashboard', criado_por: user?.id })
      .select('id').single()
    setCriando(false)
    if (error || !data) { toast.error('Não foi possível criar. Verifique sua permissão.'); return }
    router.push(`/gestao/configuracoes/dashboards/${data.id}`)
  }

  async function excluir(d: Dashboard) {
    if (!await confirm({ titulo: `Excluir "${d.nome}"?`, mensagem: 'O dashboard e o link público serão removidos.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('dashboards').delete().eq('id', d.id)
    if (error) { toast.error('Não foi possível excluir.'); return }
    toast.success('Dashboard excluído.')
    setDashboards(prev => prev.filter(x => x.id !== d.id))
  }

  function linkPublico(token: string) {
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/painel/${token}`
  }
  async function copiarLink(d: Dashboard) {
    try {
      await navigator.clipboard.writeText(linkPublico(d.token))
      setCopiado(d.id); setTimeout(() => setCopiado(null), 2000)
    } catch { toast.error('Não foi possível copiar.') }
  }

  if (!unidadeAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma unidade selecionada</p>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Dashboards</h1>
          <p className="hidden sm:block text-xs text-gray-400 mt-0.5">Painéis de monitoramento com link público (TV) · Unidade: <span className="font-medium text-orange-500">{unidadeAtiva.nome}</span></p>
        </div>
        <Button onClick={novo} disabled={criando}>
          {criando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}Novo
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
      ) : dashboards.length === 0 ? (
        <div className="py-16 text-center">
          <LayoutDashboard size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum dashboard criado.</p>
          <p className="text-xs text-gray-400 mt-1">Crie um dashboard, adicione painéis de atividades e compartilhe o link numa TV.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {dashboards.map(d => (
            <div key={d.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <LayoutDashboard size={18} className="text-gray-300 flex-shrink-0" />
                <div className="min-w-0">
                  <Link href={`/gestao/configuracoes/dashboards/${d.id}`} className="font-medium text-sm text-gray-800 hover:text-orange-500 transition-colors line-clamp-1">
                    {d.nome}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">{d.total_paineis} {d.total_paineis === 1 ? 'painel' : 'painéis'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => copiarLink(d)} title="Copiar link público"
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  {copiado === d.id ? <><Check size={13} className="text-green-500" />Copiado</> : <><Link2 size={13} />Link</>}
                </button>
                <a href={linkPublico(d.token)} target="_blank" rel="noopener noreferrer" title="Abrir na TV"
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  <Tv size={13} />Abrir
                </a>
                <Link href={`/gestao/configuracoes/dashboards/${d.id}`} title="Editar"
                  className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors">
                  <Pencil size={15} />
                </Link>
                <button onClick={() => excluir(d)} title="Excluir"
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
