-- ============================================================
-- CheckFlow — Foundation Schema v1
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type status_empresa as enum ('ativo', 'inativo', 'pendente', 'bloqueada');
create type status_geral   as enum ('ativo', 'inativo');
create type ambiente_tipo  as enum ('gestao', 'operacao');

-- ============================================================
-- EMPRESAS
-- ============================================================
create table empresas (
  id            uuid primary key default uuid_generate_v4(),
  nome          text not null,
  cnpj          text unique,
  logo_url      text,
  status        status_empresa not null default 'pendente',
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

-- ============================================================
-- UNIDADES
-- ============================================================
create table unidades (
  id            uuid primary key default uuid_generate_v4(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,
  status        status_geral not null default 'ativo',
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

-- ============================================================
-- GRUPOS
-- ============================================================
create table grupos (
  id            uuid primary key default uuid_generate_v4(),
  unidade_id    uuid not null references unidades(id) on delete cascade,
  nome          text not null,
  display_name  text,        -- nome customizado na tela (setor, distrito, etc.)
  descricao     text,
  status        status_geral not null default 'ativo',
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

-- ============================================================
-- SUBGRUPOS
-- ============================================================
create table subgrupos (
  id            uuid primary key default uuid_generate_v4(),
  grupo_id      uuid not null references grupos(id) on delete cascade,
  nome          text not null,
  display_name  text,        -- nome customizado na tela (área, loja, etc.)
  descricao     text,
  status        status_geral not null default 'ativo',
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

-- ============================================================
-- USUARIOS (profile vinculado ao Supabase Auth)
-- ============================================================
create table usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null,
  email           text not null unique,
  cpf             text unique,
  telefone        text,
  foto_url        text,
  status          status_geral not null default 'ativo',
  primeiro_acesso boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- ============================================================
-- PERFIS (por empresa; empresa_id null = plataforma)
-- ============================================================
create table perfis (
  id          uuid primary key default uuid_generate_v4(),
  empresa_id  uuid references empresas(id) on delete cascade,
  nome        text not null,
  descricao   text,
  is_system   boolean not null default false, -- perfis padrão não podem ser deletados
  criado_em   timestamptz not null default now()
);

-- Perfis padrão da plataforma
insert into perfis (id, empresa_id, nome, descricao, is_system) values
  ('00000000-0000-0000-0000-000000000001', null, 'Admin de sistema', 'Acesso total à plataforma', true),
  ('00000000-0000-0000-0000-000000000002', null, 'Admin da empresa',  'Acesso total dentro de uma empresa', true),
  ('00000000-0000-0000-0000-000000000003', null, 'Operação',          'Acesso apenas ao ambiente de operação', true);

-- ============================================================
-- PERMISSOES (cresce conforme novas telas/funções são criadas)
-- ============================================================
create table permissoes (
  id        uuid primary key default uuid_generate_v4(),
  recurso   text not null,  -- ex: 'empresas', 'grupos', 'checklists'
  acao      text not null,  -- ex: 'ver', 'criar', 'editar', 'deletar'
  descricao text,
  unique (recurso, acao)
);

-- Permissões iniciais
insert into permissoes (recurso, acao, descricao) values
  ('empresas',  'ver',     'Visualizar empresas'),
  ('empresas',  'criar',   'Criar empresas'),
  ('empresas',  'editar',  'Editar empresas'),
  ('empresas',  'deletar', 'Deletar empresas'),
  ('unidades',  'ver',     'Visualizar unidades'),
  ('unidades',  'criar',   'Criar unidades'),
  ('unidades',  'editar',  'Editar unidades'),
  ('unidades',  'deletar', 'Deletar unidades'),
  ('grupos',    'ver',     'Visualizar grupos'),
  ('grupos',    'criar',   'Criar grupos'),
  ('grupos',    'editar',  'Editar grupos'),
  ('grupos',    'deletar', 'Deletar grupos'),
  ('subgrupos', 'ver',     'Visualizar subgrupos'),
  ('subgrupos', 'criar',   'Criar subgrupos'),
  ('subgrupos', 'editar',  'Editar subgrupos'),
  ('subgrupos', 'deletar', 'Deletar subgrupos'),
  ('usuarios',  'ver',     'Visualizar usuários'),
  ('usuarios',  'criar',   'Criar usuários'),
  ('usuarios',  'editar',  'Editar usuários'),
  ('usuarios',  'deletar', 'Deletar usuários'),
  ('perfis',    'ver',     'Visualizar perfis'),
  ('perfis',    'criar',   'Criar perfis'),
  ('perfis',    'editar',  'Editar perfis'),
  ('perfis',    'deletar', 'Deletar perfis');

-- ============================================================
-- PERFIL_PERMISSOES
-- ============================================================
create table perfil_permissoes (
  perfil_id    uuid not null references perfis(id) on delete cascade,
  permissao_id uuid not null references permissoes(id) on delete cascade,
  primary key (perfil_id, permissao_id)
);

-- ============================================================
-- USUARIO_EMPRESA (usuário ↔ empresa com perfil)
-- ============================================================
create table usuario_empresa (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  perfil_id  uuid not null references perfis(id),
  criado_em  timestamptz not null default now(),
  primary key (usuario_id, empresa_id)
);

-- ============================================================
-- USUARIO_UNIDADE
-- ============================================================
create table usuario_unidade (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  unidade_id uuid not null references unidades(id) on delete cascade,
  primary key (usuario_id, unidade_id)
);

-- ============================================================
-- USUARIO_GRUPO
-- ============================================================
create table usuario_grupo (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  grupo_id   uuid not null references grupos(id) on delete cascade,
  primary key (usuario_id, grupo_id)
);

-- ============================================================
-- USUARIO_SUBGRUPO
-- ============================================================
create table usuario_subgrupo (
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  subgrupo_id uuid not null references subgrupos(id) on delete cascade,
  primary key (usuario_id, subgrupo_id)
);

-- ============================================================
-- SESSAO_USUARIO (última sessão para restaurar no login)
-- ============================================================
create table sessao_usuario (
  usuario_id        uuid primary key references usuarios(id) on delete cascade,
  ultimo_ambiente   ambiente_tipo not null default 'gestao',
  ultima_empresa_id uuid references empresas(id) on delete set null,
  ultima_unidade_id uuid references unidades(id) on delete set null,
  atualizado_em     timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index on unidades(empresa_id);
create index on grupos(unidade_id);
create index on subgrupos(grupo_id);
create index on perfis(empresa_id);
create index on usuario_empresa(usuario_id);
create index on usuario_empresa(empresa_id);
create index on usuario_unidade(usuario_id);
create index on usuario_grupo(usuario_id);
create index on usuario_subgrupo(usuario_id);
