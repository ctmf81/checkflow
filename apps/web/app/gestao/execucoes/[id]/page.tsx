'use client'

import { use } from 'react'
import { ExecucaoViewer } from '@/components/execucoes/ExecucaoViewer'

export default function ExecucaoGestaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ExecucaoViewer execId={id} ambiente="gestao" />
}
