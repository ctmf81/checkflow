// Rota /gestao/workflows/novo → abre o editor em modo criação
// O componente de edição vive em [id]/page.tsx e já trata id='novo'
import WorkflowEditorPage from '../[id]/page'

// Passa params resolvido como Promise (compatível com React 19 / Next 15)
export default function NovoWorkflowPage() {
  return <WorkflowEditorPage params={Promise.resolve({ id: 'novo' })} />
}
