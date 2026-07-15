'use client'

import { useEffect, useRef } from 'react'

// Polling leve e barato para manter listagens/contadores frescos sem reload.
// Regras (pensadas para o Supabase free — ver /biz):
//   • PAUSA quando a aba está oculta (document.hidden) → zero consumo em background.
//   • REFETCH imediato ao voltar para a aba (dados frescos na hora que o usuário volta).
//   • callback via ref → não importa se a função muda de identidade a cada render
//     (não re-registra o intervalo, não vaza timers).
//   • `enabled=false` desliga (ex.: enquanto ainda não há unidade/empresa ativa).
//
// Uso: usePolling(carregar, 45000)  — chama carregar() a cada 45s enquanto visível.
export function usePolling(callback: () => void, intervalMs = 45000, enabled = true) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined') return

    let timer: ReturnType<typeof setInterval> | null = null
    const rodar = () => { if (!document.hidden) cbRef.current() }
    const iniciar = () => { if (!timer) timer = setInterval(rodar, intervalMs) }
    const parar = () => { if (timer) { clearInterval(timer); timer = null } }

    function aoMudarVisibilidade() {
      if (document.hidden) { parar() }
      else { cbRef.current(); iniciar() }  // refetch imediato + retoma
    }

    if (!document.hidden) iniciar()
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    return () => { parar(); document.removeEventListener('visibilitychange', aoMudarVisibilidade) }
  }, [intervalMs, enabled])
}
