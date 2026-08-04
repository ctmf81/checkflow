// Fluxo padrão: abre contexto com gravação + localStorage seeded, faz login
// como Vanessa da Empresa Demo, aceita o Termo, fecha onboardings residuais.
import { ONBOARDING_IDS } from './onboarding-ids.mjs'
import { wait, tryDo, limparResiduos } from './record-helpers.mjs'
import { BASE, EMPRESA_DEMO, VIEWPORT } from './config.mjs'

export async function novoContextGravando(browser, videoDir) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  })
  await context.addInitScript((ids) => {
    try { localStorage.setItem('checkflow_onboarding_visto', JSON.stringify(ids)) } catch {}
  }, ONBOARDING_IDS)
  return context
}

export async function loginEmpresaDemo(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await tryDo('login', async () => {
    await page.getByPlaceholder('Digite seu CPF').fill(EMPRESA_DEMO.cpf)
    await page.getByPlaceholder('Digite sua senha').fill(EMPRESA_DEMO.senha)
    await page.getByRole('button', { name: 'Login' }).click()
  })
  await wait(2500)
  await tryDo('empresa', async () => {
    await page.getByRole('button', { name: EMPRESA_DEMO.nome, exact: true }).click({ timeout: 5000 })
  })
  await page.waitForURL('**/gestao**', { timeout: 20000 }).catch(() => {})
  await wait(1500)
  await tryDo('termo', async () => {
    const aceite = page.getByRole('button', { name: /Li e aceito/i })
    await aceite.waitFor({ timeout: 5000 })
    for (let k = 0; k < 15; k++) {
      await page.evaluate(() => {
        const els = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))
        const alvo = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
        if (alvo) alvo.scrollTop = alvo.scrollHeight
      })
      await wait(150)
      if (await aceite.isEnabled().catch(() => false)) break
    }
    await aceite.click({ timeout: 3000 })
  })
  await wait(500)
  await limparResiduos(page)
}
