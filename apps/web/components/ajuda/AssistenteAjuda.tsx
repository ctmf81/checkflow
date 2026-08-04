'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircleQuestion, X, Send, Loader2, Sparkles, Video } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { AjudaVideo, embedUrlVideo, resolverVideosDaRota } from '@/lib/ajudaVideos'

type Msg = { role: 'user' | 'assistant'; content: string }

// Sugestões genéricas (fallback quando a tela não está no mapa)
const SUGESTOES_PADRAO = [
  'Como crio um checklist a partir de um modelo?',
  'Como funciona o plano de ação?',
  'O que acontece quando atinjo o limite do plano?',
]

// Perguntas pertinentes por tela. A chave é o prefixo da rota; vale o
// prefixo MAIS específico que casar com a rota atual. Assim, ao abrir o
// assistente na tela, já aparecem dúvidas do contexto certo.
const SUGESTOES_POR_TELA: { rota: string; perguntas: string[] }[] = [
  { rota: '/gestao/checklists', perguntas: [
    'Como crio um checklist?',
    'Por que um checklist não aparece na Operação?',
    'Como duplico um checklist para outra unidade?',
    'Para que serve o tempo de guarda das mídias?',
  ]},
  { rota: '/gestao/tarefas', perguntas: [
    'Como crio uma lista de tarefas?',
    'Qual a diferença entre data limite e nº de respostas?',
    'Quem vê a lista de tarefas na Operação?',
  ]},
  { rota: '/gestao/grupos', perguntas: [
    'Qual a diferença entre grupo e subgrupo?',
    'Como adiciono um usuário a um grupo?',
    'O que faz cada função (Operação, Nível 1, Nível 2)?',
  ]},
  { rota: '/gestao/agendamentos', perguntas: [
    'Como agendo um checklist recorrente?',
    'Quem vê a execução agendada na Operação?',
    'O que acontece se a data de referência estiver no passado?',
  ]},
  { rota: '/gestao/tickets', perguntas: [
    'Como funciona o fluxo de um ticket?',
    'O que é o SLA do ticket?',
    'Quem pode assumir e tratar um chamado?',
  ]},
  { rota: '/gestao/planos-acao', perguntas: [
    'Como funciona a moderação N1 e N2?',
    'Quem é avisado quando abre um plano de ação?',
    'Como escalo um plano para o Nível 2?',
  ]},
  { rota: '/gestao/acessos/usuarios', perguntas: [
    'Como cadastro um novo usuário?',
    'Como o usuário faz login (CPF)?',
    'Como reenvio a senha de um usuário?',
  ]},
  { rota: '/gestao/acessos/perfis', perguntas: [
    'O que é um perfil público?',
    'Como defino as permissões de um perfil?',
  ]},
  { rota: '/gestao/configuracoes/catalogos', perguntas: [
    'Para que serve um catálogo?',
    'Como importo os valores de um catálogo?',
  ]},
  { rota: '/gestao/configuracoes/documentos', perguntas: [
    'Como disponibilizo um documento para a equipe?',
    'O que é a Consulta Inteligente?',
  ]},
  { rota: '/gestao/plano', perguntas: [
    'O que acontece quando atinjo o limite do plano?',
    'Como compro um pacote adicional?',
    'Como troco de plano?',
  ]},
  { rota: '/gestao/indicadores', perguntas: [
    'O que cada indicador mostra?',
    'Como filtro os indicadores por período?',
  ]},
  { rota: '/gestao/configuracoes/dashboards', perguntas: [
    'Qual a diferença entre painel de atividade e painel de checklist?',
    'Como coloco o painel numa TV?',
    'Como funciona o alerta de silêncio quando a atividade para de ser medida?',
    'O que o tempo médio de execução mostra?',
  ]},
  { rota: '/gestao/workflows', perguntas: [
    'O que é um workflow?',
    'Como encadeio checklists num fluxo?',
    'Por que não consigo inativar um checklist usado por um workflow?',
  ]},
  { rota: '/gestao/padrao', perguntas: [
    'Para que serve um padrão?',
    'O que são as variáveis e valores de um padrão?',
    'Como uma atividade usa um padrão para validar a resposta?',
  ]},
  { rota: '/gestao/acessos/turnos', perguntas: [
    'Para que servem os turnos?',
    'Como configuro uma escala 12x36?',
    'O que acontece quando o usuário está fora do turno?',
  ]},
  { rota: '/gestao/configuracoes/nao-execucao', perguntas: [
    'Para que servem os motivos de não execução?',
    'Qual a diferença entre não execução de checklist e de atividade?',
  ]},
  { rota: '/gestao/configuracoes/causa-raiz', perguntas: [
    'Para que serve a causa raiz?',
    'Onde a causa raiz aparece no plano de ação?',
  ]},
  { rota: '/gestao/configuracoes/notificacoes', perguntas: [
    'Como edito o texto de uma notificação?',
    'Quais variáveis posso usar na mensagem?',
    'Como desativo o WhatsApp ou o e-mail de um evento?',
  ]},
  { rota: '/gestao/configuracoes/formatacao', perguntas: [
    'Como personalizo os nomes de grupo e subgrupo?',
  ]},
]

function resolverSugestoes(pathname: string | null): string[] {
  if (!pathname) return SUGESTOES_PADRAO
  const match = SUGESTOES_POR_TELA
    .filter(s => pathname === s.rota || pathname.startsWith(s.rota + '/') || pathname.startsWith(s.rota))
    .sort((a, b) => b.rota.length - a.rota.length)[0]
  return match?.perguntas ?? SUGESTOES_PADRAO
}

export function AssistenteAjuda() {
  const pathname = usePathname()
  const sugestoes = resolverSugestoes(pathname)
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  // Vídeos tutoriais da tela (cadastrados em /sistema/ajuda). Múltiplos por rota
  // suportados — modal vira carrossel de tabs. Sem vídeo, o botão não aparece.
  const [videos, setVideos] = useState<AjudaVideo[]>([])
  const [videoAberto, setVideoAberto] = useState(false)
  const [videoIdx, setVideoIdx] = useState(0)
  const videosDaTela = resolverVideosDaRota(pathname, videos)
  const videoAtual = videosDaTela[videoIdx] ?? videosDaTela[0] ?? null
  const embedAtual = embedUrlVideo(videoAtual?.url)

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, carregando])

  useEffect(() => {
    let ativo = true
    createClient().from('ajuda_videos').select('rota, titulo, url').eq('ativo', true)
      .then(({ data }) => { if (ativo && data) setVideos(data as AjudaVideo[]) })
    return () => { ativo = false }
  }, [])

  // Ao trocar de página, fecha a modal e volta pro 1º vídeo — a modal aberta
  // mostraria o vídeo da tela anterior mesmo com o pathname já atualizado.
  useEffect(() => { setVideoAberto(false); setVideoIdx(0) }, [pathname])

  async function enviar(texto: string) {
    const pergunta = texto.trim()
    if (!pergunta || carregando) return
    const novas: Msg[] = [...msgs, { role: 'user', content: pergunta }]
    setMsgs(novas)
    setInput('')
    setCarregando(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/ajuda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ mensagens: novas }),
      })
      const json = await res.json().catch(() => null)
      setMsgs([...novas, { role: 'assistant', content: json?.resposta ?? json?.error ?? 'Não consegui responder agora. Tente novamente.' }])
    } catch {
      setMsgs([...novas, { role: 'assistant', content: 'Erro de conexão. Tente novamente.' }])
    } finally {
      setCarregando(false)
    }
  }

  return (
    <>
      {!aberto && (
        <button onClick={() => setAberto(true)}
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-center transition-colors"
          aria-label="Abrir ajuda">
          <MessageCircleQuestion size={22} />
        </button>
      )}

      {aberto && (
        <div className="fixed bottom-5 right-5 z-50 w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-orange-500" />
              <span className="font-semibold text-gray-800 text-sm">Assistente CheckFlow</span>
            </div>
            <div className="flex items-center gap-2">
              {embedAtual && (
                <button onClick={() => { setVideoIdx(0); setVideoAberto(true) }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold shadow-sm transition-colors"
                  title={videoAtual?.titulo || 'Vídeo desta tela'}
                  aria-label="Assistir ao vídeo desta tela">
                  <Video size={14} />
                  {videosDaTela.length > 1 ? `Ver vídeos (${videosDaTela.length})` : 'Ver vídeo'}
                </button>
              )}
              <button onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {msgs.length === 0 && (
              <div className="text-sm text-gray-500">
                <p className="mb-3">Oi! Posso ajudar com dúvidas sobre o CheckFlow. Pergunte algo ou comece por:</p>
                <div className="space-y-1.5">
                  {sugestoes.map(s => (
                    <button key={s} onClick={() => enviar(s)}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] text-sm rounded-2xl px-3 py-2 whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'
                }`}>{m.content}</div>
              </div>
            ))}
            {carregando && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-500 rounded-2xl px-3 py-2 text-sm inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Pensando…
                </div>
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <form onSubmit={e => { e.preventDefault(); enviar(input) }} className="p-3 border-t border-gray-100 flex items-center gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Escreva sua dúvida…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            <button type="submit" disabled={carregando || !input.trim()}
              className="w-9 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {videoAberto && embedAtual && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setVideoAberto(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <Video size={16} className="text-orange-500 flex-shrink-0" />
                <span className="font-semibold text-gray-800 text-sm truncate">
                  {videoAtual?.titulo || 'Vídeo desta tela'}
                </span>
                {videosDaTela.length > 1 && (
                  <span className="text-xs text-gray-400 flex-shrink-0">· {videoIdx + 1} de {videosDaTela.length}</span>
                )}
              </div>
              <button onClick={() => setVideoAberto(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            {videosDaTela.length > 1 && (
              <div className="flex gap-1.5 px-3 py-2 bg-gray-50 border-b border-gray-100 overflow-x-auto">
                {videosDaTela.map((v, i) => (
                  <button key={v.id ?? i} onClick={() => setVideoIdx(i)}
                    className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
                      i === videoIdx
                        ? 'bg-orange-500 text-white font-semibold shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600'
                    }`}>
                    {v.titulo || `Vídeo ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
            <div className="aspect-video w-full bg-black">
              <iframe key={embedAtual} src={embedAtual} title={videoAtual?.titulo || 'Vídeo desta tela'}
                className="w-full h-full" allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
