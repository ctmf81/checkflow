-- ============================================================
-- PLANO DE AÇÃO
-- Migration: 20260606000008_plano_acao.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. SLA na atividade (gera_plano_acao já existe)
-- ------------------------------------------------------------
alter table checklist_atividades
  add column if not exists plano_acao_sla_horas integer null;
-- null = sem SLA

-- ------------------------------------------------------------
-- 2. Função do usuário no subgrupo
-- ------------------------------------------------------------
alter table usuario_subgrupo
  add column if not exists funcao text null
    check (funcao is null or funcao in ('operacao', 'nivel_1', 'nivel_2'));
-- null  = só visualiza
-- operacao = executa checklists da área
-- nivel_1  = executa + modera planos de ação
-- nivel_2  = executa + modera como N1 + modera escalados

-- ------------------------------------------------------------
-- 3. Planos de ação (cabeçalho)
-- ------------------------------------------------------------
create table if not exists planos_acao (
  id                             uuid primary key default gen_random_uuid(),
  unidade_id                     uuid not null references unidades(id),
  subgrupo_id                    uuid not null references subgrupos(id),
  checklist_execucao_id          uuid not null references checklist_execucoes(id),
  checklist_execucao_resposta_id uuid not null references checklist_execucao_respostas(id),
  atividade_id                   uuid not null references checklist_atividades(id),
  status                         text not null default 'em_moderacao_n1'
                                   check (status in (
                                     'em_moderacao_n1',
                                     'em_moderacao_n2',
                                     'corrigido',
                                     'nao_corrigido'
                                   )),
  observacao_abertura            text,
  sla_prazo                      timestamptz null,   -- calculado na abertura: now() + sla_horas
  criado_por                     uuid not null references usuarios(id),
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create index if not exists idx_planos_acao_unidade   on planos_acao(unidade_id);
create index if not exists idx_planos_acao_subgrupo  on planos_acao(subgrupo_id);
create index if not exists idx_planos_acao_status    on planos_acao(status);
create index if not exists idx_planos_acao_resposta  on planos_acao(checklist_execucao_resposta_id);

-- ------------------------------------------------------------
-- 4. Evidências da abertura (foto ou vídeo)
-- ------------------------------------------------------------
create table if not exists plano_acao_evidencias (
  id             uuid primary key default gen_random_uuid(),
  plano_acao_id  uuid not null references planos_acao(id) on delete cascade,
  tipo           text not null check (tipo in ('foto', 'video')),
  url            text not null,
  ordem          integer not null default 0,
  created_at     timestamptz not null default now()
);
-- Regra de negócio: máx 1 vídeo por plano — enforced na UI

create index if not exists idx_plano_acao_evidencias on plano_acao_evidencias(plano_acao_id);

-- ------------------------------------------------------------
-- 5. Movimentações (trilha de auditoria de moderação)
-- ------------------------------------------------------------
create table if not exists plano_acao_movimentacoes (
  id             uuid primary key default gen_random_uuid(),
  plano_acao_id  uuid not null references planos_acao(id) on delete cascade,
  usuario_id     uuid not null references usuarios(id),
  acao           text not null check (acao in (
                   'aberto',
                   'enviado_n2',
                   'devolvido_n1',
                   'corrigido',
                   'nao_corrigido',
                   'reaberto'
                 )),
  observacao     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_plano_mov_plano on plano_acao_movimentacoes(plano_acao_id);

-- ------------------------------------------------------------
-- 6. Evidências das movimentações (N1/N2 podem anexar fotos/vídeo)
-- ------------------------------------------------------------
create table if not exists plano_acao_movimentacao_evidencias (
  id               uuid primary key default gen_random_uuid(),
  movimentacao_id  uuid not null references plano_acao_movimentacoes(id) on delete cascade,
  tipo             text not null check (tipo in ('foto', 'video')),
  url              text not null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_plano_mov_ev on plano_acao_movimentacao_evidencias(movimentacao_id);

-- ------------------------------------------------------------
-- 7. Trigger: atualiza updated_at em planos_acao
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_planos_acao_updated_at on planos_acao;
create trigger trg_planos_acao_updated_at
  before update on planos_acao
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- 8. RLS
-- ------------------------------------------------------------
alter table planos_acao                      enable row level security;
alter table plano_acao_evidencias            enable row level security;
alter table plano_acao_movimentacoes         enable row level security;
alter table plano_acao_movimentacao_evidencias enable row level security;

-- Visibilidade: usuário vê planos dos subgrupos aos quais pertence
drop policy if exists "planos_acao_leitura"   on planos_acao;
create policy "planos_acao_leitura" on planos_acao for select using (
  is_admin_sistema()
  or subgrupo_id in (
    select subgrupo_id from usuario_subgrupo
    where usuario_id = auth.uid()
  )
);

-- Insert: qualquer membro do subgrupo pode abrir um plano
drop policy if exists "planos_acao_insert"    on planos_acao;
create policy "planos_acao_insert" on planos_acao for insert with check (
  is_admin_sistema()
  or subgrupo_id in (
    select subgrupo_id from usuario_subgrupo
    where usuario_id = auth.uid()
  )
);

-- Update de status: enforced na aplicação; no banco, membro do subgrupo pode atualizar
drop policy if exists "planos_acao_update"    on planos_acao;
create policy "planos_acao_update" on planos_acao for update using (
  is_admin_sistema()
  or subgrupo_id in (
    select subgrupo_id from usuario_subgrupo
    where usuario_id = auth.uid()
  )
);

-- Evidências abertura
drop policy if exists "plano_ev_leitura"      on plano_acao_evidencias;
create policy "plano_ev_leitura" on plano_acao_evidencias for select using (
  plano_acao_id in (select id from planos_acao)
);
drop policy if exists "plano_ev_insert"       on plano_acao_evidencias;
create policy "plano_ev_insert" on plano_acao_evidencias for insert with check (
  plano_acao_id in (select id from planos_acao)
);

-- Movimentações
drop policy if exists "plano_mov_leitura"     on plano_acao_movimentacoes;
create policy "plano_mov_leitura" on plano_acao_movimentacoes for select using (
  plano_acao_id in (select id from planos_acao)
);
drop policy if exists "plano_mov_insert"      on plano_acao_movimentacoes;
create policy "plano_mov_insert" on plano_acao_movimentacoes for insert with check (
  plano_acao_id in (select id from planos_acao)
);

-- Evidências das movimentações
drop policy if exists "plano_mov_ev_leitura"  on plano_acao_movimentacao_evidencias;
create policy "plano_mov_ev_leitura" on plano_acao_movimentacao_evidencias for select using (
  movimentacao_id in (select id from plano_acao_movimentacoes)
);
drop policy if exists "plano_mov_ev_insert"   on plano_acao_movimentacao_evidencias;
create policy "plano_mov_ev_insert" on plano_acao_movimentacao_evidencias for insert with check (
  movimentacao_id in (select id from plano_acao_movimentacoes)
);
