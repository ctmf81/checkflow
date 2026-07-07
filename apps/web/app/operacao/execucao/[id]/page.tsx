'use client'

import { use } from 'react'
import { ExecucaoViewer } from '@/components/execucoes/ExecucaoViewer'

export default function ExecucaoOperacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ExecucaoViewer execId={id} ambiente="operacao" />
}
