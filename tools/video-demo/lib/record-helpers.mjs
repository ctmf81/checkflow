// Utilitários pequenos: espera, tryDo, fecha onboardings residuais, player de cenas.
export const wait = (ms) => new Promise(r => setTimeout(r, ms))

export async function tryDo(label, fn) {
  try { await fn() } catch (e) {
    console.log(`  (pulado [${label}]:`, e.message.split('\n')[0], ')')
  }
}

// Fecha modais residuais de "Entendido!" (fallback caso o seed do onboarding falhe).
export async function limparResiduos(page) {
  for (let k = 0; k < 3; k++) {
    let fechou = false
    await tryDo('res-ent', async () => {
      await page.getByRole('button', { name: 'Entendido!' }).click({ timeout: 400 })
      fechou = true
    })
    if (!fechou) break
    await wait(150)
  }
}

// Player de cenas alinhado por deadline absoluto (não drifta).
//   const player = criarPlayer(DUR, GAP_AFTER)
//   player.iniciar()  // marca t0 (imediatamente antes da cena 1)
//   await player.encena(1, async () => { ... setup pra cena 2 ... })
// setupNext roda no GAP após a cena (troca de tela).
// duringCena (opcional) roda EM PARALELO com o wait da cena — pra ações
// visíveis durante a fala (ex.: clicar chips de filtro em sequência).
export function criarPlayer(DUR, GAP_AFTER) {
  const CENA_MS = DUR.map(d => d * 1000)
  const GAP_MS = GAP_AFTER.map(g => g * 1000)
  let deadline = 0
  return {
    iniciar() { deadline = Date.now() },
    duracaoCenaMs(n) { return CENA_MS[n - 1] },
    async encena(n, setupNext, duringCena) {
      deadline += CENA_MS[n - 1]
      const acao = duringCena ? duringCena().catch(e => console.log(`  (during cena ${n}:`, e.message.split('\n')[0], ')')) : null
      await wait(Math.max(0, deadline - Date.now()))
      if (acao) await acao
      deadline += GAP_MS[n - 1]
      if (setupNext) await setupNext()
      await wait(Math.max(0, deadline - Date.now()))
    },
  }
}
