-- ============================================================
-- FIX: admin de sistema não consegue abrir/responder uma lista de
-- tarefas. A policy de insert de `tarefa_execucoes` exigia vínculo
-- em usuario_unidade — que o admin de sistema não tem — bloqueando
-- a criação da instância. Adiciona bypass is_admin_sistema().
-- ============================================================

drop policy if exists "tarefa_exec_insert" on tarefa_execucoes;
create policy "tarefa_exec_insert" on tarefa_execucoes for insert with check (
  usuario_id = auth.uid()
  and (
    is_admin_sistema()
    or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);
