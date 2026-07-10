// Gera o conjunto de ícones do PWA/sistema a partir de public/icon-source.png.
// Requer: npm i -D sharp png-to-ico   (rodar de apps/web)
// Uso:    node _gen_icons.mjs
//
// - icon-192 / icon-512      → "any": logo com fundo TRANSPARENTE
// - icon-maskable-512        → fundo BRANCO + zona segura (~78% central, p/ Android)
// - apple-touch-icon (180)   → fundo BRANCO (iOS não gosta de transparência)
// - app/icon.png + favicon   → fundo BRANCO (aba do navegador)

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const PUB = join(process.cwd(), 'public')
const APP = join(process.cwd(), 'app')
const SRC = join(PUB, 'icon-source.png')
const BRANCO = { r: 255, g: 255, b: 255, alpha: 1 }

// logo redimensionado (contain) num quadrado de `size`, opcional fundo + padding.
async function quadrado(size, { bg = null, escala = 1 } = {}) {
  const alvo = Math.round(size * escala)
  const logo = await sharp(SRC).resize(alvo, alvo, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  let base = sharp({ create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
  return base.composite([{ input: logo, gravity: 'center' }]).png().toBuffer()
}

async function main() {
  await sharp(SRC).metadata() // valida que o arquivo existe/é imagem

  // "any" — transparente
  await writeFile(join(PUB, 'icon-192.png'), await quadrado(192))
  await writeFile(join(PUB, 'icon-512.png'), await quadrado(512))
  // maskable — branco + zona segura
  await writeFile(join(PUB, 'icon-maskable-512.png'), await quadrado(512, { bg: BRANCO, escala: 0.78 }))
  // apple touch — branco
  await writeFile(join(PUB, 'apple-touch-icon.png'), await quadrado(180, { bg: BRANCO, escala: 0.88 }))
  // favicon — app/icon.png (Next serve como /icon) + favicon.ico (16/32/48)
  await writeFile(join(APP, 'icon.png'), await quadrado(512, { bg: BRANCO, escala: 0.9 }))
  const icoBufs = await Promise.all([16, 32, 48].map(s => quadrado(s, { bg: BRANCO, escala: 0.9 })))
  await writeFile(join(APP, 'favicon.ico'), await pngToIco(icoBufs))

  console.log('OK — ícones gerados: icon-192/512, icon-maskable-512, apple-touch-icon, app/icon.png, app/favicon.ico')
}
main().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
