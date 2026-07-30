// Testes da lógica pura do vídeo tutorial por tela (lib/ajudaVideos.ts):
// normalização da rota cadastrada, conversão do link em URL de embed e
// resolução do vídeo da tela atual.
import { describe, it, expect } from 'vitest'
import { normalizarRota, embedUrlVideo, resolverVideoDaRota } from '@/lib/ajudaVideos'

describe('normalizarRota', () => {
  it('aceita a URL completa colada do navegador', () => {
    expect(normalizarRota('https://app.checkflow.digital/gestao/checklists')).toBe('/gestao/checklists')
    expect(normalizarRota('http://localhost:3000/gestao/tickets')).toBe('/gestao/tickets')
  })
  it('tira barra final, query e hash', () => {
    expect(normalizarRota('/gestao/checklists/')).toBe('/gestao/checklists')
    expect(normalizarRota('/gestao/checklists?aba=1#topo')).toBe('/gestao/checklists')
  })
  it('adiciona a barra inicial', () => {
    expect(normalizarRota('gestao/tarefas')).toBe('/gestao/tarefas')
  })
  it('preserva a raiz e trata vazio', () => {
    expect(normalizarRota('/')).toBe('/')
    expect(normalizarRota('   ')).toBe('')
  })
})

describe('embedUrlVideo', () => {
  it('converte os formatos do YouTube', () => {
    const esperado = 'https://www.youtube.com/embed/dQw4w9WgXcQ'
    expect(embedUrlVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(esperado)
    expect(embedUrlVideo('https://www.youtube.com/watch?t=10&v=dQw4w9WgXcQ')).toBe(esperado)
    expect(embedUrlVideo('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe(esperado)
    expect(embedUrlVideo('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(esperado)
    expect(embedUrlVideo('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(esperado)
  })
  it('converte os formatos do Google Drive', () => {
    const esperado = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview'
    expect(embedUrlVideo('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing')).toBe(esperado)
    expect(embedUrlVideo('https://drive.google.com/open?id=1AbCdEfGhIjKlMn')).toBe(esperado)
    expect(embedUrlVideo('https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMn')).toBe(esperado)
  })
  it('link não reconhecido, vazio ou nulo → null', () => {
    expect(embedUrlVideo('https://vimeo.com/12345')).toBeNull()
    expect(embedUrlVideo('não é link')).toBeNull()
    expect(embedUrlVideo('')).toBeNull()
    expect(embedUrlVideo(null)).toBeNull()
  })
})

describe('resolverVideoDaRota', () => {
  const videos = [
    { rota: '/gestao/checklists', titulo: 'Checklists', url: 'https://youtu.be/dQw4w9WgXcQ' },
    { rota: '/gestao/checklists/novo', titulo: 'Novo checklist', url: 'https://youtu.be/aaaaaaaaaaa' },
    { rota: '/gestao/tickets/', titulo: null, url: 'https://youtu.be/bbbbbbbbbbb' },
  ]
  it('casa a rota exata', () => {
    expect(resolverVideoDaRota('/gestao/checklists', videos)?.titulo).toBe('Checklists')
  })
  it('prefere o prefixo mais específico', () => {
    expect(resolverVideoDaRota('/gestao/checklists/novo', videos)?.titulo).toBe('Novo checklist')
  })
  it('rota filha herda o vídeo do prefixo', () => {
    expect(resolverVideoDaRota('/gestao/checklists/abc-123', videos)?.titulo).toBe('Checklists')
  })
  it('normaliza os dois lados da comparação', () => {
    expect(resolverVideoDaRota('/gestao/tickets', videos)?.url).toBe('https://youtu.be/bbbbbbbbbbb')
  })
  it('não casa por prefixo parcial de segmento', () => {
    expect(resolverVideoDaRota('/gestao/checklists-antigos', videos)).toBeNull()
  })
  it('sem vídeo para a tela, lista vazia ou pathname nulo → null', () => {
    expect(resolverVideoDaRota('/gestao/plano', videos)).toBeNull()
    expect(resolverVideoDaRota('/gestao/plano', [])).toBeNull()
    expect(resolverVideoDaRota(null, videos)).toBeNull()
  })
})
