-- Tempo de guarda nos checklists (em meses)
alter table checklists
  add column if not exists tempo_guarda_meses integer not null default 12;

-- Tabela de execuções de checklist
create table if not exists checklist_execucoes (
  id              uuid primary key default gen_random_uuid(),
  checklist_id    uuid not null references checklists(id) on delete cascade,
  unidade_id      uuid not null references unidades(id),
  executado_por   uuid references auth.users(id),
  data_execucao   timestamptz not null default now(),
  data_expiracao  date,
  status          text not null default 'em_andamento' check (status in ('em_andamento','concluido','nao_executado')),
  observacoes     text,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_execucoes_checklist  on checklist_execucoes(checklist_id);
create index if not exists idx_execucoes_unidade    on checklist_execucoes(unidade_id);
create index if not exists idx_execucoes_expiracao  on checklist_execucoes(data_expiracao);

alter table checklist_execucoes enable row level security;

create policy "execucoes_unidade" on checklist_execucoes
  for all using (
    unidade_id in (
      select unidade_id from usuario_unidades
      where usuario_id = auth.uid()
    )
  );
