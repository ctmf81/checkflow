# Processo: Nova Funcionalidade → Produção

Da **necessidade** até o **deploy**, no pipeline atual (dev separado de produção,
CI obrigatório, deploy manual). Complementa `AMBIENTES.md` (infra) e as skills
`/git`, `/biz`, `/golive`.

> **Cadência**: deploys de produção acontecem **às quartas-feiras**, em janela de
> **baixo tráfego** (confirmar a melhor hora pelo uso real — evitar os picos de
> operação dos clientes). Fora de quarta, só **hotfix** de bug crítico.

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

1. Subir/acordar `web-dev` e `api-dev` no Railway (App Sleeping acorda ao abrir a URL).
2. Testar o fluxo **de verdade** no `web-dev` (não só os testes automáticos): a tela,
   a permissão por perfil, o comportamento com/sem o entitlement, no mobile se aplicável.
3. Conferir que o **CI está verde** no `develop` (581 testes + typecheck).
4. Se achou bug → volta ao passo 2 da seção anterior.

---

## 4. Pré-requisitos para subir para produção (checklist de promoção)

Só promove quando **todos** estiverem ✅:

- [ ] **CI verde** no `develop` (é obrigatório — o `main` bloqueia PR vermelho).
- [ ] **Testes escritos** para a lógica nova (não só "passou o que já existia").
- [ ] **Migration revisada**: aditiva, idempotente, e **sobrevive ao código antigo**
      (regra 1 da seção 0). Se não for aditiva, foi quebrada em 2 fases.
- [ ] **`/golive` completo**: permissão, perfil, RLS, entitlement/plano, billing,
      mobile, testes — o que se aplicar à feature.
- [ ] **Validado no `web-dev`** por olho humano, não só CI.
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

## 6. Pós-deploy

1. Ficar de olho nos primeiros minutos: `/health`, logs (`railway logs --tail 20`),
   e os alertas de gestão.
2. Marcar a necessidade da seção 1 como entregue (memória/registro).
3. Se a feature nasceu "desligada" (entitlement/opt-in), combinar **quando e para quem**
   ligar — de forma gradual, não para todos de uma vez.

---

## Resumo de uma linha

`necessidade` → `develop` (código + migration aditiva + testes) → **valida no web-dev** →
checklist de pré-requisitos ✅ → **quarta, baixo tráfego**: banco→PR/CI→deploy manual→
smoke test → pronto, com rollback a 1 clique.
