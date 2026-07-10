---
name: golive
description: Checklist de go-live (definition of done) para TODA funcionalidade nova do CheckFlow antes de subir. Cobre permissão, perfil, Sidebar, RLS/isolamento, entitlements por plano, ciclo de billing, migration/backfill, mobile e testes. Use ao terminar de construir um módulo/recurso novo, ao revisar se algo está pronto pra produção, ou quando mencionar "go-live", "subir funcionalidade", "nova feature", "definition of done", "pronto pra prod", "publicar módulo".
---

# ✅ Checklist de Go-Live — CheckFlow

> Rode esta lista **ao fechar qualquer funcionalidade nova** (módulo, recurso, ou capacidade). Nasceu de furos reais (ver "Por que existe"). Marque item a item aplicado ao caso concreto.

## 1. Permissão & Perfil
- [ ] Recurso novo semeado em `permissoes` (recurso, acao, descricao) via migration
- [ ] **Registrado em `apps/web/app/gestao/acessos/perfis/permissoes.ts`** (`recursosTodos`) — senão NÃO aparece no construtor de perfil **nem** no editor de serviços (`/sistema/servicos`). *(Furo real: `tarefas` faltava aqui.)*
- [ ] A RLS **enforça cada ação** do recurso — nada de checkbox morto. Se o perfil tem `criar/editar/excluir`, a policy tem que checar cada um (não só `editar`). *(Furo real: padrão só checava `editar`.)*
- [ ] Seed/backfill para perfis de sistema por **allowlist de ids** (`...001` Admin de sistema, `...002` Admin da empresa) — **NUNCA `is_system = true` cru**, senão vaza para o perfil **Operação (`...003`)**. *(Furo real.)*
- [ ] Coluna nova com `default` em tabela já semeada? Revisar o valor nos **registros de sistema/seed existentes** (ex.: `perfis.publico` nasceu `false` e pegou o Operação por acidente).

## 2. Menu (Sidebar) & Guards
- [ ] Item no `components/layout/Sidebar.tsx` com o `perm` (ou `admin: true`) certo
- [ ] `folhaVisivel` já aplica `planoLibera(perm)` (entitlements) — então telas gateadas por permissão somem sozinhas do menu quando fora do plano. Só telas **`admin: true` que agregam vários módulos** (ex.: Notificações) precisam de filtro interno por `recursosHabilitados`.
- [ ] Rotas de detalhe respeitam o `GestaoGuard` / ambiente (operação x gestão)

## 3. RLS / Isolamento de tenant
- [ ] **TODA write policy** tem isolamento por unidade/empresa + a variante **`*_admin_empresa`** (de `20260620120000`). RLS permissiva combina por OR → se faltar uma, o admin da empresa fura.
- [ ] FK aponta para **`usuarios(id)`** (não `auth.users`) quando houver embed PostgREST (`autor:usuarios(nome)`), senão o embed quebra silenciosamente.
- [ ] Escritas no cliente **checam `error`** (RLS pode falhar em silêncio e mostrar sucesso).

## 4. Entitlements por plano (se for módulo gateável)
- [ ] Serviço no catálogo `servicos` (módulo→`recursos[]` ou característica→flag) + incluível no plano (`plano_servicos`)
- [ ] Decidir se é **`padrao`** (sempre liberado, base) ou gateável
- [ ] Gate `empresa_libera_recurso(empresa, recurso)` em **todas as write policies de autoria** (incl. `*_admin_empresa`); tickets via policy `restrictive` de insert
- [ ] **Não gatear operação viva** (execução, finalizar→plano) — só autoria
- [ ] Comportamento de **contratação / upgrade / downgrade** documentado no `/biz`

## 5. Ciclo de billing (bloqueio por carência)
- [ ] Se a funcionalidade tem **criação de registro novo**, entra no gate `empresa_pode_criar` (policy `restrictive` de insert) + botão desabilitado na UI via `SessionContext.faseAssinatura`
- [ ] Operação/execução NÃO entra (carência não estrangula operação)

## 6. Migration & Deploy
- [ ] Migration em `supabase/migrations/` (commit `db(...)` separado)
- [ ] **Aplicada no SQL Editor de prod** (o deploy Railway NÃO aplica migrations)
- [ ] **Backfill** para empresas/perfis existentes (ninguém perde acesso no deploy)

## 7. Mobile & UX
- [ ] Cabeçalhos com vários botões: `flex-wrap` (não estourar no mobile)
- [ ] Cards de listagem: empilhar no mobile (`flex-col sm:flex-row`)
- [ ] Seleções longas: `<select>` nativo (respeita a tela) — ver Header/"Adicionar Painel"
- [ ] Descrição do cabeçalho oculta no mobile (`hidden sm:block`)
- [ ] Botão de novo registro na listagem = só "+ Novo" / "+ Nova"

## 8. Testes
- [ ] `npx vitest run` verde (unit)
- [ ] `tsc --noEmit` sem erros
- [ ] Teste de **gating** (configurar plano sem o serviço → módulo bloqueia autoria, operação/leitura ok)
- [ ] Se mexeu no ciclo de billing: rodar o teste reversível (ver [[billing-ciclo-bloqueio]])

---

## Por que existe (furos reais que motivaram — 2026-07-09)
1. `tarefas` existia em `permissoes`+RLS mas faltava no `permissoes.ts` → sumido do construtor/serviços.
2. Backfill `is_system=true` deu permissões de usuários ao perfil **Operação** por engano.
3. `perfis.publico` do Operação nasceu `false` (coluna criada após o seed).
4. Ações `criar/excluir` de **padrão** inertes (RLS só checava `editar`).

Referência viva das regras: `/biz`, `/db`, `/security`. Estado do billing/entitlements: memória `billing-ciclo-bloqueio`, `dashboards-e-entitlements-2026-07-09`.
