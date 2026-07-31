'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Building2, PowerOff, ImagePlus, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { UnidadeModal } from './UnidadeModal'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useConfirm, useToast } from '@/components/ui/feedback'

interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  logo_url: string | null
  status: 'ativo' | 'inativo' | 'pendente' | 'bloqueada'
  demo: boolean
  demo_vertical: string | null
  demo_provisionado: boolean
}

interface Unidade {
  id: string
  nome: string
  status: 'ativo' | 'inativo'
}


export default function EmpresaPage() {
  const { empresaAtiva } = useSession()
  const confirm = useConfirm()
  const toast = useToast()
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Edição dados empresa
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')

  // Logo (upload passa pela API — RLS do bucket não deixa o admin da empresa subir direto)
  const inputLogoRef = useRef<HTMLInputElement>(null)
  const [imagemSrc, setImagemSrc] = useState<string | null>(null)
  const [cropAberto, setCropAberto] = useState(false)
  const [salvandoLogo, setSalvandoLogo] = useState(false)

  // Modal unidade
  const [modalUnidade, setModalUnidade] = useState(false)
  const [unidadeEditando, setUnidadeEditando] = useState<Unidade | undefined>()

  // Gerador de dados de demonstração (só empresa demo)
  const [gerandoDemo, setGerandoDemo] = useState(false)

  async function carregar() {
    if (!empresaAtiva?.id) { setLoading(false); return }
    const supabase = createClient()

    const { data: emp } = await supabase.from('empresas').select('id, nome, cnpj, logo_url, status, demo, demo_vertical, demo_provisionado').eq('id', empresaAtiva.id).single()
    if (emp) {
      setEmpresa(emp)
      setNome(emp.nome)
      setCnpj(emp.cnpj ?? '')
    }

    const { data: unis } = await supabase.from('unidades').select('id, nome, status').eq('empresa_id', empresaAtiva.id).order('status').order('nome')
    if (unis) setUnidades(unis)

    setLoading(false)
  }

  useEffect(() => { carregar() }, [empresaAtiva?.id])

  async function salvarEmpresa() {
    if (!empresa) return
    setSalvando(true)
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/empresa/atualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ empresaId: empresa.id, nome, cnpj }),
    })
    setSalvando(false)
    if (!res.ok) {
      const json = await res.json()
      toast.error(json.message ?? 'Não foi possível salvar os dados da empresa.')
      return
    }
    setEditando(false)
    toast.success('Dados da empresa salvos.')
    await carregar()
  }

  function selecionarLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setImagemSrc(reader.result as string); setCropAberto(true) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function enviarLogo(blob: Blob) {
    if (!empresa) return
    setCropAberto(false)
    setSalvandoLogo(true)
    const { data: { session } } = await createClient().auth.getSession()
    const form = new FormData()
    form.append('empresaId', empresa.id)
    form.append('arquivo', new File([blob], 'logo.jpg', { type: 'image/jpeg' }))
    const res = await fetch('/api/empresa/logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: form,
    })
    setSalvandoLogo(false)
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      toast.error(json?.message ?? 'Não foi possível salvar a logo.')
      return
    }
    setImagemSrc(null)
    toast.success('Logo atualizada.')
    await carregar()
  }

  async function removerLogo() {
    if (!empresa) return
    if (!await confirm({ titulo: 'Remover a logo?', mensagem: 'A empresa volta a aparecer sem logo no sistema e nos relatórios.', confirmarLabel: 'Remover', perigo: true })) return
    setSalvandoLogo(true)
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/empresa/logo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ empresaId: empresa.id }),
    })
    setSalvandoLogo(false)
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      toast.error(json?.message ?? 'Não foi possível remover a logo.')
      return
    }
    toast.success('Logo removida.')
    await carregar()
  }

  async function chamarGerador(modo: 'estrutura' | 'dados') {
    if (!empresa) return
    setGerandoDemo(true)
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/empresa/demo/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ empresaId: empresa.id, modo }),
    })
    const json = await res.json().catch(() => null)
    setGerandoDemo(false)
    if (!res.ok) { toast.error(json?.detalhe ?? json?.message ?? 'Não foi possível gerar.'); return }
    if (modo === 'estrutura') {
      toast.success(`Estrutura criada: ${json?.criados?.checklists ?? 0} checklists, ${json?.criados?.usuarios ?? 0} usuários.`)
      await carregar() // recarrega → some o botão de estrutura, aparece o de dados
    } else {
      toast.success(`Dados gerados: ${json?.criados?.execucoes ?? 0} execuções, ${json?.criados?.planos ?? 0} planos de ação.`)
    }
  }

  async function gerarEstruturaDemo() {
    if (!await confirm({ titulo: 'Gerar a estrutura da demonstração?', mensagem: 'Cria unidade, grupos, checklists, catálogos e usuários da vertical. Faça isto uma vez.', confirmarLabel: 'Gerar estrutura' })) return
    await chamarGerador('estrutura')
  }

  async function gerarDadosDemo() {
    if (!await confirm({ titulo: 'Gerar dados dos últimos 30 dias?', mensagem: 'Acrescenta 80 execuções e planos de ação (não apaga o que já existe). Pode repetir para deixar mais cheio.', confirmarLabel: 'Gerar' })) return
    await chamarGerador('dados')
  }

  async function inativarUnidade(id: string) {
    // Soft-delete: NUNCA hard delete — `unidades` é cascade em quase toda a
    // árvore (grupos, checklists, catálogos, tickets, tarefas...), então um
    // delete apagaria os dados da unidade inteira. Inativar é reversível.
    const ativasRestantes = unidades.filter(u => u.status === 'ativo' && u.id !== id).length
    if (ativasRestantes === 0) {
      toast.error('A empresa deve ter ao menos uma unidade ativa.')
      return
    }
    if (!await confirm({ titulo: 'Inativar esta unidade?', mensagem: 'A unidade deixa de aparecer para uso. Você pode reativá-la depois pela edição.', confirmarLabel: 'Inativar', perigo: true })) return
    const { error } = await createClient().from('unidades').update({ status: 'inativo' }).eq('id', id)
    if (error) { toast.error('Não foi possível inativar a unidade.'); return }
    toast.success('Unidade inativada.')
    carregar()
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <Building2 size={40} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-500">Nenhuma empresa selecionada.</p>
      <p className="text-xs text-gray-400 mt-1">Selecione uma empresa no Painel de sistema.</p>
    </div>
  )

  const cfg = getOnboardingConfig('acessos-empresa')!

  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="space-y-6 max-w-2xl">

        {/* Card dados da empresa */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dados da empresa</span>
            <button onClick={() => setEditando(!editando)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-500 transition-colors">
              <Pencil size={14} />
              {editando ? 'Cancelar' : 'Editar'}
            </button>
          </div>

          <div className="px-6 py-5">
            {/* Logo */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Logo</label>
              <input ref={inputLogoRef} type="file" accept="image/png,image/jpeg,image/webp"
                className="hidden" onChange={selecionarLogo} />

              <div className="flex items-center gap-3">
                {empresa?.logo_url ? (
                  <div className="w-32 h-[52px] rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={empresa.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-32 h-[52px] rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
                    <ImagePlus size={20} className="text-gray-300" />
                  </div>
                )}

                {editando && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={salvandoLogo}
                      onClick={() => inputLogoRef.current?.click()}>
                      {salvandoLogo ? 'Salvando...' : empresa?.logo_url ? 'Trocar' : 'Enviar logo'}
                    </Button>
                    {empresa?.logo_url && (
                      <button type="button" onClick={removerLogo} disabled={salvandoLogo} title="Remover logo"
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {editando && (
                <p className="text-[11px] text-gray-400 mt-1.5">PNG, JPG ou WebP até 2 MB — ideal 500 x 200 ou maior.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Nome</label>
                {editando ? (
                  <input value={nome} onChange={e => setNome(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                ) : (
                  <p className="text-sm font-medium text-gray-800">{empresa?.nome}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CNPJ</label>
                {editando ? (
                  <input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                ) : (
                  <p className="text-sm text-gray-700">{empresa?.cnpj ?? '—'}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                {empresa && <Badge status={empresa.status} />}
              </div>
            </div>

            {editando && (
              <div className="flex justify-end mt-4">
                <Button onClick={salvarEmpresa} disabled={salvando} size="sm">
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Card demonstração — só empresa demo */}
        {empresa?.demo && (
          <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-orange-100 bg-orange-50">
              <Sparkles size={15} className="text-orange-500" />
              <span className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Empresa de demonstração</span>
            </div>
            <div className="px-6 py-5">
              {!empresa.demo_provisionado ? (
                <>
                  <p className="text-sm text-gray-600">
                    Primeiro, gere a <strong>estrutura</strong> da vertical: unidade, grupos, checklists, catálogos e usuários. Faça isto uma vez.
                  </p>
                  <div className="flex justify-start mt-4">
                    <Button onClick={gerarEstruturaDemo} disabled={gerandoDemo} size="sm">
                      <Sparkles size={14} />
                      {gerandoDemo ? 'Gerando…' : 'Gerar estrutura'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Gera <strong>80 execuções</strong> dos últimos 30 dias (com planos de ação) para deixar a demonstração cheia.
                    <span className="text-gray-400"> Acrescenta aos dados existentes — não apaga nada; pode repetir.</span>
                  </p>
                  <div className="flex justify-start mt-4">
                    <Button onClick={gerarDadosDemo} disabled={gerandoDemo} size="sm">
                      <Sparkles size={14} />
                      {gerandoDemo ? 'Gerando…' : 'Gerar dados dos últimos 30 dias'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Card unidades */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Unidades</span>
            <Button size="sm" onClick={() => { setUnidadeEditando(undefined); setModalUnidade(true) }}>
              <Plus size={14} />Nova
            </Button>
          </div>

          {unidades.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-500">Nenhuma unidade cadastrada.</p>
            </div>
          ) : (
            unidades.map(u => (
              <div key={u.id} className="flex items-center justify-between px-6 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{u.nome}</p>
                  <span className={`text-xs ${u.status === 'ativo' ? 'text-green-600' : 'text-gray-400'}`}>
                    {u.status === 'ativo' ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setUnidadeEditando(u); setModalUnidade(true) }}
                    className="p-1.5 text-gray-400 hover:text-orange-500 transition-colors">
                    <Pencil size={14} />
                  </button>
                  {u.status === 'ativo' && (
                    <button onClick={() => inativarUnidade(u.id)} title="Inativar unidade"
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                      <PowerOff size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {cropAberto && imagemSrc && (
        <ImageCropModal
          imageSrc={imagemSrc}
          onConfirm={enviarLogo}
          onClose={() => { setCropAberto(false); setImagemSrc(null) }}
        />
      )}

      {modalUnidade && empresa && (
        <UnidadeModal
          empresaId={empresa.id}
          unidade={unidadeEditando}
          onClose={() => setModalUnidade(false)}
          onSalvo={() => { setModalUnidade(false); carregar() }}
        />
      )}
    </>
  )
}
