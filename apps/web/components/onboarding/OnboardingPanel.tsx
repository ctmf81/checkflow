'use client'

import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react'

export interface OnboardingCardData {
  icon: string
  titulo: string
  texto: string
  /** Opcional: lista de itens de fluxo (badges sequenciais) */
  fluxo?: string[]
  /** Opcional: lista de dicas em bullet */
  dicas?: string[]
}

interface Props {
  pageId: string
  titulo: string
  cards: OnboardingCardData[]
  aberto: boolean
  jaViu: boolean
  cardAtual: number
  onFechar: () => void
  onProximo: () => void
  onAnterior: () => void
}

export function OnboardingPanel({
  titulo, cards, aberto, jaViu, cardAtual,
  onFechar, onProximo, onAnterior,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const card = cards[cardAtual]
  const isUltimo = cardAtual === cards.length - 1

  // Fecha ao clicar fora (só após já ter visto)
  useEffect(() => {
    if (!aberto || !jaViu) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onFechar()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [aberto, jaViu, onFechar])

  if (!aberto) return null

  return (
    <>
      {/* Overlay suave apenas na primeira visita */}
      {!jaViu && (
        <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" />
      )}

      {/* Painel lateral */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full z-50 flex items-center pointer-events-none">
        <div
          className="pointer-events-auto mr-4 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
          style={{ animation: 'slideInRight 0.3s ease-out' }}>

          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-400 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{card.icon}</span>
              <span className="text-white font-semibold text-sm">{titulo}</span>
            </div>
            <button
              onClick={onFechar}
              className="text-white/80 hover:text-white transition-colors rounded-lg p-0.5 hover:bg-white/20">
              <X size={15} />
            </button>
          </div>

          {/* Dots de progresso */}
          {cards.length > 1 && (
            <div className="flex justify-center gap-1.5 pt-3 pb-1">
              {cards.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === cardAtual
                    ? 'w-5 bg-orange-500'
                    : i < cardAtual
                    ? 'w-1.5 bg-orange-300'
                    : 'w-1.5 bg-gray-200'
                }`} />
              ))}
            </div>
          )}

          {/* Conteúdo do card */}
          <div className="px-4 py-3 min-h-[160px]">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">
              {card.titulo}
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              {card.texto}
            </p>

            {/* Fluxo visual */}
            {card.fluxo && (
              <div className="mt-3 flex flex-wrap gap-1">
                {card.fluxo.map((step, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                      {step}
                    </span>
                    {i < card.fluxo!.length - 1 && (
                      <ChevronRight size={10} className="text-gray-300" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Dicas em bullet */}
            {card.dicas && (
              <ul className="mt-3 space-y-1.5">
                {card.dicas.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className="mt-0.5 text-orange-400 shrink-0">•</span>
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Navegação */}
          <div className="px-4 pb-4 flex items-center justify-between gap-2">
            <button
              onClick={onAnterior}
              disabled={cardAtual === 0}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-0 transition-all px-2 py-1.5 rounded-lg hover:bg-gray-50">
              <ChevronLeft size={13} /> Voltar
            </button>

            {isUltimo ? (
              <button
                onClick={onFechar}
                className="flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                <CheckCircle size={13} /> Entendido!
              </button>
            ) : (
              <button
                onClick={onProximo}
                className="flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                Próximo <ChevronRight size={13} />
              </button>
            )}
          </div>

          {/* Rodapé sutil na primeira vez */}
          {!jaViu && (
            <div className="border-t border-gray-50 px-4 py-2">
              <p className="text-[10px] text-gray-300 text-center">
                Disponível depois no ícone <span className="font-semibold">?</span> lateral
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
