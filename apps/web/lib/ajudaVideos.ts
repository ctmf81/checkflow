// Lógica pura do vídeo tutorial por tela (tabela `ajuda_videos`).
// Usada pelo assistente de ajuda (ícone + modal) e pelo cadastro em
// /sistema/ajuda. Coberta por testes unitários.

export interface AjudaVideo {
  id?: string
  rota: string
  titulo: string | null
  url: string
  ordem?: number | null
}

/**
 * Normaliza a rota digitada pelo admin. Aceita a URL completa da página
 * (colada do navegador) ou só o caminho, com ou sem barra final.
 * `https://app.checkflow.digital/gestao/checklists/` → `/gestao/checklists`
 */
export function normalizarRota(entrada: string): string {
  let rota = (entrada ?? '').trim()
  if (!rota) return ''
  rota = rota.replace(/^https?:\/\/[^/]+/i, '')   // tira protocolo + host
  rota = rota.split('?')[0].split('#')[0]          // tira query e hash
  if (!rota.startsWith('/')) rota = '/' + rota
  if (rota.length > 1) rota = rota.replace(/\/+$/, '')
  return rota
}

/**
 * Converte o link cadastrado na URL de embed do player.
 * Suporta YouTube (watch, youtu.be, shorts, embed) e Google Drive
 * (`/file/d/<id>/view`, `open?id=`, `uc?id=`).
 * Retorna null quando o link não é reconhecido — aí o modal não abre.
 */
export function embedUrlVideo(url: string | null | undefined): string | null {
  const limpo = (url ?? '').trim()
  if (!limpo) return null

  const youtube =
    limpo.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i)
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`

  const drive =
    limpo.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([\w-]{10,})/i)
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`

  return null
}

/**
 * Um segmento da rota cadastrada casa com um segmento da URL atual quando
 * é igual OU é um coringa (`*` ou `[qualquerNome]`, no estilo Next.js).
 * Usado por `resolverVideoDaRota` pra suportar id no meio (ex.:
 * `/gestao/grupos/[id]/subgrupos` casa com `/gestao/grupos/abc-123/subgrupos`).
 */
function segmentoCasa(seg: string, atualSeg: string): boolean {
  return seg === atualSeg || seg === '*' || (seg.startsWith('[') && seg.endsWith(']'))
}

/** Conta segmentos coringa na rota (menos = mais específico no ranking). */
function contarCoringas(rota: string): number {
  return rota.split('/').filter(s => s === '*' || (s.startsWith('[') && s.endsWith(']'))).length
}

/**
 * Vídeos aplicáveis à tela atual — devolve APENAS os do nível de especificidade
 * mais alto que casa. Se a tela tem vídeos cadastrados exatamente pra ela (ou
 * pra um padrão com coringa), ancestrais não são misturados. Só quando não
 * existe nada específico é que a filha herda do prefixo mais próximo.
 *
 * Ex.: tela `/gestao/checklists/abc/montar` com vídeos cadastrados em
 * `/gestao/checklists/*​/montar` (Parte 1, Parte 2) e em `/gestao/checklists`
 * (Listagem) → devolve só Parte 1 + Parte 2 (o Listagem só apareceria em telas
 * sem vídeo específico).
 *
 * Vários vídeos no mesmo nível ficam ordenados por `ordem` asc, depois `titulo`.
 */
export function resolverVideosDaRota<T extends { rota: string; ordem?: number | null; titulo?: string | null }>(
  pathname: string | null | undefined,
  videos: T[],
): T[] {
  if (!pathname || !videos?.length) return []
  const atual = normalizarRota(pathname)
  const atualSegs = atual.split('/')
  const candidatos = videos.filter(v => {
    const rota = normalizarRota(v.rota)
    const rotaSegs = rota.split('/')
    if (rotaSegs.length > atualSegs.length) return false
    for (let i = 0; i < rotaSegs.length; i++) {
      if (!segmentoCasa(rotaSegs[i], atualSegs[i])) return false
    }
    return true
  })
  if (!candidatos.length) return []
  // Fica só com o nível mais específico: mais segmentos e, empate, menos coringas.
  const segs = (v: T) => normalizarRota(v.rota).split('/').length
  const cor = (v: T) => contarCoringas(normalizarRota(v.rota))
  const maxSegs = Math.max(...candidatos.map(segs))
  const nivel = candidatos.filter(v => segs(v) === maxSegs)
  const minCor = Math.min(...nivel.map(cor))
  const finalistas = nivel.filter(v => cor(v) === minCor)
  return finalistas.sort((a, b) => {
    const oa = a.ordem ?? 0, ob = b.ordem ?? 0
    if (oa !== ob) return oa - ob
    return (a.titulo ?? '').localeCompare(b.titulo ?? '')
  })
}

/** Vídeo único (o primeiro da lista) — compat com o assistente anterior. */
export function resolverVideoDaRota<T extends { rota: string; ordem?: number | null; titulo?: string | null }>(
  pathname: string | null | undefined,
  videos: T[],
): T | null {
  return resolverVideosDaRota(pathname, videos)[0] ?? null
}
