---
name: qa
description: Quality Assurance for CheckFlow — test strategy, suites por tela/feature, como rodar, como adicionar novos testes. Use whenever writing, running, or planning any kind of test (unit, integration, functional, e2e, pen test). Trigger on "teste", "test", "QA", "vitest", "playwright", "cobertura", "bug", "regressão".
---

# Quality Assurance

## Stack de Testes

| Camada | Ferramenta | Status |
|--------|-----------|--------|
| Unit / Integration | Vitest + Testing Library | ✅ instalado — `npx vitest run` |
| E2E / Funcional | Playwright | 🔴 não instalado |
| Pen Test (security, RLS) | `pentest/run.mjs` (Node nativo) | 🔴 atualizado 2026-06-10, não rodado ainda — adicionada seção 9 (`password_reset_tokens` + `/api/auth`) |
| HTTP Security Probe | `pentest/http_probe.mjs` (Node nativo, sem creds) | ✅ 25/26 (2026-06-08, após fix CORS + headers) |

### Instalar Vitest
```bash
cd apps/web
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```
Adicionar em `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'] },
})
```

### Instalar Playwright
```bash
cd apps/web
npm install -D @playwright/test
npx playwright install chromium
```

---

## Convenções

- Testes ficam em `apps/web/tests/`
- Estrutura espelha a de `app/`:
  ```
  tests/
  ├── unit/
  │   ├── operacao/          ← lógica pura (calcularValidacao, aplicarMascara, etc.)
  │   └── workflows/
  ├── integration/           ← componentes com Supabase mockado
  │   ├── checklists/
  │   └── workflows/
  └── e2e/                   ← Playwright, fluxos completos
      ├── login.spec.ts
      ├── operacao.spec.ts
      └── workflow.spec.ts
  ```
- Nome do arquivo: `<feature>.<tipo>.test.ts` — ex: `validacao.unit.test.ts`
- Cada teste deve ter comentário de **o que está testando e por quê**

---

## Suites Existentes

### Pen Test (`pentest/run.mjs`)
29 testes de segurança (RLS/multi-tenant, autenticado) das seções 1-8, 29/29 ✅ em 2026-06-07. Ver `/security` para detalhes.
⚠️ Achou e corrigiu (2026-06-07): bucket `execucoes` permitia `list()` por `anon` — ver migration `20260607110000`.

#### 🔴 Seção 9 — Login por código (OTP), adicionada 2026-06-10, ainda não executada
Cobre `password_reset_tokens` (RLS sem policies = deny-all) e as novas rotas `/api/auth/solicitar-codigo` e `/api/usuarios/resetar-senha`:
- `anon` e usuário comum (`clientB`) não podem `select`/`insert`/`update` em `password_reset_tokens`
- `/api/auth/solicitar-codigo` retorna resposta idêntica para CPF existente vs inexistente (anti-enumeração)
- `/api/usuarios/resetar-senha` sem `Authorization` → 401; com usuário sem `usuarios.editar` → 403
- Fixture atualizada: `userA` agora tem `cpf`/`telefone` reais (11 dígitos derivados do timestamp) e `status: 'ativo'`; `cpfInexistente` para o teste de enumeração. `BASE` de `testAPIRoutes()` corrigido para `WEB_BASE` (estava apontando para URL de API antiga, fazia os testes da seção 6 caírem em `info()`/network error silenciosamente).
- Rodar com `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_KEY` do ambiente para validar antes de marcar ✅.

### ✅ HTTP Security Probe (`pentest/http_probe.mjs`)
26 checagens black-box via HTTP contra produção (sem credenciais): headers de segurança, CORS, cookies, exposição de erro, TLS, XSS/SQLi heurístico, acesso anônimo à API. Categorias adaptadas do relatório "SENAI CONECTA".
⚠️ Achou e corrigiu (2026-06-08): CORS da API refletia qualquer `Origin` (commit `733a0fd`) e Web sem HSTS/X-Frame-Options/nosniff (commit `3ce612d`). Resultado atual: 25/26 ✅ (1 warn residual aceito: banner `Server: railway-hikari`, infra Railway). Relatório completo: `RELATORIO_SEGURANCA_2026-06-08.md`.

### ✅ Unit — `operacao/[id]` — `tests/unit/operacao/validacao.unit.test.ts` (18 testes)
`calcularValidacao` foi exportado de `operacao/[id]/page.tsx` (era módulo-privada) e testada diretamente — sim_nao, número (range/limites inclusivos/não-numérico), múltipla escolha (válida/inválida/opção deletada/seleção única vs array), tipos sem validação automática (texto/foto/catálogo → null).

### ✅ Unit — Turnos — `tests/unit/lib/turnos.unit.test.ts` (16 testes)
Criado `lib/turnos.ts`: espelho TS de `usuario_esta_no_turno()` (SQL, migration 20260607000002) — não dá pra testar a função do Postgres sem banco, então o espelho replica a mesma matemática e é coberto por testes (administrativo com janela cruzando meia-noite, escala 12x36/24x48 em vários pontos do ciclo, sem turno/inativo/sem data_referencia). **Mantenha os dois em sincronia** se a lógica SQL mudar — comentário no topo do arquivo avisa isso.

### ⚠️ Bugs encontrados por testes PRÉ-EXISTENTES (2026-06-07)
Rodando a suíte completa (`npx vitest run`), 2 testes que já existiam (escritos antes desta sessão) falharam — revelam bugs reais ainda não corrigidos:
| Teste | Bug | Task spawnada |
|-------|-----|--------------|
| `__tests__/execucao.expiracao.test.ts` | `data_expiracao` pode sair com 1 dia de diferença (off-by-one) — `setMonth` em hora local + `toISOString()` em UTC, problema de fuso horário | `task_94d7039b` |
| `__tests__/operacao.mascara.test.ts` | `aplicarMascara` "come" caracteres demais quando o input tem ruído (ex: dígito onde esperava letra) — comum em leitura de QR/código de barras | `task_df5ac11e` |

### ✅ Unit — Engine de checklist — `tests/unit/lib/checklistEngine.unit.test.ts` (13 testes)
Criado `lib/checklistEngine.ts`: espelho TS de 3 closures de `operacao/[id]/page.tsx` (`calcularProgresso`, `listarAtividadesVisiveis`, cálculo de `resultado` em `finalizar()`) extraídas como funções puras. Cobre: visibilidade de dependentes por gatilho (resposta string e array/múltipla-escolha, cadeias aninhadas), contagem de progresso só de visíveis, resultado global aprovado/reprovado (qualquer não-conforme reprova; indeterminados não reprovam; ocultos não entram na conta). **Mantenha em sincronia com o componente** — aviso no topo do arquivo.

### ✅ Unit — Templates de Notificação — `tests/unit/lib/notificacaoTemplates.unit.test.ts` (21 testes)
Espelho de `renderizar()` de `apps/api/src/lib/notificacao-templates.ts`. Cobre: substituição simples/múltipla/repetida, variável ausente/null/undefined → string vazia (nunca expõe `{{chave}}`), padrão `{{linha_X}}` (aparece/some), templates reais completos (ticket_aberto, ticket_movimentado, reset_senha), caracteres especiais no valor (`$`, `\`). **Mantenha em sincronia** com a função original se a regex mudar.

### ✅ Unit — SLA de Tickets — `tests/unit/lib/ticketSla.unit.test.ts` (19 testes)
Espelho TS de 3 funções Postgres (migration 20260609000001): `calcularDeadline()`, `calcularSegundosRestantes()` (pausa acumulada + pausa ativa + combinação), `semaforo()` (todas as faixas + limites exatos). Fluxo completo: ticket crítico 60 min → pausa 15 min → SLA vence em T+76 min. **Mantenha em sincronia** com `tickets_set_sla()` e `tickets_gerenciar_sla_pausa()` se a lógica SQL mudar.

### ✅ Unit — `calcularValidacao` tipo `padrao` (7 testes, em `validacao.unit.test.ts`)
Cobre a validação por faixa [min, max] resolvida via combinação de variáveis (feature "Padrões e Variáveis"): dentro/fora da faixa, limites inclusivos, faixa só-min ou só-max, sem instância correspondente → null, valor não numérico → null, formato de resposta inesperado → null.

### 🔴 Unit — `operacao/[id]` (pendente)
| Teste | O que testa | Prioridade |
|-------|-------------|-----------|
| upload de evidências — validação de tamanho (foto/vídeo) | `finalizar()` | 🟢 Baixa |

### 🔴 Unit — `checklists/page` (a criar)
| Teste | O que testa | Prioridade |
|-------|-------------|-----------|
| Duplicar — rollback ao falhar no meio | lógica rollback | 🔴 Alta |
| N+1 fix — batch count query | query única | 🟡 Média |

### 🔴 Unit — `workflows/[id]` (a criar)
| Teste | O que testa | Prioridade |
|-------|-------------|-----------|
| addEstagio — incrementa ordem corretamente | `addEstagio()` | 🟡 Média |
| moveEstagio — reordena e atualiza `ordem` | `moveEstagio()` | 🟡 Média |
| validação ao salvar — estágio sem checklist bloqueia | `salvar()` | 🔴 Alta |

### 🔴 Integration — Supabase RLS (a criar)
| Teste | O que testa | Prioridade |
|-------|-------------|-----------|
| Usuário sem unidade não vê checklists | RLS `checklists_leitura` | 🔴 Alta |
| Usuário vê só execuções da sua unidade | RLS `execucoes_leitura` | 🔴 Alta |
| Workflow engine — trigger avança estágio | `trg_workflow_checklist_concluido` | 🔴 Alta |

### 🔴 E2E — Playwright (a criar)
| Fluxo | Arquivo | Prioridade |
|-------|---------|-----------|
| Login com CPF → redireciona para /operacao | `login.spec.ts` | 🔴 Alta |
| Executar checklist completo → tela de aprovado | `operacao.spec.ts` | 🔴 Alta |
| Criar workflow → publicar → iniciar execução | `workflow.spec.ts` | 🟡 Média |
| Duplicar checklist para outra unidade | `checklists.spec.ts` | 🟡 Média |
| Excluir empresa inativa — bloqueado sem digitar nome/checkbox; sucesso apaga toda a árvore de dados | `empresas.exclusao.spec.ts` | 🟡 Média |
| Onboarding — toggle `ativo` em `/sistema/onboarding` esconde/mostra card na tela alvo | `onboarding.spec.ts` | 🟢 Baixa |
| Recuperação de senha por código (CPF → OTP WhatsApp → nova senha) | `recuperar-senha.spec.ts` | 🔴 Alta |
| Primeiro acesso (CPF + código de boas-vindas → definir senha) | `primeiro-acesso.spec.ts` | 🔴 Alta |
| Reset de senha disparado por gestor em `/gestao/acessos/usuarios` (permissão + envio) | `reset-admin.spec.ts` | 🟡 Média |

### ✅ Unit — Login por código (OTP) — `tests/unit/lib/passwordReset.unit.test.ts` (21 testes)
Testa diretamente `lib/passwordReset.ts` (importado, não espelhado) via mock de `SupabaseClient` (chain/thenable que consome respostas em fila por ordem de `.from()`). Cobre: `hashValor` (determinístico, nunca expõe valor original), `criarCodigoOtp` (código de 6 dígitos, grava hash+tipo+expiração ~15min), `contarSolicitacoesRecentes` (anti-abuso), `validarCodigoOtp` (sem token / expirado / máx. tentativas / código errado incrementa `tentativas` / código certo marca `usado=true` e cria `sessao_senha`), `validarSessaoSenha` (sem token / expirado / hash incorreto / sucesso marca usado, uso único), `enviarCodigoUsuario` (payload para `/whatsapp/enviar-codigo`, omite e-mail `@checkflow.local`, omite campos ausentes, não lança em falha de rede).

---

## Como Rodar

```bash
# Unit + Integration (Vitest)
cd apps/web && npx vitest run

# Watch mode
cd apps/web && npx vitest

# Cobertura
cd apps/web && npx vitest run --coverage

# E2E (Playwright)
cd apps/web && npx playwright test

# Pen Test (segurança)
SUPABASE_URL="..." SUPABASE_ANON_KEY="..." SUPABASE_SERVICE_KEY="..." node pentest/run.mjs
```

---

## Regra de Evolução

Ao implementar qualquer feature nova:
1. Adicionar linha na tabela da suite correspondente acima
2. Se for lógica pura (sem DOM, sem rede) → escrever teste unitário imediatamente
3. Se for fluxo crítico (login, finalizar execução, workflow) → adicionar E2E

Ao corrigir um bug: escrever o teste que teria detectado antes de commitar o fix.

**This skill is live.** Diga "update skills com o que fizemos hoje" para atualizar suites e status.
