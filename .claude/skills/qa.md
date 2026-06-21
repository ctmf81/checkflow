---
name: qa
description: Quality Assurance for CheckFlow — test strategy, suites por tela/feature, como rodar, como adicionar novos testes. Use whenever writing, running, or planning any kind of test (unit, integration, functional, e2e, pen test). Trigger on "teste", "test", "QA", "vitest", "playwright", "cobertura", "bug", "regressão".
---

# Quality Assurance

## Stack de Testes

| Camada | Ferramenta | Status |
|--------|-----------|--------|
| Unit / Integration | Vitest + Testing Library | ✅ instalado — `npx vitest run` · **218 testes / 11 arquivos** (2026-06-20) |
| E2E / Funcional | Playwright | 🔴 não instalado |
| Pen Test (security, RLS) | `pentest/run.mjs` (Node nativo) | ✅ 48/48 (2026-06-12) — seções 1-10, inclui OTP e Programa de Parceiros |
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

### Billing — Unit (`apps/api/src/lib/asaas.test.ts`, Vitest)
9 testes do cliente Asaas: URL/chave por ambiente (sandbox/prod), fallback p/ `ASAAS_API_KEY`, erro quando sem chave, formato da requisição (POST/JSON), parsing de erro (`errors[].description` → `HTTP <status>`), passagem do `split`, DELETE. Rodar: `cd apps/api && npm test`. **9/9 ✅ (2026-06-15).**

### Billing — Integração (`pentest/billing.mjs`, Node)
19 testes das funções Postgres + gatilhos (service-role, fixtures temporários, cleanup em cascata):
1. Enforcement de execuções (`billing_pode_executar`, trigger `billing_inc_execucao`, crédito `billing_creditar_execucoes`)
2. Reset de período (`avancar_periodo_assinatura` — use ou perde)
3. Tokens IA (trigger `billing_inc_tokens`, `billing_pode_consumir_ia`)
4. Armazenamento (`billing_armazenamento_disponivel` — capacidade = limite + pacote permanente; uso real cai com entrada negativa da limpeza)
5. Trial expirado → plano gratuito
6. Idempotência do webhook (`asaas_webhook_eventos.event_id` único)
Rodar: `export SUPABASE_URL=...; export SUPABASE_SERVICE_KEY=...; node pentest/billing.mjs`. **19/19 ✅ (2026-06-15).**
Obs: `billing_status` tem guard de permissão (`auth.uid()`), por isso o harness testa as funções de enforcement direto + inspeção da linha. O fluxo HTTP do webhook (rota Fastify) não é coberto aqui — validar via teste e2e no sandbox Asaas.

### Pen Test — telas novas billing/templates/ajuda (`pentest/billing-templates-rls.mjs`)
18 checagens de RLS das tabelas criadas (planos, pacotes_adicionais, empresa_assinaturas, empresa_cobrancas, asaas_webhook_eventos, ia_falhas, ajuda_artigos, checklists template): usuário comum (autenticado) e anon **não** leem dados sensíveis nem escrevem; ajuda respeita `publicado`; template é leitura pública (intencional). **18/18 ✅ (2026-06-17).** Rodar: `export SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_KEY; node pentest/billing-templates-rls.mjs`.
⚠️ Achou (2026-06-17): `planos`/`pacotes_adicionais` eram admin-only → self-service `/gestao/plano` não listava catálogo p/ admin da empresa. Fix: migration `20260617140000_billing_catalogo_leitura.sql` (leitura de ativos p/ autenticados).

### ✅ Unit — Vídeo embed (YouTube/Drive) — `tests/unit/lib/videoEmbed.unit.test.ts` (8 testes)
`lib/videoEmbed.ts` `videoEmbedUrl()` resolve link de YouTube (watch/youtu.be/embed + ID legado 11 chars) ou Google Drive (file/d/, open?id=, uc?id=) para URL de iframe; texto/Vimeo/nulo → null. `videoProvedor()` detecta youtube/drive. Usado nas etapas de documentos (montagem `EtapasModal` + operação `ViewerDocumento`). **8/8 ✅ (2026-06-20).**

### Pen Test — Documentos (escrita por permissão) (`pentest/documentos-rls.mjs`)
7 checagens: 2 empresas + um usuário GESTOR (perfil com permissão `documentos`) e um COMUM (perfil sem permissão), ambos membros da unidade A. Prova que o gestor **cria documento/etapa/imagem** na sua unidade, **não escreve na empresa B** (42501 / update 0 linhas), o comum **não escreve** mesmo sendo membro, e a **leitura por unidade** segue liberada a membros. **7/7 ✅ (2026-06-20).** Rodar: creds dos `.env` + `node pentest/documentos-rls.mjs`.

### Pen Test — Admin da empresa (isolamento) (`pentest/admin-empresa-rls.mjs`)
20 checagens: cria 2 empresas (A com 2 unidades, B com 1) + um Admin da empresa A autenticado. Prova que ele **vê toda a empresa A cross-unidade** (unidades, grupos, checklists, catálogos+valores, documentos — inclusive de unidade onde não é membro), **não vê NADA de B**, **gerencia A** (cria grupo) mas **não B** (42501 / update 0 linhas), **promove outro Admin da empresa em A**, e **não consegue** atribuir Admin de SISTEMA nem vincular em B. Asserções distinguem RLS (42501) de erro de query. **20/20 ✅ (2026-06-20).** Rodar: creds dos `.env` (ver abaixo) + `node pentest/admin-empresa-rls.mjs`.

### Pen Test (`pentest/run.mjs`)
48 testes de segurança (RLS/multi-tenant, autenticado), seções 1-10, **48/48 ✅ em 2026-06-12**. Ver `/security` para detalhes.
⚠️ Achou e corrigiu (2026-06-07): bucket `execucoes` permitia `list()` por `anon` — ver migration `20260607110000`.

#### Seção 9 — Login por código (OTP) ✅
`password_reset_tokens` (RLS deny-all) + rotas `/api/auth/solicitar-codigo` e `/api/usuarios/resetar-senha`. `anon`/`clientB` negados em select/insert/update; solicitar-codigo com resposta genérica anti-enumeração; resetar-senha bloqueada (middleware redireciona 307 → /login sem cookie; teste usa `redirect: 'manual'` e aceita 307/401/403).

#### Seção 10 — Programa de Parceiros ✅
`parceiros`, `empresa_status_eventos`, `parceiro_emails_log` (RLS admin-only): anon e usuário comum negados em select/insert/update/delete. Verifica também que as colunas financeiras de `empresas` NÃO são lidas por membro comum nem cross-tenant. Setup cria parceiro+vínculo+log; cleanup desfaz tudo.

#### Como rodar (credenciais dos `.env` locais)
```bash
export SUPABASE_URL=$(grep '^SUPABASE_URL=' apps/api/.env | cut -d= -f2-)
export SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SECRET_KEY=' apps/api/.env | cut -d= -f2-)
export SUPABASE_ANON_KEY=$(grep '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' apps/web/.env.local | cut -d= -f2-)
node pentest/run.mjs
```

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

### ✅ Unit — Listas de Tarefas — `tests/unit/lib/tarefas.unit.test.ts` (21 testes)
Criado `lib/tarefas.ts` (lógica pura, **importada** por `app/operacao/AbaTarefas.tsx` — fonte única, não espelho). Cobre: `aberturaAberta` (sem limite, data futura/passada, qtd abaixo/igual ao máximo, "o que vier primeiro" nas duas combinações), `visivelPara` (interseção por subgrupo; sem subgrupo cai p/ grupo; sem atribuição = invisível), `listaDisponivel` (aberta E visível), `calcularEditavelAte` (null sem janela, soma de horas, atravessa o dia), `edicaoExpirada` (null nunca expira, futuro/passado). **21/21 ✅ (2026-06-18).** Rodar: `cd apps/web && npx vitest run tests/unit/lib/tarefas.unit.test.ts`.

### ✅ Unit — Regras de Tickets — `tests/unit/lib/tickets.unit.test.ts` (41 testes)
Criado `lib/tickets.ts` (lógica pura, **importada** pelas telas `gestao/tickets/page.tsx` e `gestao/tickets/[id]/page.tsx` — fonte única, não espelho). Cobre: `ticketVisivel` (admin vê tudo; demais por subgrupo de destino OU por terem aberto; userId null), `acoesDisponiveis` (por status × papel — assumir só do subgrupo; em_tratamento → responsável conclui direto corrigido/parcial/não-corrigido + solicitar info + transferir; improcedência só com permissão `ticket.cancelar`; aguardando_informacao → só abridor; reabertura só abridor nos status reabríveis; comentar/cancelar nos abertos; terminais cancelado/improcedente sem ações; label de transferência usa rótulos da empresa), `slaStatus` (verde <80% / amarelo ≥80% / vermelho ≥100%/vencido; pausa ativa e acumulada estendem o prazo; fechado/sem-deadline → null). **Limpeza:** removido o fluxo legado `aguardando_validacao` (código morto — nenhuma ação gera mais esse status; valor mantido no enum/type só por compatibilidade). **41/41 ✅ (2026-06-20).** A matemática de deadline/pausa do SLA continua coberta à parte em `ticketSla.unit.test.ts`.

### ✅ Unit — Visibilidade por subgrupo — `tests/unit/lib/visibilidade.unit.test.ts` (19 testes)
Criado `lib/visibilidade.ts` (lógica pura, **importada** por `operacao/page.tsx` e `gestao/agendamentos/page.tsx` — centraliza predicado antes repetido inline em 4 pontos). Cobre: `visivelPorSubgrupo` (admin vê tudo; não-admin só seus subgrupos; subgrupo nulo/sem-subgrupos → invisível), `checklistVisivelOperador` (visível por subgrupo E não estar em workflow — evita porta-dupla; admin também não vê na lista avulsa um checklist em workflow), `agendamentoVisivelGestor` (alvo checklist pelo subgrupo do checklist; alvo workflow por algum subgrupo dos itens via mapa `wfSubgrupos`). **19/19 ✅ (2026-06-20).** ⚠️ Não substitui RLS (barreira de segurança real no Postgres) — é o espelho da regra de exibição no cliente.

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

# ⚠️ Se rodar a partir da RAIZ do repo, o alias "@/..." NÃO resolve
# (vitest.config.ts está em apps/web). Passe o root explicitamente:
#   npx vitest run --root apps/web tests/unit
# Testes com import relativo (../../../lib/...) rodam de qualquer lugar.

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
