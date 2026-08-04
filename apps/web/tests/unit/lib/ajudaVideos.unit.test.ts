// Testes da lógica pura do vídeo tutorial por tela (lib/ajudaVideos.ts):
// normalização da rota cadastrada, conversão do link em URL de embed e
// resolução do vídeo da tela atual.
import { describe, it, expect } from 'vitest'
import { normalizarRota, embedUrlVideo, resolverVideoDaRota, resolverVideosDaRota } from '@/lib/ajudaVideos'

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

  describe('coringa no meio da rota (id dinâmico)', () => {
    const comCoringa = [
      { rota: '/gestao/grupos', titulo: 'Grupos', url: 'https://youtu.be/g1' },
      { rota: '/gestao/grupos/[id]/subgrupos', titulo: 'Subgrupos', url: 'https://youtu.be/s1' },
      { rota: '/gestao/checklists/*/execucoes', titulo: 'Execuções', url: 'https://youtu.be/e1' },
    ]
    it('[id] casa segmento arbitrário no meio', () => {
      expect(resolverVideoDaRota('/gestao/grupos/abc-123/subgrupos', comCoringa)?.titulo).toBe('Subgrupos')
    })
    it('* também funciona como coringa', () => {
      expect(resolverVideoDaRota('/gestao/checklists/999/execucoes', comCoringa)?.titulo).toBe('Execuções')
    })
    it('a rota com [id] deve continuar cobrindo suas filhas por herança', () => {
      expect(resolverVideoDaRota('/gestao/grupos/abc-123/subgrupos/qualquer', comCoringa)?.titulo).toBe('Subgrupos')
    })
    it('sem match no padrão de coringa cai pro prefixo mais raso', () => {
      // /gestao/grupos/123 (sem /subgrupos) não bate o padrão com [id]/subgrupos —
      // herda de /gestao/grupos
      expect(resolverVideoDaRota('/gestao/grupos/abc-123', comCoringa)?.titulo).toBe('Grupos')
    })
    it('rota exata (sem coringa) vence rota com coringa no ranking', () => {
      const mix = [
        { rota: '/gestao/grupos/[id]/subgrupos', titulo: 'genérico', url: 'https://youtu.be/x' },
        { rota: '/gestao/grupos/abc/subgrupos', titulo: 'específico', url: 'https://youtu.be/y' },
      ]
      expect(resolverVideoDaRota('/gestao/grupos/abc/subgrupos', mix)?.titulo).toBe('específico')
    })
  })
})

describe('resolverVideosDaRota (múltiplos vídeos por tela)', () => {
  const videos = [
    { rota: '/gestao/checklists/novo/montar', titulo: 'Fluxo geral', url: 'https://youtu.be/a', ordem: 0 },
    { rota: '/gestao/checklists/novo/montar', titulo: 'Tipos de campo', url: 'https://youtu.be/b', ordem: 1 },
    { rota: '/gestao/checklists/novo/montar', titulo: 'Opções de cada campo', url: 'https://youtu.be/c', ordem: 2 },
    { rota: '/gestao/checklists', titulo: 'Listagem', url: 'https://youtu.be/d', ordem: 0 },
  ]
  it('devolve todos os vídeos da rota, ordenados por ordem asc', () => {
    const lista = resolverVideosDaRota('/gestao/checklists/novo/montar', videos)
    expect(lista.map(v => v.titulo)).toEqual(['Fluxo geral', 'Tipos de campo', 'Opções de cada campo', 'Listagem'])
  })
  it('rota mais específica vem antes da herdada, mesmo empatando em ordem', () => {
    const lista = resolverVideosDaRota('/gestao/checklists/novo/montar', videos)
    expect(lista[0].titulo).toBe('Fluxo geral')
    expect(lista.at(-1)?.titulo).toBe('Listagem')
  })
  it('sem videos → array vazio', () => {
    expect(resolverVideosDaRota('/gestao/plano', videos)).toEqual([])
    expect(resolverVideosDaRota(null, videos)).toEqual([])
  })
  it('resolverVideoDaRota (singular) devolve o primeiro da lista', () => {
    expect(resolverVideoDaRota('/gestao/checklists/novo/montar', videos)?.titulo).toBe('Fluxo geral')
  })
  it('desempata por título quando ordem é igual (fallback)', () => {
    const iguais = [
      { rota: '/x', titulo: 'Beta', url: 'https://youtu.be/b', ordem: 0 },
      { rota: '/x', titulo: 'Alfa', url: 'https://youtu.be/a', ordem: 0 },
    ]
    expect(resolverVideosDaRota('/x', iguais).map(v => v.titulo)).toEqual(['Alfa', 'Beta'])
  })
})
