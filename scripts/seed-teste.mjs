/**
 * Seed de dados de teste — CheckFlow
 *
 * Cria:
 *  - 1 empresa: "Empresa Teste CheckFlow"
 *  - 1 unidade: "Unidade Matriz"
 *  - 1 grupo: "Operações"
 *  - 1 subgrupo: "Turno A"
 *  - 4 usuários (operador, N1, N2, visualizador)
 *  - 1 checklist com atividade que gera plano de ação (SLA 24h)
 *  - Vínculos: empresa, unidade, subgrupo com funções corretas
 *
 * Uso:
 *   SUPABASE_URL="..." SUPABASE_SERVICE_KEY="..." node scripts/seed-teste.mjs
 *
 * Credenciais criadas:
 *   operador@teste.checkflow    / Teste@2026
 *   nivel1@teste.checkflow      / Teste@2026
 *   nivel2@teste.checkflow      / Teste@2026
 *   visualizador@teste.checkflow/ Teste@2026
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY

if (!URL || !KEY) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const sb = createClient(URL, KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(label, data) { console.log(`  ✅  ${label}`, data?.id ?? '') }
function fail(label, err) { console.error(`  ❌  ${label}`, err?.message ?? err); process.exit(1) }

async function criarUsuario(email, nome, cpf) {
  // Tenta criar — se já existir, busca o ID existente
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: 'Teste@2026',
    email_confirm: true,
    user_metadata: { nome, role: 'usuario' },
  })
  if (error && !error.message.includes('already')) fail(`auth ${email}`, error)
  if (data?.user) {
    await sb.from('usuarios').upsert({
      id: data.user.id, nome, email, cpf, status: 'ativo', primeiro_acesso: false,
    }, { onConflict: 'id' })
    return data.user.id
  }
  // Já existia — busca por email
  const { data: list } = await sb.auth.admin.listUsers()
  const existing = list?.users?.find(u => u.email === email)
  if (!existing) fail(`Usuário ${email} não encontrado`)
  return existing.id
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

console.log('\n🌱  Iniciando seed de teste...\n')

// 1. Empresa
let { data: empresa, error: empErr } = await sb.from('empresas')
  .upsert({ nome: 'Empresa Teste CheckFlow', status: 'ativo' }, { onConflict: 'nome' })
  .select('id').single()
if (empErr) {
  const { data: e } = await sb.from('empresas').select('id').eq('nome', 'Empresa Teste CheckFlow').single()
  empresa = e
}
ok('Empresa', empresa)

// 2. Unidade
let { data: unidade, error: unErr } = await sb.from('unidades')
  .upsert({ empresa_id: empresa.id, nome: 'Unidade Matriz', status: 'ativo' }, { onConflict: 'empresa_id,nome' })
  .select('id').single()
if (unErr) {
  const { data: u } = await sb.from('unidades').select('id').eq('empresa_id', empresa.id).eq('nome', 'Unidade Matriz').single()
  unidade = u
}
ok('Unidade', unidade)

// 3. Grupo
let { data: grupo, error: grpErr } = await sb.from('grupos')
  .upsert({ unidade_id: unidade.id, nome: 'Operações', status: 'ativo' }, { onConflict: 'unidade_id,nome' })
  .select('id').single()
if (grpErr) {
  const { data: g } = await sb.from('grupos').select('id').eq('unidade_id', unidade.id).eq('nome', 'Operações').single()
  grupo = g
}
ok('Grupo', grupo)

// 4. Subgrupo
let { data: subgrupo, error: subErr } = await sb.from('subgrupos')
  .upsert({ grupo_id: grupo.id, nome: 'Turno A', status: 'ativo' }, { onConflict: 'grupo_id,nome' })
  .select('id').single()
if (subErr) {
  const { data: s } = await sb.from('subgrupos').select('id').eq('grupo_id', grupo.id).eq('nome', 'Turno A').single()
  subgrupo = s
}
ok('Subgrupo', subgrupo)

// 5. Perfil padrão da empresa
let { data: perfil } = await sb.from('perfis')
  .select('id').eq('empresa_id', empresa.id).limit(1).single()
if (!perfil) {
  const { data: p } = await sb.from('perfis')
    .insert({ empresa_id: empresa.id, nome: 'Padrão', permissoes: [] })
    .select('id').single()
  perfil = p
}
ok('Perfil', perfil)

// 6. Usuários
console.log('\n👤  Criando usuários...')
const usuarios = [
  { email: 'operador@teste.checkflow',      nome: 'Ana Operadora',   cpf: '111.111.111-11', funcao: 'operacao' },
  { email: 'nivel1@teste.checkflow',        nome: 'Bruno N1',        cpf: '222.222.222-22', funcao: 'nivel_1'  },
  { email: 'nivel2@teste.checkflow',        nome: 'Carla N2',        cpf: '333.333.333-33', funcao: 'nivel_2'  },
  { email: 'visualizador@teste.checkflow',  nome: 'Diego Visitante', cpf: '444.444.444-44', funcao: null       },
]

for (const u of usuarios) {
  const uid = await criarUsuario(u.email, u.nome, u.cpf)
  ok(`Usuário ${u.nome}`, { id: uid })

  // Vínculo empresa
  await sb.from('usuario_empresa').upsert({ usuario_id: uid, empresa_id: empresa.id, perfil_id: perfil.id }, { onConflict: 'usuario_id,empresa_id' })
  // Vínculo unidade
  await sb.from('usuario_unidade').upsert({ usuario_id: uid, unidade_id: unidade.id }, { onConflict: 'usuario_id,unidade_id' })
  // Vínculo subgrupo com função
  await sb.from('usuario_subgrupo').upsert({ usuario_id: uid, subgrupo_id: subgrupo.id, unidade_id: unidade.id, funcao: u.funcao }, { onConflict: 'usuario_id,subgrupo_id' })
}

// 7. Checklist
console.log('\n📋  Criando checklist...')
let { data: checklist, error: clErr } = await sb.from('checklists')
  .upsert({
    unidade_id: unidade.id,
    subgrupo_id: subgrupo.id,
    nome: 'Inspeção de Equipamentos — Teste',
    descricao: 'Checklist de teste para validar o fluxo de planos de ação.',
    status: 'publicado',
    tempo_guarda_meses: 12,
  }, { onConflict: 'unidade_id,nome' })
  .select('id').single()
if (clErr) {
  const { data: cl } = await sb.from('checklists').select('id').eq('unidade_id', unidade.id).eq('nome', 'Inspeção de Equipamentos — Teste').single()
  checklist = cl
}
ok('Checklist', checklist)

// 7a. Seção
let { data: secao } = await sb.from('checklist_secoes')
  .upsert({ checklist_id: checklist.id, nome: 'Verificações Gerais', ordem: 0 }, { onConflict: 'checklist_id,nome' })
  .select('id').single()
if (!secao) {
  const { data: s } = await sb.from('checklist_secoes').select('id').eq('checklist_id', checklist.id).single()
  secao = s
}
ok('Seção', secao)

// 7b. Atividades
const atividades = [
  {
    nome: 'EPI correto?',
    tipo: 'sim_nao',
    config: { esperado: 'sim', exibir_referencia: true },
    critica: false,
    gera_plano_acao: false,
    plano_acao_sla_horas: null,
    ordem: 0,
  },
  {
    nome: 'Temperatura do equipamento (°C)',
    tipo: 'numero',
    config: { min: 15, max: 40, unidade: '°C', exibir_referencia: true },
    critica: false,
    gera_plano_acao: false,
    plano_acao_sla_horas: null,
    ordem: 1,
  },
  {
    nome: 'Nível de óleo está correto?',
    tipo: 'sim_nao',
    config: { esperado: 'sim', exibir_referencia: true },
    critica: true,
    gera_plano_acao: true,       // ← gera plano de ação
    plano_acao_sla_horas: 24,    // ← SLA de 24h
    ordem: 2,
  },
  {
    nome: 'Condição geral',
    tipo: 'multipla_escolha',
    config: {},
    critica: false,
    gera_plano_acao: false,
    plano_acao_sla_horas: null,
    ordem: 3,
  },
]

for (const atv of atividades) {
  let { data: a, error: aErr } = await sb.from('checklist_atividades')
    .upsert({
      checklist_id: checklist.id,
      secao_id: secao.id,
      obrigatoria: true,
      ...atv,
    }, { onConflict: 'checklist_id,secao_id,nome' })
    .select('id').single()

  if (aErr) {
    const { data: ex } = await sb.from('checklist_atividades').select('id').eq('checklist_id', checklist.id).eq('nome', atv.nome).single()
    a = ex
  }
  ok(`Atividade "${atv.nome}"`, a)

  // Opções da múltipla escolha
  if (atv.tipo === 'multipla_escolha' && a) {
    const opcoes = [
      { atividade_id: a.id, label: 'Boa',      valor: 'boa',      ordem: 0, e_valido: true },
      { atividade_id: a.id, label: 'Regular',  valor: 'regular',  ordem: 1, e_valido: true },
      { atividade_id: a.id, label: 'Ruim',     valor: 'ruim',     ordem: 2, e_valido: false },
    ]
    await sb.from('checklist_atividade_opcoes').upsert(opcoes, { onConflict: 'atividade_id,valor' })
    ok('Opções da múltipla escolha', { id: 'ok' })
  }
}

// ─── Resumo ───────────────────────────────────────────────────────────────────

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Seed concluído!

Empresa:   Empresa Teste CheckFlow
Unidade:   Unidade Matriz
Subgrupo:  Turno A

Usuários (senha: Teste@2026):
  operador@teste.checkflow       → Função: Operação
  nivel1@teste.checkflow         → Função: Nível 1 (modera planos)
  nivel2@teste.checkflow         → Função: Nível 2 (modera escalados)
  visualizador@teste.checkflow   → Função: — (só visualiza)

Checklist: "Inspeção de Equipamentos — Teste"
  Atividade que gera plano: "Nível de óleo está correto?" (SLA 24h)
  → Responda "Não" para disparar o plano de ação

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
