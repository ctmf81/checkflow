alter table nao_execucao_motivos
  add column if not exists tipo text not null default 'checklist'
  check (tipo in ('checklist', 'atividade'));
