import { redirect } from 'next/navigation'

export default function ChecklistDetailPage({ params }: { params: { id: string } }) {
  redirect(`/gestao/checklists/${params.id}/montar`)
}
