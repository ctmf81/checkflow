'use client'

import { useEffect, useState } from 'react'
import { Save, Loader2, MessageCircle, Mail, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Info, Bell } from 'lucide-react'
import { PushToggle } from '@/components/pwa/PushToggle'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'
import { useToast } from '@/components/ui/feedback'
import { AlertCircle } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Canal = 'whatsapp' | 'email'
type Tipo =
  | 'ticket_aberto'
  | 'ticket_movimentado'
  | 'plano_aberto'
  | 'plano_enviado_n2'
  | 'plano_devolvido_n1'
  | 'tarefa_publicada'
  | 'reset_senha'

// Tipos que só têm canal WhatsApp (sem email)
const SO_WHATSAPP = new Set<Tipo>(['tarefa_publicada'])

interface Template {
  id?: string
  tipo: Tipo
  canal: Canal
  ativo: boolean
  assunto: string | null
  corpo: string
  _dirty?: boolean
}

// ─── Metadados dos tipos ──────────────────────────────────────────────────────

const TIPO_META: Record<Tipo, { label: string; desc: string; vars: { chave: string; desc: string }[] }> = {
  ticket_aberto: {
    label: 'Ticket aberto',
    desc: 'Enviado para todos do grupo/subgrupo destino quando um novo ticket é aberto.',
    vars: [
      { chave: 'destinatario',     desc: 'Nome do destinatário' },
      { chave: 'numero',           desc: 'Número do ticket (ex: 0042)' },
      { chave: 'titulo',           desc: 'Título do ticket' },
      { chave: 'descricao',        desc: 'Descrição completa' },
      { chave: 'prioridade',       desc: 'Nível de prioridade (critica, alta, media, baixa)' },
      { chave: 'emoji_prioridade', desc: 'Emoji da prioridade (🔴🟠🟡🟢)' },
      { chave: 'grupo',            desc: 'Nome do grupo destino' },
      { chave: 'subgrupo',         desc: 'Nome do subgrupo destino' },
      { chave: 'linha_categoria',  desc: 'Linha de categoria (em branco se não houver)' },
      { chave: 'ator',             desc: 'Nome de quem abriu o ticket' },
      { chave: 'link',             desc: 'Link direto para o ticket' },
    ],
  },
  ticket_movimentado: {
    label: 'Ticket movimentado',
    desc: 'Enviado ao abridor e/ou assignee quando há qualquer ação no ticket (aceite, devolução, validação, etc.).',
    vars: [
      { chave: 'destinatario', desc: 'Nome do destinatário' },
      { chave: 'numero',       desc: 'Número do ticket' },
      { chave: 'titulo',       desc: 'Título do ticket' },
      { chave: 'evento',       desc: 'Descrição da ação (ex: "Ticket assumido")' },
      { chave: 'ator',         desc: 'Nome de quem realizou a ação' },
      { chave: 'observacao',   desc: 'Texto da observação da ação' },
      { chave: 'link',         desc: 'Link direto para o ticket' },
    ],
  },
  plano_aberto: {
    label: 'Plano de Ação aberto',
    desc: 'Enviado apenas para moderadores N1 do subgrupo quando um plano de ação é criado.',
    vars: [
      { chave: 'destinatario', desc: 'Nome do destinatário' },
      { chave: 'atividade',    desc: 'Nome da atividade do checklist' },
      { chave: 'checklist',    desc: 'Nome do checklist' },
      { chave: 'subgrupo',     desc: 'Nome do subgrupo' },
      { chave: 'ator',         desc: 'Nome de quem abriu o plano' },
      { chave: 'observacao',   desc: 'Observação da abertura' },
      { chave: 'sla',          desc: 'Tempo de SLA (ex: "4h para vencer")' },
      { chave: 'linha_sla',    desc: 'Linha "SLA: X" (em branco se não houver)' },
      { chave: 'link',         desc: 'Link direto para o plano' },
    ],
  },
  plano_enviado_n2: {
    label: 'Plano escalado para N2',
    desc: 'Enviado para moderadores N2 quando o N1 escala o plano.',
    vars: [
      { chave: 'destinatario', desc: 'Nome do destinatário' },
      { chave: 'atividade',    desc: 'Nome da atividade' },
      { chave: 'checklist',    desc: 'Nome do checklist' },
      { chave: 'subgrupo',     desc: 'Nome do subgrupo' },
      { chave: 'n1',           desc: 'Nome do moderador N1 que escalou' },
      { chave: 'observacao',   desc: 'Observação do N1' },
      { chave: 'link',         desc: 'Link direto para o plano' },
    ],
  },
  plano_devolvido_n1: {
    label: 'Plano devolvido para N1',
    desc: 'Enviado aos moderadores N1 quando o N2 devolve o plano de ação.',
    vars: [
      { chave: 'destinatario', desc: 'Nome do destinatário' },
      { chave: 'atividade',    desc: 'Nome da atividade' },
      { chave: 'checklist',    desc: 'Nome do checklist' },
      { chave: 'subgrupo',     desc: 'Nome do subgrupo' },
      { chave: 'ator',         desc: 'Nome do moderador N2 que devolveu' },
      { chave: 'observacao',   desc: 'Observação do N2' },
      { chave: 'link',         desc: 'Link direto para o plano' },
    ],
  },
  tarefa_publicada: {
    label: 'Nova lista de tarefas',
    desc: 'Enviado por WhatsApp aos membros do grupo/subgrupo quando uma lista de tarefas é publicada com aviso ativado.',
    vars: [
      { chave: 'destinatario', desc: 'Nome do destinatário' },
      { chave: 'titulo',       desc: 'Título da lista de tarefas' },
      { chave: 'link',         desc: 'Link para a operação (aba Tarefas)' },
    ],
  },
  reset_senha: {
    label: 'Recuperação de senha / Primeiro acesso',
    desc: 'Enviado ao usuário com um código de verificação de 6 dígitos (recuperação de senha, reset feito por um gestor, ou primeiro acesso).',
    vars: [
      { chave: 'nome',       desc: 'Nome do usuário' },
      { chave: 'linha_nome', desc: '"Nome" precedido de espaço (vazio se sem nome)' },
      { chave: 'codigo',     desc: 'Código de verificação de 6 dígitos (expira em 15 minutos)' },
    ],
  },
}

const TIPOS_ORDEM: Tipo[] = [
  'ticket_aberto', 'ticket_movimentado',
  'plano_aberto', 'plano_enviado_n2', 'plano_devolvido_n1',
  'tarefa_publicada', 'reset_senha',
]

// Recurso de entitlement por tipo de notificação. Só mostra o template se o
// plano da empresa libera o módulo. `null` = sempre visível (auth/core, não é
// módulo gateável). Planos de Ação (causa_raiz) é serviço "padrão" → sempre libera.
const TIPO_RECURSO: Record<Tipo, string | null> = {
  ticket_aberto:      'ticket',
  ticket_movimentado: 'ticket',
  plano_aberto:       'causa_raiz',
  plano_enviado_n2:   'causa_raiz',
  plano_devolvido_n1: 'causa_raiz',
  tarefa_publicada:   'tarefas',
  reset_senha:        null,
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NotificacoesPage() {
  const { empresaAtiva, recursosHabilitados } = useSession()
  const supabase = createClient()
  const toast = useToast()

  // Só mostra templates dos módulos liberados pelo plano. null = sem restrição.
  const tiposVisiveis = TIPOS_ORDEM.filter(tipo => {
    const rec = TIPO_RECURSO[tipo]
    return !rec || recursosHabilitados === null || recursosHabilitados.has(rec)
  })

  const [templates, setTemplates] = useState<Record<string, Template>>({})
  const [loading,   setLoading]   = useState(true)
  const [salvando,  setSalvando]  = useState<string | null>(null)
  const [abertos,   setAbertos]   = useState<Set<string>>(new Set())

  function chave(tipo: Tipo, canal: Canal) { return `${tipo}::${canal}` }

  async function carregar() {
    if (!empresaAtiva) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('notificacao_templates')
      .select('id, tipo, canal, ativo, assunto, corpo')
      .eq('empresa_id', empresaAtiva.id)
    if (error) { toast.error('Não foi possível carregar os templates.'); setLoading(false); return }
    const mapa: Record<string, Template> = {}
    ;(data ?? []).forEach((r: any) => { mapa[chave(r.tipo, r.canal)] = r })
    setTemplates(mapa)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [empresaAtiva])

  function atualizar(tipo: Tipo, canal: Canal, campo: keyof Template, valor: any) {
    const k = chave(tipo, canal)
    setTemplates(prev => ({
      ...prev,
      [k]: { ...prev[k], tipo, canal, [campo]: valor, _dirty: true },
    }))
  }

  async function salvar(tipo: Tipo, canal: Canal) {
    if (!empresaAtiva) return
    const k = chave(tipo, canal)
    const t = templates[k]
    if (!t?._dirty) return
    setSalvando(k)

    const payload = {
      empresa_id: empresaAtiva.id,
      tipo, canal,
      ativo:   t.ativo,
      assunto: t.assunto ?? null,
      corpo:   t.corpo,
    }

    const { error } = t.id
      ? await supabase.from('notificacao_templates').update(payload).eq('id', t.id)
      : await supabase.from('notificacao_templates').upsert(payload, { onConflict: 'empresa_id,tipo,canal' })

    setSalvando(null)
    if (error) { toast.error('Não foi possível salvar o template.'); return }
    toast.success('Template salvo.')
    setTemplates(prev => ({ ...prev, [k]: { ...prev[k], _dirty: false } }))
  }

  function toggleAberto(tipo: Tipo) {
    setAbertos(prev => {
      const next = new Set(prev)
      next.has(tipo) ? next.delete(tipo) : next.add(tipo)
      return next
    })
  }

  if (!empresaAtiva) return (
    <div className="py-16 text-center">
      <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
      <p className="text-sm text-gray-600 font-medium">Nenhuma empresa selecionada</p>
    </div>
  )

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Carregando…</div>

  const cfg = getOnboardingConfig('config-notificacoes')!

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Templates de Notificação</h1>
        <p className="hidden sm:block text-sm text-gray-500 mt-0.5">
          Personalize o conteúdo das mensagens enviadas por WhatsApp e email. Use <code className="bg-gray-100 px-1 rounded text-xs">{'{{variavel}}'}</code> para inserir dados dinâmicos.
        </p>
      </div>

      {/* Notificações push deste aparelho (por usuário, não por empresa) */}
      <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold text-gray-800">Notificações no aparelho (push)</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Receba alertas de tickets, planos de ação e tarefas direto no aparelho — mesmo com o app fechado (requer o app instalado / PWA). Vale só para este dispositivo.
        </p>
        <PushToggle />
      </div>

      <div className="space-y-3">
        {tiposVisiveis.map(tipo => {
          const meta     = TIPO_META[tipo]
          const aberto   = abertos.has(tipo)
          const tmplWa   = templates[chave(tipo, 'whatsapp')]
          const tmplEmail = templates[chave(tipo, 'email')]

          return (
            <div key={tipo} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {/* Cabeçalho do tipo */}
              <button
                onClick={() => toggleAberto(tipo)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                <div>
                  <span className="font-medium text-gray-800 text-sm">{meta.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{meta.desc}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {/* Indicadores de status */}
                  <div className="flex gap-1.5">
                    {(['whatsapp', 'email'] as Canal[]).filter(c => !(SO_WHATSAPP.has(tipo) && c === 'email')).map(canal => {
                      const t = templates[chave(tipo, canal)]
                      return (
                        <span key={canal}
                          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            t?.ativo === false ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-600'
                          }`}>
                          {canal === 'whatsapp' ? <MessageCircle size={10} /> : <Mail size={10} />}
                          {t?.ativo === false ? 'off' : 'on'}
                        </span>
                      )
                    })}
                  </div>
                  {aberto ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </div>
              </button>

              {/* Conteúdo expandido */}
              {aberto && (
                <div className="border-t border-gray-50 divide-y divide-gray-50">

                  {/* Variáveis disponíveis */}
                  <div className="px-4 py-3 bg-blue-50/40">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-2">
                      <Info size={12} /> Variáveis disponíveis
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {meta.vars.map(v => (
                        <span key={v.chave} title={v.desc}
                          className="font-mono text-xs bg-white border border-blue-100 text-blue-700 px-2 py-0.5 rounded cursor-help">
                          {`{{${v.chave}}}`}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <CanalEditor
                    canal="whatsapp"
                    tipo={tipo}
                    template={tmplWa}
                    temAssunto={false}
                    salvando={salvando === chave(tipo, 'whatsapp')}
                    onChange={(campo, val) => atualizar(tipo, 'whatsapp', campo as any, val)}
                    onSalvar={() => salvar(tipo, 'whatsapp')}
                  />

                  {/* Email — oculto para tipos só-WhatsApp */}
                  {!SO_WHATSAPP.has(tipo) && (
                    <CanalEditor
                      canal="email"
                      tipo={tipo}
                      template={tmplEmail}
                      temAssunto
                      salvando={salvando === chave(tipo, 'email')}
                      onChange={(campo, val) => atualizar(tipo, 'email', campo as any, val)}
                      onSalvar={() => salvar(tipo, 'email')}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Editor de canal ──────────────────────────────────────────────────────────

function CanalEditor({ canal, template, temAssunto, salvando, onChange, onSalvar }: {
  canal: Canal
  tipo: Tipo
  template: Template | undefined
  temAssunto: boolean
  salvando: boolean
  onChange: (campo: string, val: any) => void
  onSalvar: () => void
}) {
  const ativo  = template?.ativo !== false
  const assunto = template?.assunto ?? ''
  const corpo   = template?.corpo ?? ''

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {canal === 'whatsapp'
            ? <MessageCircle size={14} className="text-green-600" />
            : <Mail size={14} className="text-blue-600" />}
          <span className="text-sm font-medium text-gray-700 capitalize">{canal === 'whatsapp' ? 'WhatsApp' : 'Email'}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => onChange('ativo', !ativo)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              ativo ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {ativo
              ? <ToggleRight size={14} className="text-green-600" />
              : <ToggleLeft size={14} className="text-gray-400" />}
            {ativo ? 'Ativado' : 'Desativado'}
          </button>
          <button onClick={onSalvar} disabled={salvando || !template?._dirty}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {salvando
              ? <Loader2 size={11} className="animate-spin" />
              : <Save size={11} />}
            Salvar
          </button>
        </div>
      </div>

      {ativo && (
        <div className="space-y-2">
          {temAssunto && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Assunto do email</label>
              <input
                value={assunto}
                onChange={e => onChange('assunto', e.target.value)}
                placeholder="Assunto…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Corpo da mensagem {canal === 'email' ? '(texto — será formatado automaticamente)' : ''}
            </label>
            <textarea
              value={corpo}
              onChange={e => onChange('corpo', e.target.value)}
              rows={canal === 'whatsapp' ? 6 : 8}
              placeholder={`Corpo da mensagem com {{variavel}}…`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>
        </div>
      )}
    </div>
  )
}
