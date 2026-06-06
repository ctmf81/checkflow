/**
 * Testes unitários: lógica de detecção de vídeo antigo
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Lógica extraída do CampoVideo
function isVideoAntigo(lastModifiedMs: number, agora: Date, limiteHoras = 1): boolean {
  const diff = (agora.getTime() - lastModifiedMs) / (1000 * 60 * 60)
  return diff > limiteHoras
}

describe('detecção de vídeo antigo', () => {
  const agora = new Date('2026-06-06T10:00:00Z')

  it('vídeo gravado agora (0 min atrás) → não é antigo', () => {
    const lastModified = new Date('2026-06-06T09:59:00Z').getTime()
    expect(isVideoAntigo(lastModified, agora)).toBe(false)
  })

  it('vídeo de 30 minutos atrás → não é antigo', () => {
    const lastModified = new Date('2026-06-06T09:30:00Z').getTime()
    expect(isVideoAntigo(lastModified, agora)).toBe(false)
  })

  it('vídeo de exatamente 1h atrás → não é antigo (limite é >1h)', () => {
    const lastModified = new Date('2026-06-06T09:00:00Z').getTime()
    expect(isVideoAntigo(lastModified, agora)).toBe(false)
  })

  it('vídeo de 1h01 atrás → é antigo', () => {
    const lastModified = new Date('2026-06-06T08:58:00Z').getTime()
    expect(isVideoAntigo(lastModified, agora)).toBe(true)
  })

  it('vídeo de ontem → é antigo', () => {
    const lastModified = new Date('2026-06-05T10:00:00Z').getTime()
    expect(isVideoAntigo(lastModified, agora)).toBe(true)
  })

  it('vídeo de um mês atrás → é antigo', () => {
    const lastModified = new Date('2026-05-06T10:00:00Z').getTime()
    expect(isVideoAntigo(lastModified, agora)).toBe(true)
  })
})
