-- Documentos (POP, IT, Consulta Inteligente)
create table documentos (
  id               uuid primary key default uuid_generate_v4(),
  unidade_id       uuid references unidades(id) on delete cascade,
  grupo_id         uuid references grupos(id) on delete set null,
  subgrupo_id      uuid references subgrupos(id) on delete set null,
  nome             text not null,
  descricao        text,
  tipo             text not null check (tipo in ('pop','it','consulta_inteligente')),
  norma_referencia text,
  status           text not null default 'ativo',
  criado_por       uuid references usuarios(id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

-- Etapas dos documentos POP e IT
create table documento_etapas (
  id           uuid primary key default uuid_generate_v4(),
  documento_id uuid not null references documentos(id) on delete cascade,
  titulo       text,
  conteudo     text,
  video_id     text,   -- ID do YouTube
  ordem        integer not null default 0,
  criado_em    timestamptz not null default now()
);

-- Imagens de cada etapa (carrossel)
create table etapa_imagens (
  id        uuid primary key default uuid_generate_v4(),
  etapa_id  uuid not null references documento_etapas(id) on delete cascade,
  url       text not null,
  ordem     integer not null default 0
);

create index on documentos(unidade_id);
create index on documentos(grupo_id);
create index on documento_etapas(documento_id);
create index on etapa_imagens(etapa_id);

-- RLS
alter table documentos       enable row level security;
alter table documento_etapas enable row level security;
alter table etapa_imagens    enable row level security;

create policy "documentos_admin"   on documentos       for all using (is_admin_sistema());
create policy "etapas_admin"       on documento_etapas for all using (is_admin_sistema());
create policy "imagens_admin"      on etapa_imagens    for all using (is_admin_sistema());

create policy "documentos_leitura" on documentos       for select using (true);
create policy "etapas_leitura"     on documento_etapas for select using (true);
create policy "imagens_leitura"    on etapa_imagens    for select using (true);
