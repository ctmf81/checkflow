import { Header } from '@/components/layout/Header'
import { SessionProvider } from '@/contexts/SessionContext'

export default function OperacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
