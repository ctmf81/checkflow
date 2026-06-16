'use client'

import ChecklistMontador from '@/components/checklists/ChecklistMontador'

export default function NovoTemplatePage() {
  return <ChecklistMontador checklistId={null} modoTemplate baseRoute="/sistema/templates" />
}
