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
 * Escolhe o vídeo da tela atual: casa a rota exata e, na falta dela, o
 * prefixo MAIS específico (mesma regra das sugestões do assistente), para
 * `/gestao/checklists/123` herdar o vídeo de `/gestao/checklists`.
 */
export function resolverVideoDaRota<T extends { rota: string }>(
  pathname: string | null | undefined,
  videos: T[],
): T | null {
  if (!pathname || !videos?.length) return null
  const atual = normalizarRota(pathname)
  const candidatos = videos.filter(v => {
    const rota = normalizarRota(v.rota)
    return atual === rota || (rota !== '/' && atual.startsWith(rota + '/'))
  })
  if (!candidatos.length) return null
  return candidatos.sort((a, b) => normalizarRota(b.rota).length - normalizarRota(a.rota).length)[0]
}
