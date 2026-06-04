create table nao_execucao_motivos (
  id          uuid primary key default uuid_generate_v4(),
  unidade_id  uuid references unidades(id) on delete cascade,
  grupo_id    uuid references grupos(id) on delete set null,
  subgrupo_id uuid references subgrupos(id) on delete set null,
  descricao   text not null,
  status      text not null default 'ativo',
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index on nao_execucao_motivos(unidade_id);

alter table nao_execucao_motivos enable row level security;
create policy "nao_exec_admin"   on nao_execucao_motivos for all    using (is_admin_sistema());
create policy "nao_exec_leitura" on nao_execucao_motivos for select using (true);
