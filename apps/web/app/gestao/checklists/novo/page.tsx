import { redirect } from 'next/navigation'

// Redireciona para o montador com id 'novo'
export default function NovoChecklistPage() {
  redirect('/gestao/checklists/novo/montar')
}
