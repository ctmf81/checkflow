// Gera intro.png (logo + título) e outro.png (só logo) a 1280x720.
// Usa Playwright rasterizando um HTML com a logo em base64.
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PADRAO = path.resolve(__dirname, '../assets/logo.png')

export async function gerarCartelas(saveDir, { titulo, logoPath = LOGO_PADRAO }) {
  const logoB64 = fs.readFileSync(logoPath).toString('base64')
  const logoSrc = `data:image/png;base64,${logoB64}`
  const html = (mostrarTitulo) => `<!doctype html><html><head><style>
    html,body{margin:0;height:100%;background:#fff;font-family:'Segoe UI',Arial,sans-serif}
    .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px}
    img{width:480px;height:auto}
    h1{font-size:56px;color:#334155;font-weight:400;margin:0;letter-spacing:1px}
  </style></head><body>
    <div class="wrap"><img src="${logoSrc}" />${mostrarTitulo ? `<h1>${titulo}</h1>` : ''}</div>
  </body></html>`
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  for (const [nome, mostrar] of [['intro', true], ['outro', false]]) {
    const page = await ctx.newPage()
    await page.setContent(html(mostrar), { waitUntil: 'load' })
    await page.screenshot({ path: path.join(saveDir, `${nome}.png`), fullPage: false })
    await page.close()
  }
  await browser.close()
}
