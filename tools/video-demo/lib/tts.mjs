// Gera N áudios via edge-tts (voz Francisca) e devolve as durações em segundos.
// Cria a pasta se não existir. c0.mp3 = intro (título), c1..cN = cenas.
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { VOZ } from './config.mjs'

export async function gerarNarracoes(saveDir, textos) {
  fs.mkdirSync(saveDir, { recursive: true })
  for (let i = 0; i < textos.length; i++) {
    execFileSync('python', [
      '-m', 'edge_tts',
      '--voice', VOZ.voice,
      `--rate=${VOZ.rate}`,
      '--text', textos[i],
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
