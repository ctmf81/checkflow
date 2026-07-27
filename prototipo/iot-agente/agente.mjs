// ── AGENTE (protótipo) ───────────────────────────────────────────────────────
// Roda na REDE LOCAL do cliente (aqui, na sua máquina, pra testar). Faz a ponte:
// só conexões de SAÍDA — pergunta o que coletar, coleta no momento, e sobe.
// NÃO é a feature; é o spike pra provar que o conceito funciona.
//
// Loop:
//   1. GET /iot/pendencias  → o que coletar agora?
//   2. Para cada pendência: CAPTURA no momento (câmera → snapshot; sensor → valor)
//   3. POST /iot/leitura     → entrega, amarrado à solicitação
//
// Config por variáveis de ambiente (todas opcionais):
//   NUVEM        (default http://localhost:4000)  — o receptor
//   SNAPSHOT_URL — URL de snapshot da SUA câmera IP (ex.: http://user:senha@192.168.0.50/snapshot.jpg)
//                  Sem ela, gera uma "foto" sintética com o horário (prova o momento).
//   SENSOR_URL   — URL/endpoint local que devolve um número (ex.: um sensor HTTP).
//                  Sem ela, gera uma temperatura fake.
//   UMA_VEZ=1    — roda um ciclo só e sai (pro teste). Sem isso, fica em loop.

const NUVEM = process.env.NUVEM || 'http://localhost:4000'
const TOKEN = 'demo-token-123'
const H = { 'x-device-token': TOKEN, 'Content-Type': 'application/json' }
const agora = () => new Date().toISOString()

// CAPTURA de imagem: tenta a câmera real; senão, sintetiza uma "foto" cujo
// conteúdo é o horário — assim dá pra PROVAR que é do momento (depois do disparo).
async function capturarImagem() {
  if (process.env.SNAPSHOT_URL) {
    const r = await fetch(process.env.SNAPSHOT_URL)          // ← aqui o agente alcança a câmera na rede local
    const buf = Buffer.from(await r.arrayBuffer())
    console.log(`  📸 câmera real: ${buf.length}B de ${process.env.SNAPSHOT_URL}`)
    return { imagem_b64: buf.toString('base64') }
  }
  const fake = Buffer.from(`FOTO-SINTETICA capturada em ${agora()}`)
  console.log(`  📸 (sem câmera real) foto sintética marcada com o horário`)
  return { imagem_b64: fake.toString('base64') }
}

// CAPTURA de sensor: tenta um endpoint local; senão, gera um número.
async function capturarSensor() {
  if (process.env.SENSOR_URL) {
    const r = await fetch(process.env.SENSOR_URL)
    const valor = Number((await r.text()).trim())
    console.log(`  🌡️  sensor real: ${valor}`)
    return { valor }
  }
  const valor = +(2 + Math.random() * 6).toFixed(1)          // fake: 2.0–8.0 °C
  console.log(`  🌡️  (sem sensor real) valor fake: ${valor}°C`)
  return { valor }
}

async function umCiclo() {
  const r = await fetch(`${NUVEM}/iot/pendencias`, { headers: H })
  if (!r.ok) { console.log('  (erro ao consultar pendências)', r.status); return 0 }
  const { pendencias } = await r.json()
  if (!pendencias.length) { console.log('… nada pendente'); return 0 }

  for (const p of pendencias) {
    console.log(`▶ coletando ${p.id} (${p.tipo}) — capturando AGORA…`)
    const dados = p.tipo === 'camera' ? await capturarImagem() : await capturarSensor()
    const body = JSON.stringify({ solicitacao_id: p.id, capturado_em: agora(), ...dados })
    const up = await fetch(`${NUVEM}/iot/leitura`, { method: 'POST', headers: H, body })
    console.log(`  ⬆️  enviado → ${up.status === 200 ? 'ok' : (await up.json()).error}`)
  }
  return pendencias.length
}

if (process.env.UMA_VEZ) {
  await umCiclo()
} else {
  console.log(`🤖 agente ligado (poll a cada 5s) → ${NUVEM}. Ctrl+C pra parar.`)
  for (;;) { await umCiclo(); await new Promise(r => setTimeout(r, 5000)) }
}
