'use client'

/**
 * Estado do drawer da sidebar no mobile. Em telas grandes (lg+) a sidebar é
 * fixa e este estado é ignorado; abaixo de lg ela vira um drawer controlado
 * pelo botão hambúrguer do Header.
 */

import { createContext, useContext, useState } from 'react'

interface SidebarCtx {
  aberta: boolean
  abrir: () => void
  fechar: () => void
  alternar: () => void
}

const Ctx = createContext<SidebarCtx | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [aberta, setAberta] = useState(false)
  return (
    <Ctx.Provider value={{
      aberta,
      abrir: () => setAberta(true),
      fechar: () => setAberta(false),
      alternar: () => setAberta(a => !a),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSidebar(): SidebarCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSidebar precisa estar dentro de <SidebarProvider>')
  return ctx
}

/** Versão que não lança fora do provider — para componentes compartilhados
 *  (ex: Header, usado tanto na Gestão quanto no Painel de sistema). */
export function useSidebarOptional(): SidebarCtx | null {
  return useContext(Ctx)
}
