-- ============================================================
-- Ciclo de bloqueio — fase 2: bloquear CRIAÇÃO fora do período ativo (carência)
-- ============================================================
-- Em carência/bloqueada (empresa_pode_criar = false), a empresa não cria itens
-- NOVOS: checklists, listas de tarefas e tickets. Usa policies RESTRICTIVE só de
-- INSERT — fazem AND com todas as permissivas de insert, cobrindo qualquer
-- caminho (operador, gestor, admin da empresa) sem recriar as policies
-- existentes. admin de SISTEMA passa (plataforma).
--
-- NÃO se bloqueia (operação continua na carência):
--   • execução de checklist (checklist_execucoes) e respostas
--   • planos de ação (nascem no finalizar da execução)
--   • tratar/movimentar tickets já abertos
--   • setup automático de empresa nova (rotas com service role ignoram RLS)
-- Opt-in: empresa sem assinatura / plano pago → empresa_pode_criar = true.

drop policy if exists "checklists_criar_periodo" on checklists;
create policy "checklists_criar_periodo" on checklists
  as restrictive for insert
  with check (
    is_admin_sistema()
    or empresa_pode_criar((select u.empresa_id from unidades u where u.id = checklists.unidade_id))
  );

drop policy if exists "tarefa_listas_criar_periodo" on tarefa_listas;
create policy "tarefa_listas_criar_periodo" on tarefa_listas
  as restrictive for insert
  with check (
    is_admin_sistema()
    or empresa_pode_criar((select u.empresa_id from unidades u where u.id = tarefa_listas.unidade_id))
  );

drop policy if exists "tickets_criar_periodo" on tickets;
create policy "tickets_criar_periodo" on tickets
  as restrictive for insert
  with check (
    is_admin_sistema()
    or empresa_pode_criar((select u.empresa_id from unidades u where u.id = tickets.unidade_id))
  );
