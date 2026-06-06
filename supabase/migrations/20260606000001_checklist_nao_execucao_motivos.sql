-- Junction table: quais motivos de não execução se aplicam a cada checklist
create table checklist_nao_execucao_motivos (
  checklist_id uuid not null references checklists(id) on delete cascade,
  motivo_id    uuid not null references nao_execucao_motivos(id) on delete cascade,
  primary key (checklist_id, motivo_id)
);

create index on checklist_nao_execucao_motivos(checklist_id);

alter table checklist_nao_execucao_motivos enable row level security;
create policy "checklist_nao_exec_admin"   on checklist_nao_execucao_motivos for all    using (is_admin_sistema());
create policy "checklist_nao_exec_leitura" on checklist_nao_execucao_motivos for select using (true);
create policy "checklist_nao_exec_write"   on checklist_nao_execucao_motivos for all    using (true);
