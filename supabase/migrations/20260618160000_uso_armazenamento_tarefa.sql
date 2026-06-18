-- ============================================================
-- Mídia das Listas de Tarefas passa a contar na cota de armazenamento:
--  1) adiciona 'tarefa' aos valores válidos de uso_armazenamento.origem
--  2) permite o admin de sistema registrar uso (não tem usuario_empresa)
-- ============================================================

alter table uso_armazenamento drop constraint if exists uso_armazenamento_origem_check;
alter table uso_armazenamento
  add constraint uso_armazenamento_origem_check
  check (origem in ('execucao', 'ticket', 'pdf', 'tarefa'));

drop policy if exists "uso_armazenamento_inserir" on uso_armazenamento;
create policy "uso_armazenamento_inserir" on uso_armazenamento
  for insert with check (
    is_admin_sistema()
    or exists (
      select 1 from usuario_empresa ue
      where ue.usuario_id = auth.uid() and ue.empresa_id = uso_armazenamento.empresa_id
    )
  );
