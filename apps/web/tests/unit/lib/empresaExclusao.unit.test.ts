// Testes da lógica pura da exclusão de empresa (lib/empresaExclusao.ts):
// extração do path do logo e montagem dos prefixos de storage.
import { describe, it, expect } from 'vitest'
import {
  extrairLogoPath, prefixosExecucoes, prefixosEmpresas, pathsPdfsExecucao,
} from '@/lib/empresaExclusao'

describe('extrairLogoPath', () => {
  it('extrai o path após /empresas/ e ignora a query string', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/empresas/logos/abc.png?token=xyz'
    expect(extrairLogoPath(url)).toBe('logos/abc.png')
  })
  it('sem query string', () => {
    expect(extrairLogoPath('https://x/public/empresas/logos/abc.png')).toBe('logos/abc.png')
  })
  it('null/undefined/vazio → null', () => {
    expect(extrairLogoPath(null)).toBeNull()
    expect(extrairLogoPath(undefined)).toBeNull()
    expect(extrairLogoPath('')).toBeNull()
  })
  it('URL sem o bucket empresas → null', () => {
    expect(extrairLogoPath('https://x/public/execucoes/abc.png')).toBeNull()
  })
  it('marker presente mas path vazio → null', () => {
    expect(extrairLogoPath('https://x/public/empresas/')).toBeNull()
    expect(extrairLogoPath('https://x/public/empresas/?t=1')).toBeNull()
  })
})

describe('prefixosExecucoes', () => {
  it('monta {execId}, tarefas/, tickets/, planos/', () => {
    expect(prefixosExecucoes({
      execucoes: ['e1', 'e2'], tarefaExecucoes: ['t1'], tickets: ['k1'], planos: ['p1'],
    })).toEqual(['e1', 'e2', 'tarefas/t1', 'tickets/k1', 'planos/p1'])
  })
  it('listas vazias → array vazio', () => {
    expect(prefixosExecucoes({ execucoes: [], tarefaExecucoes: [], tickets: [], planos: [] })).toEqual([])
  })
})

describe('prefixosEmpresas', () => {
  it('monta etapas/, documentos/, catalogos/', () => {
    expect(prefixosEmpresas({ etapas: ['a'], documentos: ['b'], catalogos: ['c'] }))
      .toEqual(['etapas/a', 'documentos/b', 'catalogos/c'])
  })
})

describe('pathsPdfsExecucao', () => {
  it('monta pdfs/{execId}.pdf', () => {
    expect(pathsPdfsExecucao(['e1', 'e2'])).toEqual(['pdfs/e1.pdf', 'pdfs/e2.pdf'])
  })
  it('vazio → vazio', () => {
    expect(pathsPdfsExecucao([])).toEqual([])
  })
})
