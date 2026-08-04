// Lógica pura do vídeo tutorial por tela (tabela `ajuda_videos`).
// Usada pelo assistente de ajuda (ícone + modal) e pelo cadastro em
// /sistema/ajuda. Coberta por testes unitários.

export interface AjudaVideo {
  id?: string
  rota: string
  titulo: string | null
  url: string
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
 * Escolhe o vídeo da tela atual. Casa rota exata, prefixo, ou padrão com
 * coringas `*` / `[nome]` no lugar de ids (ex.: `/gestao/grupos/[id]/subgrupos`).
 * Ranking: rota mais longa vence; empate, quem tem menos coringas vence.
 * Assim `/gestao/checklists/[id]` cede lugar pra `/gestao/checklists/novo`
 * quando o URL é exatamente esse.
 */
export function resolverVideoDaRota<T extends { rota: string }>(
  pathname: string | null | undefined,
  videos: T[],
): T | null {
  if (!pathname || !videos?.length) return null
  const atual = normalizarRota(pathname)
  const atualSegs = atual.split('/')
  const candidatos = videos.filter(v => {
    const rota = normalizarRota(v.rota)
    const rotaSegs = rota.split('/')
    if (rotaSegs.length > atualSegs.length) return false
    // todos os segmentos da rota precisam casar com os da URL na mesma posição;
    // se rota é mais curta, os segmentos extras da URL viram "filha herdando".
    for (let i = 0; i < rotaSegs.length; i++) {
      if (!segmentoCasa(rotaSegs[i], atualSegs[i])) return false
    }
    return true
  })
  if (!candidatos.length) return null
  return candidatos.sort((a, b) => {
    const ra = normalizarRota(a.rota), rb = normalizarRota(b.rota)
    const sa = ra.split('/').length, sb = rb.split('/').length
    if (sa !== sb) return sb - sa                        // mais segmentos = mais específico
    return contarCoringas(ra) - contarCoringas(rb)       // desempate: menos coringas vence
  })[0]
}
