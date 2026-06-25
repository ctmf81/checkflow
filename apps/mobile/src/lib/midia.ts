// Utilidades para processamento de mídia
// Compressão de imagens, validação de vídeo, etc

import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'

const MAX_FOTO_PX = 1600 // max dimension
const FOTO_QUALIDADE = 0.8 // JPEG quality
const MAX_VIDEO_SEG = 10
const MAX_VIDEO_MB = 50

/**
 * Comprime imagem para max 1600px e JPEG 0.8
 * Retorna { uri, file }
 */
export async function comprimirImagem(uri: string): Promise<{ uri: string; file: Blob }> {
  try {
    // Lê arquivo original
    const fileInfo = await FileSystem.getInfoAsync(uri)
    if (!fileInfo.exists) throw new Error('Arquivo não encontrado')

    // Manipula imagem (redimensiona)
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_FOTO_PX, height: MAX_FOTO_PX } }],
      { compress: FOTO_QUALIDADE, format: ImageManipulator.SaveFormat.JPEG }
    )

    // Lê como Blob
    const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: FileSystem.EncodingType.Base64
    })
    const blob = base64ToBlob(base64, 'image/jpeg')

    return { uri: manipulated.uri, file: blob }
  } catch (error) {
    console.error('Erro ao comprimir:', error)
    throw error
  }
}

/**
 * Valida duração de vídeo (máx 10s)
 */
export async function validarDuracaoVideo(uri: string): Promise<{ valido: boolean; duracao: number }> {
  try {
    // Expo não tem acesso nativo ao duration facilmente
    // Alternativa: usar react-native-video-processing ou similar
    // Por enquanto, validar via lastModified (heurística fraca)
    const file = await FileSystem.getInfoAsync(uri)
    const estmadoDuracao = file.size ? file.size / (1.5 * 1024 * 1024) : 0 // ~1.5Mbps
    return {
      valido: estmadoDuracao <= MAX_VIDEO_SEG,
      duracao: estmadoDuracao
    }
  } catch (error) {
    console.error('Erro ao validar vídeo:', error)
    return { valido: false, duracao: 0 }
  }
}

/**
 * Converte base64 para Blob (compatível com upload)
 */
function base64ToBlob(base64: string, type: string): Blob {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Blob([bytes], { type })
}

/**
 * Calcula tamanho total de mídias (para validar quota)
 */
export async function calcularTamanhomidias(
  fotos: Array<{ uri?: string; file?: Blob }>,
  videos: Array<{ uri?: string; file?: Blob }>
): Promise<number> {
  let total = 0

  for (const m of [...fotos, ...videos]) {
    if (m.file) {
      total += m.file.size
    } else if (m.uri) {
      try {
        const info = await FileSystem.getInfoAsync(m.uri)
        if (info.size) total += info.size
      } catch (e) {
        console.warn('Não conseguimos medir:', m.uri)
      }
    }
  }

  return total
}
