'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Ruler, Trash2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm, useToast } from '@/components/ui/feedback'

interface PadraoCard {
  id: string; nome: string; descricao: string | null
  grupo: { nome: string } | null; subgrupo: { nome: string } | null
  totalInstancias: number
}

export default function PadroesPage() {
  const { unidadeAtiva } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const [padroes, setPadroes] = useState<PadraoCard[]>([])
  const [loading, setLoading] = useState(true)

  async function carregar() {
    if (!unidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('padroes')
      .select('id, nome, descricao, grupo:grupos(nome), subgrupo:subgrupos(nome)')
      .eq('unidade_id', unidadeAtiva.id).eq('ativo', true).order('nome')

    if (data) {
      const comContagens = await Promise.all(data.map(async (p: any) => {
        const { count } = await supabase.from('padrao_instancias')
          .select('id', { count: 'exact', head: true }).eq('padrao_id', p.id)
        return { ...p, totalInstancias: count ?? 0 }
      }))
      setPadroes(comContagens as any)
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeAtiva?.id])

  async function excluir(id: string, nome: string) {
    if (!await confirm({ titulo: `Excluir o padrão "${nome}"?`, mensagem: 'Atividades que o usam deixarão de validar.', confirmarLabel: 'Excluir', perigo: true })) return
    const { error } = await createClient().from('padroes').update({ ativo: false }).eq('id', id)
    if (error) { toast.error('Não foi possível excluir o padrão.'); return }
    toast.success('Padrão excluído.')
    carregar()
  }

  const cfg = getOnboardingConfig('padrao-padroes')!

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Padrões</h1>
          <p className="text-sm text-gray-500 mt-0.5">Padrões de validação numérica baseados em combinações de variáveis</p>
        </div>
        <Link href="/gestao/padrao/criar"><Button><Plus size={16} />Novo</Button></Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : padroes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Ruler size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum padrão cadastrado ainda</p>
        </div>
      ) : (
        <div className="space-y-2">
          {padroes.map(p => (
            <Link key={p.id} href={`/gestao/padrao/criar?id=${p.id}`}
              className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3.5 hover:border-orange-200 transition-colors group">
              <div>
                <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {[p.grupo?.nome, p.subgrupo?.nome].filter(Boolean).join(' › ')}
                  {p.grupo || p.subgrupo ? ' · ' : ''}
                  {p.totalInstancias} instância{p.totalInstancias === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={e => { e.preventDefault(); excluir(p.id, p.nome) }}
                  className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={15} /></button>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-orange-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
