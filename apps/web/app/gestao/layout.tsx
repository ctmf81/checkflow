import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { SessionProvider } from '@/contexts/SessionContext'
import { EscolherEmpresaModal } from '@/components/layout/EscolherEmpresaModal'
import { TermosGate } from '@/components/layout/TermosGate'

export default function GestaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-slate-50">
        <TermosGate />
        <EscolherEmpresaModal />
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-8">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  )
}
