# ✅ Checklist de Go-Live — CheckFlow

> **Definition of done** para toda funcionalidade nova (módulo, recurso ou capacidade) antes de subir para produção.
> Também disponível como skill do Claude Code: `/golive`.

Nasceu de furos reais (ver o rodapé). Percorra item a item aplicado ao caso concreto.

---

## 1. Permissão & Perfil
- [ ] Recurso semeado em `permissoes` (recurso, acao, descricao) via migration
- [ ] **Registrado em `apps/web/app/gestao/acessos/perfis/permissoes.ts`** (`recursosTodos`) — senão NÃO aparece no construtor de perfil **nem** no editor de serviços (`/sistema/servicos`)
- [ ] A RLS **enforça cada ação** (criar/editar/excluir) — sem checkbox morto
- [ ] Seed/backfill p/ perfis de sistema por **allowlist de ids** (`…001` Admin de sistema, `…002` Admin da empresa) — **nunca `is_system = true` cru** (vaza p/ o perfil **Operação `…003`**)
- [ ] Coluna nova com `default` em tabela já semeada → revisar o valor nos registros de sistema/seed existentes

## 2. Menu (Sidebar) & Guards
- [ ] Item no `components/layout/Sidebar.tsx` com o `perm` (ou `admin: true`) correto
- [ ] Telas gateadas por permissão somem sozinhas do menu quando fora do plano (`folhaVisivel` → `planoLibera`). Só páginas `admin: true` que agregam vários módulos precisam de filtro interno por `recursosHabilitados` (ex.: Notificações)
- [ ] Rotas de detalhe respeitam o guard de ambiente (operação × gestão)

## 3. RLS / Isolamento de tenant
- [ ] **Toda** write policy com isolamento por unidade/empresa **+ a variante `*_admin_empresa`** (RLS permissiva combina por OR)
- [ ] FK aponta para `usuarios(id)` (não `auth.users`) quando houver embed PostgREST
- [ ] Escritas no cliente checam `error` (RLS pode falhar em silêncio)

## 4. Entitlements por plano (módulo gateável)
- [ ] Serviço no catálogo `servicos` + incluível no plano (`plano_servicos`)
- [ ] Definir se é `padrao` (sempre liberado) ou gateável
- [ ] Gate `empresa_libera_recurso(empresa, recurso)` em todas as write policies de **autoria** (incl. `*_admin_empresa`); tickets via policy `restrictive` de insert
- [ ] Não gatear operação viva (execução, finalizar→plano)
- [ ] Contratação / upgrade / **downgrade** documentado no `/biz`

## 5. Ciclo de billing (carência)
- [ ] Se tem **criação de registro novo**: entra no gate `empresa_pode_criar` (policy `restrictive` de insert) + botão desabilitado via `SessionContext.faseAssinatura`
- [ ] Operação/execução NÃO entra (carência não estrangula operação)

## 6. Migration & Deploy
- [ ] Migration em `supabase/migrations/` (commit `db(...)` separado)
- [ ] **Aplicada no SQL Editor de prod** (o deploy do Railway NÃO aplica migrations)
- [ ] **Backfill** p/ empresas/perfis existentes (ninguém perde acesso no deploy)

## 7. Mobile & UX
- [ ] Cabeçalhos com vários botões: `flex-wrap`
- [ ] Cards de listagem: empilhar no mobile (`flex-col sm:flex-row`)
- [ ] Seleções longas: `<select>` nativo (respeita a tela)
- [ ] Descrição do cabeçalho oculta no mobile (`hidden sm:block`)
- [ ] Botão de novo registro = só "+ Novo" / "+ Nova"

## 8. Testes
- [ ] `npx vitest run` verde
- [ ] `tsc --noEmit` sem erros
- [ ] Teste de **gating** (plano sem o serviço → módulo bloqueia autoria; operação/leitura ok)
- [ ] Mexeu no billing? Rodar o teste reversível do ciclo de bloqueio

---

### Furos reais que motivaram este checklist (2026-07-09)
1. `tarefas` existia em `permissoes` + RLS, mas faltava no `permissoes.ts` → sumido do construtor de perfil e do editor de serviços.
2. Backfill `is_system = true` deu permissões de usuários ao perfil **Operação** por engano.
3. `perfis.publico` do Operação nasceu `false` (coluna criada após o seed).
4. Ações `criar`/`excluir` de **padrão** ficaram inertes (RLS só checava `editar`).

Fontes vivas das regras: `/biz`, `/db`, `/security`, `/arch`.
