-- ============================================================
-- CHECKLISTS — Módulo completo
-- ============================================================

-- Modelo do checklist
create table checklists (
  id            uuid primary key default uuid_generate_v4(),
  unidade_id    uuid references unidades(id) on delete cascade,
  subgrupo_id   uuid references subgrupos(id) on delete set null,
  nome          text not null,
  descricao     text,
  versao_atual  integer not null default 0,  -- 0 = nunca publicado
  status        text not null default 'rascunho'
                check (status in ('rascunho', 'publicado', 'inativo')),
  criado_por    uuid references usuarios(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Versões publicadas (snapshots imutáveis)
create table checklist_versoes (
  id              uuid primary key default uuid_generate_v4(),
  checklist_id    uuid not null references checklists(id) on delete cascade,
  numero_versao   integer not null,
  snapshot        jsonb not null,  -- cópia completa do checklist nessa versão
  publicado_por   uuid references usuarios(id) on delete set null,
  publicado_em    timestamptz not null default now(),
  unique (checklist_id, numero_versao)
);

-- Seções do checklist
create table checklist_secoes (
  id           uuid primary key default uuid_generate_v4(),
  checklist_id uuid not null references checklists(id) on delete cascade,
  nome         text not null,
  ordem        integer not null default 0,
  criado_em    timestamptz not null default now()
);

-- Atividades
create table checklist_atividades (
  id              uuid primary key default uuid_generate_v4(),
  checklist_id    uuid not null references checklists(id) on delete cascade,
  secao_id        uuid references checklist_secoes(id) on delete set null,
  nome            text not null,
  descricao       text,
  tipo            text not null check (tipo in (
                    'sim_nao',
                    'numero',
                    'texto',
                    'multipla_escolha',
                    'catalogo',
                    'foto',
                    'assinatura',
                    'data_hora',
                    'localizacao'
                  )),
  ordem           integer not null default 0,
  obrigatoria     boolean not null default true,
  critica         boolean not null default false,  -- se reprovada → reprova o checklist

  -- Dependência condicional
  atividade_pai_id  uuid references checklist_atividades(id) on delete cascade,
  valor_gatilho     text,  -- valor da resposta que ativa esta atividade

  -- Configurações específicas por tipo (jsonb)
  -- sim_nao:         { "esperado": "sim" | "nao" }
  -- numero:          { "min": 0, "max": 100, "unidade": "°C" }
  -- texto:           { "mascara": "", "qrcode": false, "barcode": false }
  -- multipla_escolha:{ "multipla": false }
  -- catalogo:        { "catalogo_id": "uuid" }
  -- localizacao:     { "lat": -23.5, "lng": -46.6, "raio_metros": 100 }
  -- data_hora:       { "automatico": true }
  config            jsonb not null default '{}',

  -- Plano de ação
  gera_plano_acao   boolean not null default false,

  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

-- Opções da atividade Múltipla escolha
create table checklist_atividade_opcoes (
  id           uuid primary key default uuid_generate_v4(),
  atividade_id uuid not null references checklist_atividades(id) on delete cascade,
  label        text not null,
  valor        text not null,
  ordem        integer not null default 0,
  e_valido     boolean not null default true,  -- se selecionado = aprovado na validação
  criado_em    timestamptz not null default now()
);

-- Indexes
create index on checklists(unidade_id);
create index on checklists(subgrupo_id);
create index on checklist_versoes(checklist_id);
create index on checklist_secoes(checklist_id);
create index on checklist_atividades(checklist_id);
create index on checklist_atividades(secao_id);
create index on checklist_atividades(atividade_pai_id);
create index on checklist_atividade_opcoes(atividade_id);

-- RLS
alter table checklists                enable row level security;
alter table checklist_versoes         enable row level security;
alter table checklist_secoes          enable row level security;
alter table checklist_atividades      enable row level security;
alter table checklist_atividade_opcoes enable row level security;

create policy "checklists_admin"   on checklists                for all    using (is_admin_sistema());
create policy "checklists_leitura" on checklists                for select using (true);
create policy "versoes_admin"      on checklist_versoes         for all    using (is_admin_sistema());
create policy "versoes_leitura"    on checklist_versoes         for select using (true);
create policy "secoes_admin"       on checklist_secoes          for all    using (is_admin_sistema());
create policy "secoes_leitura"     on checklist_secoes          for select using (true);
create policy "atividades_admin"   on checklist_atividades      for all    using (is_admin_sistema());
create policy "atividades_leitura" on checklist_atividades      for select using (true);
create policy "opcoes_admin"       on checklist_atividade_opcoes for all   using (is_admin_sistema());
create policy "opcoes_leitura"     on checklist_atividade_opcoes for select using (true);
