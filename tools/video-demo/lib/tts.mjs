// Gera N áudios via edge-tts (voz Francisca) e devolve as durações em segundos.
// Cria a pasta se não existir. c0.mp3 = intro (título), c1..cN = cenas.
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { VOZ } from './config.mjs'

// Mapa de grafias foneticamente ajustadas para a voz Francisca (pt-BR) — a TTS
// lê letra por letra em português; palavras estrangeiras/técnicas ficam ruins
// sem esse ajuste. Adicione aqui quando descobrir palavras com pronúncia ruim.
//   ORIGEM (regex, case-insensitive) → SUBSTITUIÇÃO (como deve ser escrito pra TTS)
const FONETICA = [
  [/\bchecklists\b/gi, 'tchéc lists'],
  [/\bchecklist\b/gi, 'tchéc list'],
  [/\bsubgrupos\b/gi, 'sub grupos'],
  [/\bsubgrupo\b/gi, 'sub grupo'],
]

export function ajustarFonetica(texto) {
  let out = texto
  for (const [re, rep] of FONETICA) out = out.replace(re, rep)
  return out
}

// Opções: { voice, rate } — override por vídeo. Ex: { voice: 'pt-BR-ThalitaNeural' }.
export async function gerarNarracoes(saveDir, textos, opts = {}) {
  fs.mkdirSync(saveDir, { recursive: true })
  const voice = opts.voice ?? VOZ.voice
  const rate = opts.rate ?? VOZ.rate
  for (let i = 0; i < textos.length; i++) {
    execFileSync('python', [
      '-m', 'edge_tts',
      '--voice', voice,
      `--rate=${rate}`,
      '--text', ajustarFonetica(textos[i]),
      '--write-media', path.join(saveDir, `c${i}.mp3`),
    ], { stdio: 'inherit' })
  }
  return await Promise.all(textos.map((_, i) => duracao(path.join(saveDir, `c${i}.mp3`))))
}

export async function duracao(mp3Path) {
  const ffprobe = (await import('ffprobe-static')).default
  const out = execFileSync(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3Path])
  return parseFloat(out.toString().trim())
}
