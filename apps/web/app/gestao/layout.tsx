import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { SessionProvider } from '@/contexts/SessionContext'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { EscolherEmpresaModal } from '@/components/layout/EscolherEmpresaModal'
import { TermosGate } from '@/components/layout/TermosGate'
import { AvisoTurno } from '@/components/layout/AvisoTurno'
import { AssistenteAjuda } from '@/components/ajuda/AssistenteAjuda'

export default function GestaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SidebarProvider>
        <div className="flex min-h-screen bg-slate-50">
          <TermosGate />
          <EscolherEmpresaModal />
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <AvisoTurno />
            <main className="flex-1 p-4 sm:p-6 lg:p-8">
              {children}
            </main>
          </div>
          <AssistenteAjuda />
        </div>
      </SidebarProvider>
    </SessionProvider>
  )
}
