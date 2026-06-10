'use client'

import { useOnboarding } from '@/hooks/useOnboarding'
import { OnboardingPanel, OnboardingCardData } from './OnboardingPanel'
import { OnboardingIcon } from './OnboardingIcon'

interface Props {
  pageId: string
  titulo: string
  cards: OnboardingCardData[]
}

/**
 * Componente de onboarding contextual.
 *
 * Uso:
 *   <Onboarding
 *     pageId="tickets"
 *     titulo="Tickets / Chamados"
 *     cards={ONBOARDING_TICKETS}
 *   />
 *
 * - Na 1ª visita: abre automaticamente após 600ms
 * - Após "Entendido!": recolhe para ícone "?" na lateral
 * - Ícone "?" sempre disponível para rever as dicas
 */
export function Onboarding({ pageId, titulo, cards }: Props) {
  const { aberto, jaViu, cardAtual, ativo, cards: cardsAtivos, abrir, fechar, proximo, anterior } = useOnboarding(pageId, cards)

  if (!ativo) return null

  return (
    <>
      {/* Ícone lateral sempre visível após primeira visita */}
      {jaViu && !aberto && <OnboardingIcon onClick={abrir} />}

      {/* Painel de dicas */}
      <OnboardingPanel
        pageId={pageId}
        titulo={titulo}
        cards={cardsAtivos}
        aberto={aberto}
        jaViu={jaViu}
        cardAtual={cardAtual}
        onFechar={fechar}
        onProximo={() => proximo(cardsAtivos.length)}
        onAnterior={anterior}
      />
    </>
  )
}
