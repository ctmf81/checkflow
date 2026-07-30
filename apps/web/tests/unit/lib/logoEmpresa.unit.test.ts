// Testes da lógica pura da troca de logo da empresa (lib/logoEmpresa.ts):
// validação do arquivo enviado e montagem do caminho no bucket.
import { describe, it, expect } from 'vitest'
import { validarArquivoLogo, caminhoLogo, TAMANHO_MAX_LOGO } from '@/lib/logoEmpresa'

describe('validarArquivoLogo', () => {
  it('aceita JPG, PNG e WebP dentro do limite', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validarArquivoLogo({ type, size: 1024 })).toBeNull()
    }
  })
  it('recusa formato não suportado', () => {
    expect(validarArquivoLogo({ type: 'image/gif', size: 1024 }))
      .toBe('Formato não aceito. Envie JPG, PNG ou WebP.')
    expect(validarArquivoLogo({ type: 'application/pdf', size: 1024 }))
      .toBe('Formato não aceito. Envie JPG, PNG ou WebP.')
  })
  it('recusa arquivo sem tipo', () => {
    expect(validarArquivoLogo({ size: 1024 })).not.toBeNull()
  })
  it('recusa acima de 2 MB e aceita exatamente 2 MB', () => {
    expect(validarArquivoLogo({ type: 'image/png', size: TAMANHO_MAX_LOGO + 1 }))
      .toBe('Imagem muito grande. O limite é 2 MB.')
    expect(validarArquivoLogo({ type: 'image/png', size: TAMANHO_MAX_LOGO })).toBeNull()
  })
  it('recusa arquivo vazio, null e undefined', () => {
    expect(validarArquivoLogo({ type: 'image/png', size: 0 })).toBe('Arquivo vazio.')
    expect(validarArquivoLogo(null)).toBe('Selecione um arquivo de imagem.')
    expect(validarArquivoLogo(undefined)).toBe('Selecione um arquivo de imagem.')
  })
})

describe('caminhoLogo', () => {
  it('monta o caminho com prefixo da empresa e timestamp', () => {
    expect(caminhoLogo('emp-1', 1700000000000)).toBe('logos/emp-1/1700000000000.jpg')
  })
  it('caminhos de instantes diferentes não colidem', () => {
    expect(caminhoLogo('emp-1', 1)).not.toBe(caminhoLogo('emp-1', 2))
  })
})
