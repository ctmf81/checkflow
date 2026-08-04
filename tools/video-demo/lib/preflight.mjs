// Verificações prévias sobre o estado da demo antes de gravar. Cada helper
// devolve o "alvo" que a cena precisa (href, índice de card, id de user, …) ou
// lança um erro descritivo caso o dado não exista — bloqueia a gravação antes
// de a cena aparecer vazia no vídeo.
import { BASE } from './config.mjs'
import { wait } from './record-helpers.mjs'

// Devolve { grupoHref, subgrupoIdx } onde subgrupoIdx tem >0 checklists.
// Passa por todos os grupos até achar — dá preferência ao 1º que tem.
export async function acharGrupoComSubgrupoComChecklist(page) {
  await page.goto(`${BASE}/gestao/grupos`, { waitUntil: 'networkidle' })
  await wait(400)
  const links = await page.locator('a[href*="/gestao/grupos/"][href*="/subgrupos"]').evaluateAll(as => as.map(a => a.getAttribute('href')))
  for (const href of links) {
    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' })
    await wait(300)
    const idx = await page.evaluate(() => {
      const cards = document.querySelectorAll('.grid > div')
      for (let i = 0; i < cards.length; i++) {
        const spans = cards[i].querySelectorAll('span.text-orange-500.font-bold')
        for (const s of spans) if (parseInt(s.textContent || '0', 10) > 0) return i
      }
      return -1
    })
    if (idx >= 0) return { grupoHref: href, subgrupoIdx: idx }
  }
  throw new Error('PREFLIGHT: nenhum grupo tem subgrupo com checklist na demo. Rode o gerador de dados demo antes.')
}

// Remove 1 user do 1º grupo (pré-offset) pra o modal "Adicionar usuário" ter candidato.
// Usado no vídeo Grupos. Requer helper tryDo do record-helpers.
export async function removerUsuarioDoPrimeiroGrupo(page, tryDo) {
  await page.goto(`${BASE}/gestao/grupos`, { waitUntil: 'networkidle' })
  await wait(500)
  await tryDo('pré-gerenciar', async () => { await page.getByRole('button', { name: /Gerenciar usu/i }).first().click({ timeout: 3000 }) })
  await wait(700)
  await tryDo('pré-remover', async () => { await page.locator('button[title="Remover do grupo"]').first().click({ timeout: 3000 }) })
  await wait(600)
  await tryDo('pré-confirmar', async () => { await page.getByRole('button', { name: /^Remover$/ }).click({ timeout: 3000 }) })
  await wait(1200)
  await tryDo('pré-fechar', async () => { await page.getByRole('button', { name: /^Fechar$/ }).click({ timeout: 2000 }) })
  await wait(400)
}
