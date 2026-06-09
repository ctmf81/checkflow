'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'checkflow_onboarding_visto'

function getPagesVistas(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function marcarComoVista(pageId: string) {
  const vistas = getPagesVistas()
  if (!vistas.includes(pageId)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...vistas, pageId]))
  }
}

export function useOnboarding(pageId: string) {
  const [aberto, setAberto] = useState(false)
  const [jaViu, setJaViu] = useState(true) // começa true para evitar flash
  const [cardAtual, setCardAtual] = useState(0)

  useEffect(() => {
    const vistas = getPagesVistas()
    const viu = vistas.includes(pageId)
    setJaViu(viu)
    if (!viu) {
      // Pequeno delay para o painel não aparecer antes da página carregar
      setTimeout(() => setAberto(true), 600)
    }
  }, [pageId])

  const fechar = useCallback(() => {
    setAberto(false)
    if (!jaViu) {
      marcarComoVista(pageId)
      setJaViu(true)
    }
    setCardAtual(0)
  }, [pageId, jaViu])

  const abrir = useCallback(() => {
    setCardAtual(0)
    setAberto(true)
  }, [])

  const proximo = useCallback((total: number) => {
    setCardAtual(c => Math.min(c + 1, total - 1))
  }, [])

  const anterior = useCallback(() => {
    setCardAtual(c => Math.max(c - 1, 0))
  }, [])

  return { aberto, jaViu, cardAtual, abrir, fechar, proximo, anterior }
}
