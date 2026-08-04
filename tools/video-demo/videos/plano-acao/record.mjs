// Vídeo Plano de Ação — listagem + peek na moderação. 7 cenas.
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

  // PREFLIGHT: confere que existem planos em aberto (N1/N2) pra cenas 1-5.
  await page.goto(`${BASE}/gestao/planos-acao`, { waitUntil: 'networkidle' })
  await wait(800)
  await limparResiduos(page)
  const totalCards = await page.evaluate(() => document.querySelectorAll('button.w-full.bg-white').length)
  if (totalCards < 2) throw new Error(`PREFLIGHT: só ${totalCards} plano(s) na demo — precisa de pelo menos 2`)
  console.log('  preflight OK — ' + totalCards + ' planos')

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))

  const player = criarPlayer(DUR, GAP_AFTER)
  player.iniciar()
  const offset = (Date.now() - tGravacao) / 1000
  console.log('OFFSET_CORTE=' + offset.toFixed(2))

  // ── Cena 1 — panorama ──
  await player.encena(1, async () => {
    // setup cena 2: pequeno scroll pra "andar" na lista
    await tryDo('scroll c2', async () => { await page.evaluate(() => window.scrollBy({ top: 40, behavior: 'smooth' })) })
  })

  // ── Cena 2 — notificação em tempo real (fala; visualmente foco em plano recém-aberto) ──
  await player.encena(2, async () => {
    // setup cena 3: pequeno scroll pra outro card
    await tryDo('scroll c3', async () => { await page.evaluate(() => window.scrollBy({ top: 80, behavior: 'smooth' })) })
  })

  // ── Cena 3 — anatomia do card ──
  await player.encena(3, async () => {
    // setup cena 4: volta ao topo pra clicar nos chips
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    await wait(300)
  })

  // ── Cena 4 — clica nos chips de status em sequência DURANTE a fala ──
  await player.encena(4,
    async () => { /* setup cena 5 é só mudar foco — nada a fazer */ },
    async () => {
      const chips = ['Moderação N1', 'Moderação N2', 'Corrigidos', 'Não corrigidos', 'Abertos']
      const step = player.duracaoCenaMs(4) / (chips.length + 1)
      await wait(step)
      for (const nome of chips) {
        await tryDo(`chip ${nome}`, async () => { await page.getByRole('button', { name: nome, exact: true }).click({ timeout: 1500 }) })
        await wait(step)
      }
    })

  // ── Cena 5 — foco em N1/N2 (mesma tela) ──
  await player.encena(5, async () => {
    // setup cena 6: clica no primeiro plano (abre detalhe/moderação)
    await tryDo('open plano', async () => {
      const btn = page.locator('button.w-full.bg-white').first()
      await btn.click({ timeout: 3000 })
    })
    await page.waitForLoadState('networkidle').catch(() => {})
    await limparResiduos(page)
  })

  // ── Cena 6 — tela de moderação (com causa raiz visível) ──
  await player.encena(6, async () => {
    // setup cena 7: volta pra listagem
    await tryDo('back planos', async () => { await page.goto(`${BASE}/gestao/planos-acao`, { waitUntil: 'networkidle' }) })
    await limparResiduos(page)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  })

  // ── Cena 7 — recap ──
  await player.encena(7, null)

  await context.close()
  await browser.close()

  console.log('→ montando…')
  const output = path.resolve(__dirname, '..', '..', 'output', 'plano-acao.mp4')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  await montar({ dir: __dirname, offset, DUR, GAP_AFTER, output })
}

await main()
