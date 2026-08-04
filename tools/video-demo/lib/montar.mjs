// Monta: intro (INTRO_DUR + c0) + main (cenas + gaps variáveis) + outro (silêncio).
// Espera a pasta do vídeo com: audio/c0..cN.mp3, video/*.webm, intro.png, outro.png.
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { INTRO_DUR, OUTRO_DUR } from './config.mjs'

export async function montar({ dir, offset, DUR, GAP_AFTER, output, introDur = INTRO_DUR, outroDur = OUTRO_DUR }) {
  const FFMPEG = (await import('ffmpeg-static')).default
  const run = (args) => execFileSync(FFMPEG, args, { cwd: dir, stdio: 'inherit' })

  const VID = 'video/' + fs.readdirSync(path.join(dir, 'video')).find(f => f.endsWith('.webm'))
  const N = DUR.length

  for (const g of [...new Set(GAP_AFTER)]) {
    run(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(g), '-q:a', '9', `audio/sil_${g}.mp3`])
  }
  run(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(outroDur), '-q:a', '9', 'audio/sil_outro.mp3'])

  const inputs = []; const labels = []; let idx = 0
  for (let n = 1; n <= N; n++) {
    inputs.push('-i', `audio/c${n}.mp3`); labels.push(`[${idx++}:a]`)
    inputs.push('-i', `audio/sil_${GAP_AFTER[n - 1]}.mp3`); labels.push(`[${idx++}:a]`)
  }
  run(['-y', ...inputs, '-filter_complex', `${labels.join('')}concat=n=${idx}:v=0:a=1[out]`, '-map', '[out]', 'audio/narracao_main.mp3'])

  run(['-y', '-ss', String(offset), '-i', VID, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-s', '1280x720', 'main_cut.mp4'])
  run(['-y', '-loop', '1', '-i', 'intro.png', '-i', 'audio/c0.mp3', '-t', String(introDur), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-s', '1280x720', '-c:a', 'aac', '-b:a', '160k', '-shortest', 'intro.mp4'])
  run(['-y', '-loop', '1', '-i', 'outro.png', '-i', 'audio/sil_outro.mp3', '-t', String(outroDur), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-s', '1280x720', '-c:a', 'aac', '-b:a', '160k', '-shortest', 'outro.mp4'])
  run(['-y', '-i', 'main_cut.mp4', '-i', 'audio/narracao_main.mp3', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', 'main.mp4'])

  fs.writeFileSync(path.join(dir, 'concat.txt'), "file 'intro.mp4'\nfile 'main.mp4'\nfile 'outro.mp4'\n")
  run(['-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', output])
  console.log('OK -> ' + output)
}
