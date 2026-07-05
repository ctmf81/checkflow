// Limites de tamanho para evidências (foto/vídeo) enviadas em tickets,
// execuções e planos. Valida no cliente para falhar na hora, com mensagem
// clara, em vez de esperar o upload estourar o teto do Storage.

export const MAX_FOTO_MB = 10
export const MAX_VIDEO_MB = 50

function mb(bytes: number) {
  return bytes / (1024 * 1024)
}

/**
 * Separa arquivos válidos dos que excedem o limite (foto vs vídeo).
 * Retorna a lista aceita e uma mensagem de erro (ou null) para os rejeitados.
 */
export function validarMidia(files: File[]): { validos: File[]; erro: string | null } {
  const validos: File[] = []
  const rejeitados: string[] = []
  for (const f of files) {
    const ehVideo = f.type.startsWith('video')
    const limite = ehVideo ? MAX_VIDEO_MB : MAX_FOTO_MB
    if (mb(f.size) > limite) rejeitados.push(`${f.name} (${mb(f.size).toFixed(1)} MB)`)
    else validos.push(f)
  }
  const erro = rejeitados.length
    ? `Arquivo grande demais (limite ${MAX_FOTO_MB} MB por foto, ${MAX_VIDEO_MB} MB por vídeo): ${rejeitados.join(', ')}`
    : null
  return { validos, erro }
}
