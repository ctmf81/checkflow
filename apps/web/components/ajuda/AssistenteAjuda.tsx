'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircleQuestion, X, Send, Loader2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type Msg = { role: 'user' | 'assistant'; content: string }

const SUGESTOES = [
  'Como crio um checklist a partir de um modelo?',
  'Como funciona o plano de ação?',
  'O que acontece quando atinjo o limite do plano?',
]

export function AssistenteAjuda() {
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, carregando])

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
          className="fixed bottom-20 right-5 z-40 w-12 h-12 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-center transition-colors"
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
            <button onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {msgs.length === 0 && (
              <div className="text-sm text-gray-500">
                <p className="mb-3">Oi! Posso ajudar com dúvidas sobre o CheckFlow. Pergunte algo ou comece por:</p>
                <div className="space-y-1.5">
                  {SUGESTOES.map(s => (
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
    </>
  )
}
