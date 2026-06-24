# Plano de Smoke Tests — CheckFlow

Roteiro de testes de fumaça por tela/funcionalidade, focado no que foi revisado/alterado
na rodada 2026-06-22/24 (PRs #47–#57). Marque ✅/❌ e anote o que falhar.

**Legenda de papel:** AS = Admin de Sistema · AE = Admin da Empresa · N1/N2 = moderador do subgrupo · OP = operador comum.

> ⚠️ **Pré-requisito de ambiente:** `INTERNAL_API_SECRET` setado com o **mesmo valor** nos serviços **api** e **web** do Railway. Sem isso o reset de senha quebra.

---

## 0. Automatizado (já verde em 2026-06-23 — reexecutar quando mexer no código)
- [ ] `cd apps/web && npm run build` → compila todas as rotas.
- [ ] `cd apps/web && npx vitest run` → 311/311.
- [ ] `node pentest/causa-raiz-rls.mjs` (creds dos `.env`) → 7/7.

---

## 1. Acessos → Perfis
- [ ] **(AE) Editar perfil existente e salvar** → reabrir e conferir que as **permissões NÃO zeraram** (bug crítico corrigido) e o "público" continua certo.
- [ ] **(AE) Criar perfil** com algumas permissões → aparece na lista; nome duplicado é bloqueado.
- [ ] **(AE) Excluir perfil** sem usuários → some. Com usuários atribuídos → bloqueia com aviso.

## 2. Acessos → Usuários
- [ ] **(AS) "Logar como"** um usuário → cai logado no ambiente dele.
- [ ] **(AE) Adicionar usuário com CPF já existente** (de outra empresa) → entra em **"modo vínculo"** (dados pessoais read-only, botão "Vincular à empresa").
- [ ] **(AE) Criar usuário novo** → recebe código de 1º acesso.
- [ ] **(AE) Inativar** um usuário → some da lista; o usuário perde acesso.
- [ ] **(sem permissão) chamar** `/api/usuarios/inativar` direto sem token → **401** (era IDOR).

## 3. Acessos → Empresa
- [ ] **(AE) Editar nome/CNPJ** → salva com toast.
- [ ] **(AE) Inativar uma unidade** (ícone ⏻) → vira inativa (NÃO apaga a árvore de dados). Não há mais hard-delete.

## 4. Acessos → Turnos
- [ ] **(AE) Criar turno "Bloquear login"** e vincular a um OP → fora do horário o OP **não loga**; AS/AE entram normalmente.
- [ ] Turno "Só avisar" → fora do horário aparece **banner** dispensável.
- [ ] Turno "Só notificação" → fora do horário não recebe WhatsApp de moderação.
- [ ] **Editar** turno mantém os dados.

## 5. Padrão (Variáveis / Padrões / Criar)
- [ ] **(AE) Criar variável** com valores → salva.
- [ ] **(AE) Criar padrão** combinando variáveis + instância (faixa min/max) → salva; combinação duplicada é bloqueada.
- [ ] **(OP) Executar checklist** com atividade tipo padrão → escolhe valores, digita número → valida pela faixa da instância.
- [ ] Editar variável/padrão não perde valores/instâncias.

## 6. Causa Raiz
- [ ] **(AE) Cadastro** (`Config → Causa Raiz`): cascata Grupo→Subgrupo→Checklist→**Campo** — o campo só lista atividades **com validação**. Nome obrigatório.
- [ ] **(N1/N2) Execução**: reprovar atividade que gera plano → no "Abrir Plano de Ação" aparece a **seção Causa raiz** (dropdown + "+ Nova" + observação + últimas ocorrências).
- [ ] **(OP) Execução**: a seção de causa raiz **NÃO** aparece.
- [ ] **(N1/N2) Moderação** (`/gestao/planos-acao/[id]`): bloco Causa raiz mostra a causa do plano, permite registrar, e lista **"Recorrência neste campo"**.

## 7. Configurações
- [ ] **Não-execução**: criar motivo → **setor obrigatório** (Selecione/Todos/específico). Editar motivo escopado a subgrupo **não perde** o subgrupo.
- [ ] **Formatação**: mudar rótulo de grupo/subgrupo → salvar mostra toast e o rótulo muda no app.
- [ ] **Notificações**: editar template e salvar → toast. Sem empresa selecionada → "Nenhuma empresa selecionada" (não trava).
- [ ] **Catálogos / Documentos**: criar/editar/duplicar; test-api (import) exige usuário logado.

## 8. Plano (billing)
- [ ] **(AE)** abre e mostra uso/planos/pacotes/cobranças.
- [ ] Sem empresa selecionada → **"Nenhuma empresa selecionada"** (não trava em "Carregando…").
- [ ] Ao assinar/comprar pacote → abre a fatura; se o popup for bloqueado, aparece o banner **"abra a fatura aqui"**.
- [ ] **(OP)** → "Acesso restrito".

## 9. Tickets / Chamados
- [ ] **Listagem**: cards de resumo, filtros (aberto/tratamento/finalizados/todos), busca, semáforo SLA. Sem unidade → "Nenhuma unidade selecionada".
- [ ] **Detalhe**: aceitar → tratar → (devolver p/ informação) → concluir/validar; **transferir** p/ outro grupo/subgrupo; reabrir. Observação obrigatória + evidências.
- [ ] Ação sem permissão → mensagem clara (sem expor erro técnico).
- [ ] **Categorias** e **Config. SLA** abrem e salvam.

## 10. 🔴 Segurança (crítico)
- [ ] **Reset de senha** (`/recuperar-senha`): informar CPF → **código chega por WhatsApp/e-mail**. *(Se não chegar → `INTERNAL_API_SECRET` divergente entre api/web.)*
- [ ] **Primeiro acesso** (CPF + código de boas-vindas → definir senha).
- [ ] **Notificações** de ticket/plano disparam (WhatsApp/e-mail).
- [ ] **(AS) WhatsApp** (`/sistema/whatsapp`): status/conectar funciona.
- [ ] Rota interna sem credencial (ex.: `POST /catalogos/test-api` via curl sem header) → **401**.

## 11. Workflows — ⏳ AINDA NÃO REVISADO (revisar tela a tela antes do smoke)
- [ ] `/gestao/workflows` lista; criar/editar workflow (`[id]`); publicar/iniciar; acompanhar execuções. (Estava marcado `off`/pendente de teste — revisar primeiro.)

---

### Itens de backlog (não são smoke)
- Causa raiz nos **indicadores** (top causas / recorrência por área).
- Revisão completa da tela **Plano** (só os bugs foram corrigidos, não a revisão tela-a-tela).
