// Template pra vídeo novo. Copie a pasta _template pra videos/<nome>/ e adapte:
//   1) cenas.mjs — TITULO + textos + gaps
//   2) as chamadas de player.encena() abaixo, com o setup específico da próxima cena
//   3) preflight opcional (importe de ../../lib/preflight.mjs)
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { gerarNarracoes } from '../../lib/tts.mjs'
import { gerarCartelas } from '../../lib/cartelas.mjs'
import { montar } from '../../lib/montar.mjs'
import { novoContextGravando, loginEmpresaDemo } from '../../lib/login.mjs'
import { wait, tryDo, limparResiduos, criarPlayer } from '../../lib/record-helpers.mjs'
import { BASE } from '../../lib/config.mjs'
import { TITULO, TEXTOS, GAP_AFTER } from './cenas.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  // 1) Áudios (idempotente — regera se roteiro mudar)
  console.log('→ gerando narrações…')
  const durs = await gerarNarracoes(path.join(__dirname, 'audio'), TEXTOS)
  const DUR = durs.slice(1) // c1..cN
  console.log('  DUR:', DUR.map(d => d.toFixed(2)).join(', '))

  // 2) Cartelas intro/outro (só se não existirem)
  if (!fs.existsSync(path.join(__dirname, 'intro.png'))) {
    console.log('→ gerando cartelas…')
    await gerarCartelas(__dirname, { titulo: TITULO })
  }

  // 3) Gravação
  console.log('→ gravando…')
  fs.rmSync(path.join(__dirname, 'video'), { recursive: true, force: true })
  fs.mkdirSync(path.join(__dirname, 'video'))
  const browser = await chromium.launch()
  const context = await novoContextGravando(browser, path.join(__dirname, 'video'))
  const page = await context.newPage()
  const tGravacao = Date.now()  // t0 da gravação — cortamos tudo antes do offset

  await loginEmpresaDemo(page)

  // ── PREFLIGHT (opcional): valida dados que as cenas exigem ──
  // const { grupoHref } = await acharGrupoComSubgrupoComChecklist(page)

  // ── PREPARA CENA 1 ──
  await page.goto(`${BASE}/gestao/…`, { waitUntil: 'networkidle' })
  await wait(500)
  await limparResiduos(page)

  const player = criarPlayer(DUR, GAP_AFTER)
  player.iniciar()
  const offset = (Date.now() - tGravacao) / 1000
  console.log('OFFSET_CORTE=' + offset.toFixed(2))

  await player.encena(1, async () => { /* setup cena 2 */ })
  await player.encena(2, async () => { /* setup cena 3 */ })
  // …
  await player.encena(TEXTOS.length - 1, null)

  await context.close()
  await browser.close()

  // 4) Monta o mp4 final
  console.log('→ montando…')
  const output = path.resolve(__dirname, '..', '..', 'output', `${TITULO.toLowerCase().replace(/\W+/g, '-')}.mp4`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  await montar({ dir: __dirname, offset, DUR, GAP_AFTER, output })
}

await main()
