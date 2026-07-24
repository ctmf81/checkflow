#!/usr/bin/env node
// Aplica migrations em DEV ou PROD via Supabase CLI, sem depender de qual shell
// está rodando (no Windows o npm usa cmd.exe e não expande $VAR).
//
//   node scripts/db.mjs status dev     → lista o que falta aplicar (não altera nada)
//   node scripts/db.mjs push   dev     → aplica as migrations pendentes
//   node scripts/db.mjs status prod
//   node scripts/db.mjs push   prod    → pede confirmação explícita
//
// As connection strings ficam em .env.migrations (gitignored). Pegue em
// Supabase → Project Settings → Database → Connection string (URI):
//   SUPABASE_DB_URL_DEV=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
//   SUPABASE_DB_URL_PROD=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const [, , acao, ambiente] = process.argv

const ACOES = { status: 'migration list', push: 'db push' }
if (!ACOES[acao] || !['dev', 'prod'].includes(ambiente)) {
  console.error('uso: node scripts/db.mjs <status|push> <dev|prod>')
  process.exit(1)
}

// .env.migrations tem precedência sobre o ambiente do shell
if (existsSync('.env.migrations')) {
  for (const linha of readFileSync('.env.migrations', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
  }
}

const chave = `SUPABASE_DB_URL_${ambiente.toUpperCase()}`
const dbUrl = process.env[chave]
if (!dbUrl) {
  console.error(`✗ ${chave} não definida.`)
  console.error('  Crie .env.migrations (veja o cabeçalho deste arquivo) ou exporte a variável.')
  process.exit(1)
}

// Produção altera o banco dos clientes: exige confirmação digitada.
if (ambiente === 'prod' && acao === 'push') {
  const ok = process.argv.includes('--sim')
  if (!ok) {
    console.error('⚠️  Isto aplica migrations no banco de PRODUÇÃO.')
    console.error('   Rode "node scripts/db.mjs status prod" antes para ver o que será aplicado.')
    console.error('   Confirmando: node scripts/db.mjs push prod --sim')
    process.exit(1)
  }
}

const args = [...ACOES[acao].split(' '), '--db-url', dbUrl]
console.log(`→ supabase ${ACOES[acao]} (${ambiente})`)
const r = spawnSync('npx', ['--yes', 'supabase', ...args], { stdio: 'inherit', shell: true })
process.exit(r.status ?? 1)
