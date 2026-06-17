'use client'

import { useOnboarding } from '@/hooks/useOnboarding'
import { OnboardingPanel, OnboardingCardData } from './OnboardingPanel'

interface Props {
  pageId: string
  titulo: string
  cards: OnboardingCardData[]
  /** @deprecated o onboarding agora é sempre de visualização única (sem ícone "?") */
  visualizacaoUnica?: boolean
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
 * - Após "Entendido!": recolhe e NÃO reaparece (sem ícone "?"). Para tirar
 *   dúvidas depois, o usuário usa o assistente de ajuda com IA no chat.
 */
export function Onboarding({ pageId, titulo, cards }: Props) {
  const { aberto, jaViu, cardAtual, ativo, cards: cardsAtivos, fechar, proximo, anterior } = useOnboarding(pageId, cards)

  if (!ativo) return null

  return (
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
  )
}
