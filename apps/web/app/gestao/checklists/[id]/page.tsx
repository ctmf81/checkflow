import { redirect } from 'next/navigation'

export default async function ChecklistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/gestao/checklists/${id}/montar`)
}
