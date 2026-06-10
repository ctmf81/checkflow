'use client'

import ChecklistMontador from '@/components/checklists/ChecklistMontador'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

export default function NovoChecklistMontarPage() {
  const cfg = getOnboardingConfig('checklists-novo')!
  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <ChecklistMontador checklistId={null} />
    </>
  )
}
