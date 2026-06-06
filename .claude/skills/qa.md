---
name: qa
description: Quality Assurance for CheckFlow — test strategy, suites por tela/feature, como rodar, como adicionar novos testes. Use whenever writing, running, or planning any kind of test (unit, integration, functional, e2e, pen test). Trigger on "teste", "test", "QA", "vitest", "playwright", "cobertura", "bug", "regressão".
---

# Quality Assurance

## Stack de Testes

| Camada | Ferramenta | Status |
|--------|-----------|--------|
| Unit / Integration | Vitest + Testing Library | 🔴 não instalado |
| E2E / Funcional | Playwright | 🔴 não instalado |
| Pen Test (security) | `pentest/run.mjs` (Node nativo) | ✅ 29/29 |

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

### ✅ Pen Test (`pentest/run.mjs`)
29 testes de segurança. Ver `/security` para detalhes.

### 🔴 Unit — `operacao/[id]` (a criar)
| Teste | Função | Prioridade |
|-------|--------|-----------|
| calcularValidacao — sim_nao conforme/não conforme | `calcularValidacao()` | 🔴 Alta |
| calcularValidacao — numero fora do range | `calcularValidacao()` | 🔴 Alta |
| calcularValidacao — multipla_escolha com opção inválida | `calcularValidacao()` | 🔴 Alta |
| aplicarMascara — dígitos com `9` e `0` | `aplicarMascara()` | 🔴 Alta |
| aplicarMascara — máscara `A` (letra) | `aplicarMascara()` | 🟡 Média |
| resultado global — aprovado quando todos conformes | `finalizar()` | 🔴 Alta |
| resultado global — reprovado quando qualquer não conforme | `finalizar()` | 🔴 Alta |
| calcularProgresso — conta só atividades visíveis | `calcularProgresso()` | 🟡 Média |
| dependentes — visível quando gatilho bate | lógica de gatilho | 🟡 Média |

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
