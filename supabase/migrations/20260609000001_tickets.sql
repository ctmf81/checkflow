-- ============================================================
-- TICKETS — sistema de chamados / ocorrências
-- ============================================================
-- Entidade independente de planos_acao. Abrível por qualquer
-- usuário autenticado, endereçado a grupo+subgrupo (obrigatórios).
-- Fluxo: aberto → em_tratamento → aguardando_informacao ↔
--   em_tratamento → aguardando_validacao → fechado (corrigido/
--   nao_corrigido/corrigido_parcialmente/cancelado/improcedente).
-- Cada transição gera um evento imutável na timeline.

-- ─── Tipos ────────────────────────────────────────────────────

create type ticket_status as enum (
  'aberto',
  'em_tratamento',
  'aguardando_informacao',
  'aguardando_validacao',
  'corrigido',
  'nao_corrigido',
  'corrigido_parcialmente',
  'cancelado',
  'improcedente'
);

create type ticket_prioridade as enum ('critica', 'alta', 'media', 'baixa');

create type ticket_evento_tipo as enum (
  'abertura',
  'aceite',
  'comentario',
  'devolucao',
  'resposta_devolucao',
  'transferencia',
  'conclusao_proposta',   -- assignee propõe fechamento
  'validacao',            -- abridor valida (corrigido/nao_corrigido/parcial)
  'reabertura',
  'cancelamento',
  'improcedencia',
  'escalada'
);

-- ─── Categorias (árvore por unidade, self-ref) ────────────────

create table ticket_categorias (
  id          uuid primary key default uuid_generate_v4(),
  unidade_id  uuid not null references unidades(id) on delete cascade,
  nome        text not null,
  pai_id      uuid references ticket_categorias(id) on delete set null,
  e_generica  boolean not null default false,  -- "Sem categoria" gerada automaticamente
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users(id) on delete set null
);

-- Garante no máximo uma categoria genérica por unidade
create unique index ticket_categorias_unica_generica
  on ticket_categorias(unidade_id) where e_generica = true;

-- ─── SLA config (por unidade + categoria + prioridade) ────────

create table ticket_sla_config (
  id                    uuid primary key default uuid_generate_v4(),
  unidade_id            uuid not null references unidades(id) on delete cascade,
  categoria_id          uuid references ticket_categorias(id) on delete cascade,
  prioridade            ticket_prioridade not null,
  tempo_aceite_min      integer not null default 60,      -- minutos para aceite
  tempo_resolucao_min   integer not null default 480,     -- minutos para resolução
  unique (unidade_id, categoria_id, prioridade)
);

-- ─── Tickets ──────────────────────────────────────────────────

create table tickets (
  id                    uuid primary key default uuid_generate_v4(),
  unidade_id            uuid not null references unidades(id) on delete cascade,
  grupo_id              uuid not null references grupos(id) on delete restrict,
  subgrupo_id           uuid not null references subgrupos(id) on delete restrict,
  categoria_id          uuid references ticket_categorias(id) on delete set null,

  titulo                text not null,
  descricao             text not null,
  prioridade            ticket_prioridade not null default 'media',
  status                ticket_status not null default 'aberto',

  aberto_por_id         uuid not null references auth.users(id) on delete restrict,
  assignee_id           uuid references auth.users(id) on delete set null,

  -- SLA
  sla_deadline_at       timestamptz,           -- calculado no insert via trigger
  sla_pausado_em        timestamptz,           -- timestamp em que entrou em pausa
  sla_segundos_pausados integer not null default 0,  -- acumulado de pausas

  -- Origem (para rastrear se foi aberto dentro de uma execução)
  execucao_id           uuid references checklist_execucoes(id) on delete set null,

  -- Número sequencial legível (ex: #00042)
  numero                integer,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- Número sequencial por unidade
create sequence ticket_numero_seq;
create or replace function tickets_set_numero()
returns trigger language plpgsql as $$
begin
  if new.numero is null then
    new.numero := nextval('ticket_numero_seq');
  end if;
  return new;
end;
$$;
create trigger trg_tickets_numero
  before insert on tickets
  for each row execute function tickets_set_numero();

-- SLA: calcula deadline no insert buscando config da categoria/prioridade
create or replace function tickets_set_sla()
returns trigger language plpgsql security definer as $$
declare
  v_min integer;
begin
  -- busca config específica da categoria primeiro, depois genérica da unidade
  select tempo_resolucao_min into v_min
  from ticket_sla_config
  where unidade_id = new.unidade_id
    and prioridade = new.prioridade
    and (categoria_id = new.categoria_id or categoria_id is null)
  order by categoria_id nulls last
  limit 1;

  if v_min is not null then
    new.sla_deadline_at := now() + (v_min || ' minutes')::interval;
  end if;
  return new;
end;
$$;
create trigger trg_tickets_sla
  before insert on tickets
  for each row execute function tickets_set_sla();

-- atualizado_em automático
create or replace function tickets_set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger trg_tickets_updated_at
  before update on tickets
  for each row execute function tickets_set_atualizado_em();

-- Pausa/retoma SLA automaticamente por status
create or replace function tickets_gerenciar_sla_pausa()
returns trigger language plpgsql as $$
begin
  -- Entra em pausa: aguardando_informacao
  if new.status = 'aguardando_informacao' and old.status <> 'aguardando_informacao' then
    new.sla_pausado_em := now();

  -- Sai da pausa: volta para em_tratamento
  elsif old.status = 'aguardando_informacao' and new.status = 'em_tratamento' then
    if old.sla_pausado_em is not null then
      new.sla_segundos_pausados := old.sla_segundos_pausados
        + extract(epoch from (now() - old.sla_pausado_em))::integer;
    end if;
    new.sla_pausado_em := null;
  end if;
  return new;
end;
$$;
create trigger trg_tickets_sla_pausa
  before update on tickets
  for each row execute function tickets_gerenciar_sla_pausa();

-- ─── Timeline de eventos (imutável) ───────────────────────────

create table ticket_eventos (
  id              uuid primary key default uuid_generate_v4(),
  ticket_id       uuid not null references tickets(id) on delete cascade,
  tipo            ticket_evento_tipo not null,
  autor_id        uuid not null references auth.users(id) on delete restrict,
  texto           text not null,                        -- obrigatório em toda transição
  -- para transferência: guarda destino anterior e novo
  meta            jsonb,
  criado_em       timestamptz not null default now()
);

-- Imutável: bloqueia UPDATE e DELETE
create rule ticket_eventos_no_update as on update to ticket_eventos do instead nothing;
create rule ticket_eventos_no_delete as on delete to ticket_eventos do instead nothing;

-- ─── Evidências (por evento ou na abertura) ───────────────────

create table ticket_evidencias (
  id          uuid primary key default uuid_generate_v4(),
  ticket_id   uuid not null references tickets(id) on delete cascade,
  evento_id   uuid references ticket_eventos(id) on delete set null,
  url         text not null,
  tipo        text not null check (tipo in ('foto', 'video', 'documento')),
  nome        text,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  criado_em   timestamptz not null default now()
);

-- ─── Permissões ───────────────────────────────────────────────

insert into permissoes (recurso, acao, descricao) values
  ('ticket', 'ver',              'Visualizar tickets'),
  ('ticket', 'criar',            'Abrir novos tickets'),
  ('ticket', 'tratar',           'Assumir e tratar tickets'),
  ('ticket', 'cancelar',         'Cancelar / marcar improcedente'),
  ('ticket', 'categorias_gerir', 'Gerenciar categorias de tickets')
on conflict do nothing;

-- Concede todas as permissões ao perfil is_system da empresa
insert into perfil_permissoes (perfil_id, permissao_id)
select p.id, pm.id
from perfis p
join permissoes pm on pm.recurso = 'ticket'
where p.is_system = true
on conflict do nothing;

-- ─── Categoria genérica automática por unidade ────────────────
-- Criada via função para ser chamada quando uma unidade é inserida
-- ou sob demanda ao abrir o primeiro ticket de uma unidade sem categorias.
create or replace function garantir_categoria_generica(p_unidade_id uuid)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  select id into v_id from ticket_categorias
  where unidade_id = p_unidade_id and e_generica = true;
  if v_id is null then
    insert into ticket_categorias (unidade_id, nome, e_generica)
    values (p_unidade_id, 'Sem categoria', true)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- ─── Índices ──────────────────────────────────────────────────

create index idx_tickets_unidade      on tickets(unidade_id);
create index idx_tickets_grupo        on tickets(grupo_id);
create index idx_tickets_subgrupo     on tickets(subgrupo_id);
create index idx_tickets_status       on tickets(status);
create index idx_tickets_assignee     on tickets(assignee_id);
create index idx_tickets_aberto_por   on tickets(aberto_por_id);
create index idx_ticket_eventos_ticket on ticket_eventos(ticket_id);
create index idx_ticket_evidencias_ticket on ticket_evidencias(ticket_id);

-- ─── RLS ──────────────────────────────────────────────────────

alter table ticket_categorias   enable row level security;
alter table ticket_sla_config   enable row level security;
alter table tickets             enable row level security;
alter table ticket_eventos      enable row level security;
alter table ticket_evidencias   enable row level security;

-- ticket_categorias: leitura por qualquer usuário da unidade
create policy "ticket_categorias_leitura" on ticket_categorias
  for select using (
    exists (
      select 1 from usuario_unidades uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = ticket_categorias.unidade_id
    )
  );
create policy "ticket_categorias_escrita" on ticket_categorias
  for all using (
    is_admin_sistema() or usuario_tem_permissao('ticket', 'categorias_gerir')
  );

-- ticket_sla_config: mesmo padrão de categorias
create policy "ticket_sla_leitura" on ticket_sla_config
  for select using (
    exists (
      select 1 from usuario_unidades uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = ticket_sla_config.unidade_id
    )
  );
create policy "ticket_sla_escrita" on ticket_sla_config
  for all using (
    is_admin_sistema() or usuario_tem_permissao('ticket', 'categorias_gerir')
  );

-- tickets: leitura por qualquer usuário da unidade
create policy "tickets_leitura" on tickets
  for select using (
    exists (
      select 1 from usuario_unidades uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = tickets.unidade_id
    )
  );
-- criar: qualquer autenticado da unidade
create policy "tickets_criar" on tickets
  for insert with check (
    exists (
      select 1 from usuario_unidades uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = tickets.unidade_id
    )
  );
-- atualizar: assignee, quem abriu (para validação), ou admin
create policy "tickets_atualizar" on tickets
  for update using (
    auth.uid() = assignee_id
    or auth.uid() = aberto_por_id
    or is_admin_sistema()
    or usuario_tem_permissao('ticket', 'tratar')
  );

-- ticket_eventos: leitura por usuários da unidade do ticket
create policy "ticket_eventos_leitura" on ticket_eventos
  for select using (
    exists (
      select 1 from tickets t
      join usuario_unidades uu on uu.unidade_id = t.unidade_id
      where t.id = ticket_eventos.ticket_id and uu.usuario_id = auth.uid()
    )
  );
create policy "ticket_eventos_inserir" on ticket_eventos
  for insert with check (
    exists (
      select 1 from tickets t
      join usuario_unidades uu on uu.unidade_id = t.unidade_id
      where t.id = ticket_eventos.ticket_id and uu.usuario_id = auth.uid()
    )
  );

-- ticket_evidencias: mesma regra
create policy "ticket_evidencias_leitura" on ticket_evidencias
  for select using (
    exists (
      select 1 from tickets t
      join usuario_unidades uu on uu.unidade_id = t.unidade_id
      where t.id = ticket_evidencias.ticket_id and uu.usuario_id = auth.uid()
    )
  );
create policy "ticket_evidencias_inserir" on ticket_evidencias
  for insert with check (
    exists (
      select 1 from tickets t
      join usuario_unidades uu on uu.unidade_id = t.unidade_id
      where t.id = ticket_evidencias.ticket_id and uu.usuario_id = auth.uid()
    )
  );
