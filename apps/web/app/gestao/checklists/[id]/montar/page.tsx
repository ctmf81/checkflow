'use client'

import { use } from 'react'
import ChecklistMontador from '@/components/checklists/ChecklistMontador'

export default function EditarChecklistMontarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ChecklistMontador checklistId={id} />
}
