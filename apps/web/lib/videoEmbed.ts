// Resolve um link de vídeo (YouTube ou Google Drive público) para a URL de
// incorporação (iframe). Usado nas etapas de documentos (montagem e operação).
// Aceita também o ID puro de 11 caracteres do YouTube (formato legado salvo
// antes do suporte a URL/Drive).

export function videoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null

  // YouTube — URL em qualquer formato
  const yt = v.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`

  // Google Drive — arquivo público (file/d/ID, open?id=ID, uc?id=ID)
  const gd = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([A-Za-z0-9_-]+)/)
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`

  // Legado: ID puro do YouTube (11 chars)
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return `https://www.youtube.com/embed/${v}`

  return null
}

/** Provedor detectado (para rótulo/UX); null se não reconhecido. */
export function videoProvedor(raw: string | null | undefined): 'youtube' | 'drive' | null {
  const url = videoEmbedUrl(raw)
  if (!url) return null
  return url.includes('drive.google.com') ? 'drive' : 'youtube'
}
