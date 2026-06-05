-- Catálogos (estrutura)
create table catalogos (
  id           uuid primary key default uuid_generate_v4(),
  unidade_id   uuid references unidades(id) on delete cascade,
  nome         text not null,
  descricao    text,
  campo_chave  text not null,           -- ex: "Código do Produto"
  atributo_1   text,                    -- ex: "Nome do Produto"
  atributo_2   text,
  atributo_3   text,
  atributo_4   text,
  status       text not null default 'ativo',
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Valores do catálogo
create table catalogo_valores (
  id           uuid primary key default uuid_generate_v4(),
  catalogo_id  uuid not null references catalogos(id) on delete cascade,
  valor_chave  text not null,
  atributo_1   text,
  atributo_2   text,
  atributo_3   text,
  atributo_4   text,
  imagem_url   text,
  criado_em    timestamptz not null default now()
);

create index on catalogos(unidade_id);
create index on catalogo_valores(catalogo_id);
create index on catalogo_valores(valor_chave);

alter table catalogos        enable row level security;
alter table catalogo_valores enable row level security;

create policy "catalogos_admin"   on catalogos        for all    using (is_admin_sistema());
create policy "catalogos_leitura" on catalogos        for select using (true);
create policy "valores_admin"     on catalogo_valores for all    using (is_admin_sistema());
create policy "valores_leitura"   on catalogo_valores for select using (true);
