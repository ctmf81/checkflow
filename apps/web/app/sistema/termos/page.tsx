'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Save, History } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

interface Versao { id: string; versao: string; atualizado_em: string }

export default function TermosAdminPage() {
  const [texto, setTexto] = useState('')
  const [versaoAtual, setVersaoAtual] = useState('')
  const [historico, setHistorico] = useState<Versao[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: vigente }, { data: hist }] = await Promise.all([
      supabase.from('termos_uso').select('texto, versao').order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('termos_uso').select('id, versao, atualizado_em').order('atualizado_em', { ascending: false }).limit(10),
    ])
    if (vigente) { setTexto(vigente.texto); setVersaoAtual(vigente.versao) }
    if (hist) setHistorico(hist as Versao[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function salvar() {
    if (!texto.trim()) { setMsg('O texto não pode ficar vazio.'); return }
    setMsg('')
    setSalvando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Nova versão = novo registro com timestamp — usuários com versão
    // antiga serão questionados novamente no próximo acesso.
    const novaVersao = new Date().toISOString().slice(0, 16).replace('T', ' ')

    const { error } = await supabase.from('termos_uso').insert({
      texto: texto.trim(),
      versao: novaVersao,
      atualizado_por: user?.id ?? null,
    })

    if (error) {
      setMsg('Erro ao salvar nova versão.')
    } else {
      setMsg('Nova versão publicada! Todos os usuários serão questionados a aceitar novamente no próximo acesso.')
      carregar()
    }
    setSalvando(false)
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={20} className="text-orange-500" />
        <h1 className="text-xl font-semibold text-gray-800">Termo de Uso</h1>
      </div>
      <p className="text-sm text-gray-500 mb-1">
        Texto único, válido para todas as empresas do sistema. Exibido como aceite obrigatório no primeiro acesso de cada usuário.
      </p>
      <p className="text-xs text-gray-400 mb-6">Versão vigente: <span className="font-medium text-gray-600">{versaoAtual}</span></p>

      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={22}
        className="w-full px-4 py-3 text-sm font-mono border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 leading-relaxed" />

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-amber-600">
          Ao salvar, uma <strong>nova versão</strong> é publicada e todos os usuários — de todas as empresas — precisarão aceitar o termo novamente.
        </p>
        <Button onClick={salvar} disabled={salvando}>
          <Save size={15} />{salvando ? 'Publicando...' : 'Publicar nova versão'}
        </Button>
      </div>
      {msg && <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg mt-3">{msg}</p>}

      {historico.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
            <History size={15} className="text-gray-400" />Histórico de versões
          </div>
          <div className="bg-white rounded-xl border border-gray-200">
            {historico.map((v, i) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0 text-sm">
                <span className="text-gray-700">{v.versao}{i === 0 && <span className="ml-2 text-xs text-green-600 font-medium">(vigente)</span>}</span>
                <span className="text-xs text-gray-400">{new Date(v.atualizado_em).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
