// Lógica pura da troca de logo da empresa (usada pela rota
// app/api/empresa/logo/route.ts e coberta por testes unitários).

/** Tipos aceitos no upload da logo. */
export const TIPOS_LOGO = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Limite de tamanho do arquivo da logo (2 MB). */
export const TAMANHO_MAX_LOGO = 2 * 1024 * 1024

/**
 * Valida o arquivo recebido no upload da logo. Retorna a mensagem de erro
 * (pronta para o usuário) ou null quando o arquivo é aceitável.
 */
export function validarArquivoLogo(arquivo: { type?: string; size?: number } | null | undefined): string | null {
  if (!arquivo) return 'Selecione um arquivo de imagem.'
  if (!arquivo.size) return 'Arquivo vazio.'
  if (!TIPOS_LOGO.includes((arquivo.type ?? '') as (typeof TIPOS_LOGO)[number])) {
    return 'Formato não aceito. Envie JPG, PNG ou WebP.'
  }
  if (arquivo.size > TAMANHO_MAX_LOGO) return 'Imagem muito grande. O limite é 2 MB.'
  return null
}

/**
 * Caminho do arquivo dentro do bucket `empresas`. Prefixo por empresa para a
 * exclusão da empresa poder varrer `logos/<empresaId>` de uma vez, e timestamp
 * para não depender de cache-busting na URL pública.
 */
export function caminhoLogo(empresaId: string, agora: number = Date.now()): string {
  return `logos/${empresaId}/${agora}.jpg`
}
