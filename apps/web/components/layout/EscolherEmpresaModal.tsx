'use client'

import { useSession } from '@/contexts/SessionContext'

export function EscolherEmpresaModal() {
  const { precisaEscolherEmpresa, empresas, setEmpresaAtiva } = useSession()

  if (!precisaEscolherEmpresa) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-800">Escolha a empresa</h2>
        <p className="mt-1 text-sm text-slate-500">
          Você está vinculado a mais de uma empresa. Selecione com qual deseja trabalhar agora.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {empresas.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setEmpresaAtiva(emp)}
              className="rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:bg-blue-50"
            >
              {emp.nome}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
