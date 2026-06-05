create table causa_raiz (
  id            uuid primary key default uuid_generate_v4(),
  unidade_id    uuid references unidades(id) on delete cascade,
  grupo_id      uuid references grupos(id) on delete set null,
  subgrupo_id   uuid references subgrupos(id) on delete set null,
  documento_id  uuid references documentos(id) on delete set null,
  nome          text not null,
  observacoes   text,
  status        text not null default 'ativo',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index on causa_raiz(unidade_id);

alter table causa_raiz enable row level security;
create policy "causa_raiz_admin"   on causa_raiz for all    using (is_admin_sistema());
create policy "causa_raiz_leitura" on causa_raiz for select using (true);
