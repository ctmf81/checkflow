// Rota /gestao/workflows/novo → abre o editor em modo criação
// O componente de edição vive em [id]/page.tsx e já trata id='novo'
import WorkflowEditorPage from '../[id]/page'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { getOnboardingConfig } from '@/components/onboarding/registry'

// Passa params resolvido como Promise (compatível com React 19 / Next 15)
export default function NovoWorkflowPage() {
  const cfg = getOnboardingConfig('workflows-novo')!
  return (
    <>
      <Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />
      <WorkflowEditorPage params={Promise.resolve({ id: 'novo' })} />
    </>
  )
}
