// Vídeo Checklist — listagem. 6 cenas:
//  1 panorama · 2 anatomia linha · 3 filtros/busca · 4 3 caminhos de criar · 5 menu do item · 6 recap
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
  console.log('→ gerando narrações…')
  const durs = await gerarNarracoes(path.join(__dirname, 'audio'), TEXTOS)
  const DUR = durs.slice(1)
  console.log('  DUR:', DUR.map(d => d.toFixed(2)).join(', '))

  if (!fs.existsSync(path.join(__dirname, 'intro.png'))) {
    console.log('→ gerando cartelas…')
    await gerarCartelas(__dirname, { titulo: TITULO })
  }

  console.log('→ gravando…')
  fs.rmSync(path.join(__dirname, 'video'), { recursive: true, force: true })
  fs.mkdirSync(path.join(__dirname, 'video'))
  const browser = await chromium.launch()
  const context = await novoContextGravando(browser, path.join(__dirname, 'video'))
  const page = await context.newPage()
  const tGravacao = Date.now()

  await loginEmpresaDemo(page)

  // PREFLIGHT: confere que existe pelo menos 1 checklist publicado (a Empresa Demo tem 5).
  await page.goto(`${BASE}/gestao/checklists`, { waitUntil: 'networkidle' })
  await wait(600)
  await limparResiduos(page)
  const total = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href^="/gestao/checklists/"]')]
      .filter(a => !a.href.includes('/novo') && !a.href.includes('/modelos'))
    return links.length
  })
  if (total < 3) throw new Error(`PREFLIGHT: só ${total} checklist(s) na demo — precisa de pelo menos 3`)
  console.log('  preflight OK — ' + total + ' checklists')

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))

  const player = criarPlayer(DUR, GAP_AFTER)
  player.iniciar()
  const offset = (Date.now() - tGravacao) / 1000
  console.log('OFFSET_CORTE=' + offset.toFixed(2))

  // ── Cena 1 — panorama da lista ──
  await player.encena(1, async () => {
    // setup cena 2: pequeno scroll pra "percorrer"
    await tryDo('scroll c2', async () => { await page.evaluate(() => window.scrollBy({ top: 40, behavior: 'smooth' })) })
  })

  // ── Cena 2 — anatomia de uma linha (mesma tela) ──
  await player.encena(2, async () => {
    // setup cena 3: clica no chip "Publicado" pra mostrar filtro funcionando
    await tryDo('filtro pub', async () => {
      await page.getByRole('button', { name: /^Publicado$/ }).click({ timeout: 2000 })
    })
    await wait(300)
  })

  // ── Cena 3 — filtro + busca ──
  await player.encena(3, async () => {
    // setup cena 4: limpa filtros/busca pra tela voltar cheia, foco nos botões do topo
    await tryDo('todos', async () => { await page.getByRole('button', { name: /^Todos$/ }).click({ timeout: 2000 }) })
    await tryDo('limpa busca', async () => { await page.getByPlaceholder('Buscar checklist').fill('') })
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  })

  // ── Cena 4 — 3 caminhos de criar (Gerar IA / Usar um modelo / Novo — botões no topo) ──
  await player.encena(4, async () => {
    // setup cena 5: abre o menu ... do primeiro item
    await tryDo('menu item', async () => {
      // primeiro botão MoreVertical (por não ter aria-label específico, pega pelo path lucide)
      const btn = page.locator('button:has(svg.lucide-more-vertical), button:has(svg.lucide-ellipsis-vertical)').first()
      await btn.click({ timeout: 3000 })
    })
  })

  // ── Cena 5 — menu do item aberto ──
  await player.encena(5, async () => {
    // setup cena 6: fecha o menu (click fora) e volta ao topo
    await tryDo('close menu', async () => { await page.mouse.click(10, 10) })
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  })

  // ── Cena 6 — recap ──
  await player.encena(6, null)

  await context.close()
  await browser.close()

  console.log('→ montando…')
  const output = path.resolve(__dirname, '..', '..', 'output', 'checklist.mp4')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  await montar({ dir: __dirname, offset, DUR, GAP_AFTER, output })
}

await main()
