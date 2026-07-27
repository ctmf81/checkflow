# Processo: Nova Funcionalidade → Produção

Da **necessidade** até o **deploy**, no pipeline atual (dev separado de produção,
CI obrigatório, deploy manual). Complementa `AMBIENTES.md` (infra) e as skills
`/git`, `/biz`, `/golive`.

> **Cadência**: deploys de produção acontecem **às quartas-feiras**, em janela de
> **baixo tráfego** (confirmar a melhor hora pelo uso real — evitar os picos de
> operação dos clientes). Fora de quarta, só **hotfix** de bug crítico (ver §5.5).

---

## 0. Princípios inegociáveis (não interferir com quem está usando)

A arquitetura tem **2 réplicas** de web e API no Railway → durante o deploy, versão
**nova e antiga rodam ao mesmo tempo** por alguns instantes. E o banco é **um só**
por ambiente. Disso saem 4 regras que evitam quebrar produção:

1. **Migration ADITIVA e compatível com o código antigo** (expand/contract). Nunca
   dropar/renomear coluna que o código em produção ainda usa. Colunas novas entram
   `nullable` ou com `default`. O código velho tem que continuar funcionando **depois**
   da migration e **antes** do código novo subir.
2. **Banco ANTES do código.** Aplica a migration em produção primeiro; só depois sobe
   o código que depende dela. (O inverso já quebrou a tela de plano 2×: o front pediu
   uma coluna que ainda não existia.)
3. **Migration idempotente** (`if not exists`, `create or replace`) — sem rollback
   automático, ela precisa poder rodar sem estourar.
4. **Funcionalidade nova nasce "desligada" para o usuário** quando possível: atrás de
   **entitlement/serviço do plano** ou opt-in (ver `/biz`). Assim ela aparece de forma
   controlada, não surge do nada na cara de todo mundo.

---

## 1. Necessidade (antes de escrever código)

1. **Registrar** o que se quer e **por quê** (problema, não solução).
2. **Escopo + dependências**: checar o grafo de dependências entre funcionalidades no
   `/biz` (ex.: Planos de Ação dependem de Checklists; Workflows de Checklists). Não
   deixar uma função ativa sem o pré-requisito.
3. **Definition of Done**: rodar o checklist do **`/golive`** (permissão/perfil/RLS/
   entitlements/billing/mobile/testes) — é o que define "pronto de verdade".
4. **Pensar a migration desde já**: dá pra fazer aditiva? Se exige remover/renomear
   algo, planejar em **2 fases** (primeiro adiciona o novo e migra; a remoção do velho
   só num deploy seguinte, quando ninguém mais usa).

---

## 2. Desenvolvimento (na `develop`)

1. Sub-branch a partir de `develop` (`feat/<escopo>/<nome>`).
2. **Migration** em `supabase/migrations/` (aditiva + idempotente). Aplicar no dev:
   `npm run db:push:dev`.
3. **Código** — commits cirúrgicos separando `db` / `api` / `ui` (ver `/git`).
4. **Testes** — lógica pura → `lib/*.ts` + vitest. Rodar `npm test`.
5. Mergear a sub-branch em **`develop`** e `git push` (o CI roda automático).

---

## 3. Validação no ambiente de DEV

1. **Preparar os cenários de teste ANTES** — listar o que precisa ser exercitado:
   caminho feliz, casos de borda, e o comportamento **por perfil** (admin de sistema,
   admin da empresa, operação) e **com/sem o entitlement** do plano. Anotar o passo a
   passo esperado de cada cenário.
2. **Preparar os usuários de teste** que cada cenário exige (ex.: um admin da empresa,
   um operador). Se não existirem no banco de dev, **criar** — via Auth Admin API do
   Supabase dev + linha em `usuarios` (id = auth uid; `cpf` no formato `000.000.000-00`
   pois o login casa exato via `buscar_email_por_cpf`). Guardar as credenciais de teste.
3. Subir/acordar `web-dev` e `api-dev` no Railway (App Sleeping acorda ao abrir a URL).
4. **Rodar os cenários** no `web-dev` — de verdade, com olho humano, não só CI: a tela,
   a permissão por perfil, o com/sem entitlement, o mobile se aplicável.
5. **Regressão automática**: o **CI roda a suíte INTEIRA (581 testes) a cada push/PR** —
   é a checagem de que nada antigo quebrou. Garantir que está **verde** no `develop`.
   (Pra rodar na mão local: `npm test`.)
6. Se achou bug → volta ao passo 2 da seção anterior.

---

## 4. Pré-requisitos para subir para produção (checklist de promoção)

Só promove quando **todos** estiverem ✅:

- [ ] **CI verde** no `develop` (é obrigatório — o `main` bloqueia PR vermelho).
- [ ] **Testes escritos** para a lógica nova (não só "passou o que já existia").
- [ ] **Migration revisada**: aditiva, idempotente, e **sobrevive ao código antigo**
      (regra 1 da seção 0). Se não for aditiva, foi quebrada em 2 fases.
- [ ] **`/golive` completo**: permissão, perfil, RLS, entitlement/plano, billing,
      mobile, testes — o que se aplicar à feature.
- [ ] **Cenários de teste** rodados no `web-dev` (por perfil e com/sem entitlement),
      com os **usuários de teste** necessários criados. Validado por **olho humano**,
      não só CI.
- [ ] **Docs/skills atualizados** (`/biz`, `/db`, manual, o que a feature tocou).
- [ ] **Plano de rollback pensado** (seção 5) — o que fazer se der ruim.
- [ ] É **quarta-feira** (ou hotfix crítico justificado).

---

## 5. Deploy (quarta-feira, janela de baixo tráfego)

Ordem importa. Executar assim:

```bash
# 1. BANCO PRIMEIRO (se houver migration nova)
npm run db:status:prod        # confere o que falta aplicar
npm run db:push:prod --sim    # aplica em produção (aditivo → não afeta quem está online)

# 2. CÓDIGO via PR (main é protegido; merge direto é bloqueado)
gh pr create --base main --head develop --title "Deploy <data>: <resumo>" --fill
#   → esperar o CI ficar VERDE no PR, então:
gh pr merge --merge

# 3. re-sincronizar o develop com o merge commit
git checkout develop && git merge origin/main && git push
```

4. **Deploy manual no Railway**: nos serviços **`web`** e **`api`** de produção, clicar
   **Deploy/Redeploy**. O Railway faz **rolling deploy** (troca réplica por réplica) →
   sem downtime, mas por instantes convive versão nova+antiga (por isso a regra 1).
5. **Smoke test em produção** (2 min): abrir o app, logar, exercitar a feature nova e
   **um fluxo crítico antigo** (abrir/finalizar um checklist). Conferir `/health` da API.

### Rollback (se algo quebrar)
- **Código**: no Railway, "Redeploy" da versão **anterior** (o Railway guarda o
  histórico de deploys — é 1 clique). Volta em segundos.
- **Banco**: como a migration foi **aditiva**, o código antigo volta a funcionar sobre
  o schema novo sem precisar desfazer nada. (É por isso que aditivo é regra.) Só
  desfazer a migration se ela tiver criado algo que ativamente atrapalhe — raro.

---

## 5.5. Bug × Funcionalidade — o que sobe quando, e como isolar

**A regra de ouro que faz tudo funcionar**: funcionalidade em andamento fica na
**branch dela**; só entra em `develop` quando está **PRONTA e vai ser lançada**. Assim
`develop` é sempre "o que sobe na próxima quarta" — nunca tem meia-feature que subiria
sem querer.

### Funcionalidade (novo)
- Cada uma na sua `feat/<escopo>/<nome>`. Testa no dev, e **só mergeia em `develop`
  quando terminou + validou**. Sobe na **quarta**, junto com o que mais estiver pronto.

### Bug — depende da gravidade
| Tipo | Exemplos | Quando sobe | Como |
|------|----------|-------------|------|
| **Crítico** | tela quebrada, cobrança/split errado, vazamento, dado corrompendo | **NA HORA** (não espera quarta) | **hotfix** (fluxo abaixo) |
| **Não-crítico** | cosmético, contornável, texto errado | próxima **quarta** | como uma feature: `fix/*` → `develop` |

### Fluxo de HOTFIX (subir só o bug, sem levar features pela metade)
O segredo: o hotfix **sai de `main`** (o estado exato que está em produção), **não de
`develop`**. Por isso ele não arrasta as features que estão em `develop`.

```
main       ●───────────────────────●   ← o hotfix entra aqui, SOZINHO
            \                       ↑
hotfix/bug   \──●────────────────────┘  (branch de main → corrige → PR de volta pra main)

develop    ●──●──●──●   ← features em andamento continuam aqui, INTOCADAS
```

```bash
# 1. branch a partir da PRODUÇÃO (main), não de develop
git fetch origin && git checkout -b fix/<escopo>/<bug> origin/main

# 2. corrige + testa (com teste que cubra o bug). Se tocar o banco, migration ADITIVA.

# 3. PR direto pra main (o CI precisa ficar verde)
gh pr create --base main --head fix/<escopo>/<bug> --title "Hotfix: <bug>" --fill
gh pr merge --merge      # depois do CI verde

# 4. deploy manual no Railway (web/api) → smoke test

# 5. leva a correção de volta pra develop E pras branches de feature ativas
git checkout develop && git merge origin/main && git push
#   (em cada feat/* ativa: git merge origin/develop)
```

> **Resposta à pergunta "subo tudo?"**: **não.** Você sobe só o que está em `develop`
> (features prontas) na quarta; e um bug crítico sobe sozinho via hotfix-de-`main`, sem
> tocar nas 2 features em desenvolvimento. Separação garantida por branch.

> **Limite honesto**: há **um** ambiente de dev (`web-dev`/`api-dev`, que segue a
> `develop`). Dá pra validar bem **uma coisa de cada vez** ali. Testar 2 features
> meio-prontas em isolamento **ao mesmo tempo** exigiria ambientes de preview por
> branch — upgrade para outro momento, se e quando o time crescer.

## 6. Pós-deploy

1. Ficar de olho nos primeiros minutos: `/health`, logs (`railway logs --tail 20`),
   e os alertas de gestão.
2. Marcar a necessidade da seção 1 como entregue (memória/registro).
3. Se a feature nasceu "desligada" (entitlement/opt-in), combinar **quando e para quem**
   ligar — de forma gradual, não para todos de uma vez.

---

## Resumo de uma linha

**Feature**: `feat/*` → (pronta) → `develop` → valida no web-dev com cenários+usuários →
checklist ✅ → **quarta, baixo tráfego**: banco→PR/CI→deploy manual→smoke test.
**Bug crítico**: `fix/*` **de `main`** → PR→CI→deploy **na hora**, sozinho, sem tocar as
features em andamento → depois volta pra `develop`. Rollback sempre a 1 clique.
