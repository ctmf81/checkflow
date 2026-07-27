// ── RECEPTOR (protótipo) ─────────────────────────────────────────────────────
// Faz o papel da NUVEM do CheckFlow, só para provar o conceito do agente.
// NÃO é a feature — é um spike isolado. Sobe um HTTP simples, sem dependências.
//
// Endpoints:
//   POST /disparar        {tipo:'sensor'|'camera', janela_seg?}  → simula o
//                         agendamento disparando: cria uma "solicitação de leitura"
//                         com janela (tempo máximo de resposta).
//   GET  /iot/pendencias  (header x-device-token) → o agente pergunta o que coletar.
//                         Ao consultar, solicitações vencidas viram 'sem_resposta'.
//   POST /iot/leitura     {solicitacao_id, valor?, imagem_b64?, capturado_em} →
//                         o agente entrega a leitura do MOMENTO.
//   GET  /status          → mostra tudo (solicitações + leituras recebidas).
//
// Regra do "retrato do momento": só aceita leitura amarrada a uma solicitação
// ABERTA e dentro da janela. Nada avulso entra.

import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'

const PORT = 4000
const TOKEN = 'demo-token-123'          // token do "dispositivo" (o agente)
const DIR = new URL('./recebidas/', import.meta.url)
mkdirSync(DIR, { recursive: true })

let seq = 0
const solicitacoes = new Map()          // id → { id, tipo, criado_em, janela_ate, status }
const leituras = []                     // histórico do que chegou

const agora = () => new Date().toISOString()
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }

// Marca como 'sem_resposta' o que passou da janela sem responder.
function expirarVencidas() {
  const t = Date.now()
  for (const s of solicitacoes.values()) {
    if (s.status === 'pendente' && t > new Date(s.janela_ate).getTime()) {
      s.status = 'sem_resposta'
      console.log(`⏰ solicitação ${s.id} (${s.tipo}) SEM RESPOSTA (janela venceu) → alerta, sem plano de ação`)
    }
  }
}

function corpo(req) {
  return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)) })
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  // 1) Simula o agendamento disparando
  if (req.method === 'POST' && url.pathname === '/disparar') {
    const { tipo = 'sensor', janela_seg = 30 } = JSON.parse((await corpo(req)) || '{}')
    const id = `sol_${++seq}`
    const s = { id, tipo, criado_em: agora(), janela_ate: new Date(Date.now() + janela_seg * 1000).toISOString(), status: 'pendente' }
    solicitacoes.set(id, s)
    console.log(`🔔 DISPARO: criada solicitação ${id} (${tipo}), responder até ${s.janela_ate}`)
    return json(res, 200, s)
  }

  // 2) O agente pergunta o que precisa coletar AGORA
  if (req.method === 'GET' && url.pathname === '/iot/pendencias') {
    if (req.headers['x-device-token'] !== TOKEN) return json(res, 401, { error: 'token inválido' })
    expirarVencidas()
    const abertas = [...solicitacoes.values()].filter(s => s.status === 'pendente')
    return json(res, 200, { pendencias: abertas })
  }

  // 3) O agente entrega a leitura do momento
  if (req.method === 'POST' && url.pathname === '/iot/leitura') {
    if (req.headers['x-device-token'] !== TOKEN) return json(res, 401, { error: 'token inválido' })
    const { solicitacao_id, valor, imagem_b64, capturado_em } = JSON.parse((await corpo(req)) || '{}')
    const s = solicitacoes.get(solicitacao_id)
    if (!s) return json(res, 404, { error: 'solicitação inexistente (leitura avulsa é ignorada)' })
    if (s.status !== 'pendente') return json(res, 409, { error: `solicitação já ${s.status} (fora da janela)` })

    let arquivo = null
    if (imagem_b64) {
      arquivo = new URL(`${solicitacao_id}.jpg`, DIR)
      writeFileSync(arquivo, Buffer.from(imagem_b64, 'base64'))
    }
    s.status = 'respondida'
    const reg = { solicitacao_id, tipo: s.tipo, valor: valor ?? null, arquivo: arquivo?.pathname ?? null, disparo: s.criado_em, capturado_em, recebido_em: agora() }
    leituras.push(reg)

    // Prova do "retrato do momento": capturado_em é DEPOIS do disparo.
    const fresco = new Date(capturado_em) > new Date(s.criado_em)
    console.log(`📥 LEITURA de ${solicitacao_id} (${s.tipo}): ${valor != null ? `valor=${valor}` : `imagem ${Buffer.from(imagem_b64, 'base64').length}B`} | capturado ${fresco ? 'DEPOIS' : 'ANTES(!)'} do disparo ✅`)
    return json(res, 200, { ok: true })
  }

  // 4) Painel simples
  if (req.method === 'GET' && url.pathname === '/status') {
    expirarVencidas()
    return json(res, 200, { solicitacoes: [...solicitacoes.values()], leituras })
  }

  json(res, 404, { error: 'rota não encontrada' })
}).listen(PORT, () => console.log(`🌐 receptor (nuvem-faz-de-conta) em http://localhost:${PORT}`))
