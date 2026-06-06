-- ============================================================
-- WORKFLOWS — pipeline de checklists com estágios sequenciais
-- ============================================================

-- Campo resultado na execução (necessário para o motor)
alter table checklist_execucoes
  add column if not exists resultado text check (resultado in ('aprovado','reprovado'));

-- Workflow (pertence à empresa, transversal às unidades)
create table if not exists workflows (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,
  descricao     text,
  status        text not null default 'rascunho'
                check (status in ('rascunho','publicado','inativo')),
  criado_por    uuid references usuarios(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Estágios ordenados (sequenciais entre si)
create table if not exists workflow_estagios (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     uuid not null references workflows(id) on delete cascade,
  nome            text not null,
  ordem           integer not null default 0,
  condicao_avanco text not null default 'todos_aprovados'
                  check (condicao_avanco in ('todos_aprovados','todos_concluidos','qualquer_aprovado')),
  criado_em       timestamptz not null default now()
);

-- Checklists dentro de cada estágio (executados em paralelo)
create table if not exists workflow_estagio_itens (
  id           uuid primary key default gen_random_uuid(),
  estagio_id   uuid not null references workflow_estagios(id) on delete cascade,
  checklist_id uuid not null references checklists(id) on delete cascade,
  subgrupo_id  uuid references subgrupos(id) on delete set null,
  obrigatorio  boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- Execução de uma instância do workflow
create table if not exists workflow_execucoes (
  id                  uuid primary key default gen_random_uuid(),
  workflow_id         uuid not null references workflows(id) on delete cascade,
  unidade_id          uuid not null references unidades(id),
  iniciado_por        uuid references usuarios(id) on delete set null,
  status              text not null default 'em_andamento'
                      check (status in ('em_andamento','concluido','bloqueado','cancelado')),
  estagio_atual_ordem integer not null default 1,
  iniciado_em         timestamptz not null default now(),
  concluido_em        timestamptz
);

-- Estado de cada item dentro de uma execução
create table if not exists workflow_item_execucoes (
  id                    uuid primary key default gen_random_uuid(),
  workflow_execucao_id  uuid not null references workflow_execucoes(id) on delete cascade,
  estagio_item_id       uuid not null references workflow_estagio_itens(id),
  checklist_execucao_id uuid references checklist_execucoes(id) on delete set null,
  status                text not null default 'bloqueado'
                        check (status in ('bloqueado','liberado','em_andamento','aprovado','reprovado','pulado')),
  executado_por         uuid references usuarios(id) on delete set null,
  liberado_em           timestamptz,
  iniciado_em           timestamptz,
  concluido_em          timestamptz
);

-- Indexes (IF NOT EXISTS disponível a partir do Postgres 9.5)
create index if not exists idx_workflows_empresa        on workflows(empresa_id);
create index if not exists idx_wf_estagios_workflow     on workflow_estagios(workflow_id, ordem);
create index if not exists idx_wf_itens_estagio         on workflow_estagio_itens(estagio_id);
create index if not exists idx_wf_exec_workflow         on workflow_execucoes(workflow_id);
create index if not exists idx_wf_exec_unidade_status   on workflow_execucoes(unidade_id, status);
create index if not exists idx_wf_item_exec_execucao    on workflow_item_execucoes(workflow_execucao_id);
create index if not exists idx_wf_item_exec_cl_exec     on workflow_item_execucoes(checklist_execucao_id);

-- ── RLS ──────────────────────────────────────────────────────

alter table workflows               enable row level security;
alter table workflow_estagios       enable row level security;
alter table workflow_estagio_itens  enable row level security;
alter table workflow_execucoes      enable row level security;
alter table workflow_item_execucoes enable row level security;

-- Drop antes de criar (idempotente)
drop policy if exists "workflows_admin"        on workflows;
drop policy if exists "workflows_leitura"      on workflows;
drop policy if exists "workflows_escrita"      on workflows;
drop policy if exists "workflows_update"       on workflows;
drop policy if exists "wf_estagios_leitura"    on workflow_estagios;
drop policy if exists "wf_estagios_escrita"    on workflow_estagios;
drop policy if exists "wf_itens_leitura"       on workflow_estagio_itens;
drop policy if exists "wf_itens_escrita"       on workflow_estagio_itens;
drop policy if exists "wf_exec_acesso"         on workflow_execucoes;
drop policy if exists "wf_item_exec_acesso"    on workflow_item_execucoes;

create policy "workflows_admin"   on workflows for all    using (is_admin_sistema());
create policy "workflows_leitura" on workflows for select using (
  empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
);
create policy "workflows_escrita" on workflows for insert with check (
  empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
);
create policy "workflows_update" on workflows for update using (
  empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
);

create policy "wf_estagios_leitura" on workflow_estagios for select using (
  workflow_id in (select id from workflows
    where empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid()))
);
create policy "wf_estagios_escrita" on workflow_estagios for all using (
  workflow_id in (select id from workflows
    where empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid()))
);

create policy "wf_itens_leitura" on workflow_estagio_itens for select using (
  estagio_id in (
    select ws.id from workflow_estagios ws
    join workflows w on w.id = ws.workflow_id
    where w.empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
  )
);
create policy "wf_itens_escrita" on workflow_estagio_itens for all using (
  estagio_id in (
    select ws.id from workflow_estagios ws
    join workflows w on w.id = ws.workflow_id
    where w.empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
  )
);

create policy "wf_exec_acesso" on workflow_execucoes for all using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

create policy "wf_item_exec_acesso" on workflow_item_execucoes for all using (
  is_admin_sistema()
  or workflow_execucao_id in (
    select id from workflow_execucoes
    where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);

-- ── Motor de avanço de estágio (Postgres) ────────────────────

create or replace function workflow_avaliar_avanco(p_execucao_id uuid)
returns void language plpgsql security definer as $$
declare
  v_exec        record;
  v_estagio     record;
  v_proximo     record;
  v_total_obrig integer;
  v_aprovados   integer;
  v_concluidos  integer;
begin
  select * into v_exec
  from workflow_execucoes where id = p_execucao_id for update;
  if not found or v_exec.status != 'em_andamento' then return; end if;

  select * into v_estagio
  from workflow_estagios
  where workflow_id = v_exec.workflow_id and ordem = v_exec.estagio_atual_ordem;
  if not found then return; end if;

  -- Contadores do estágio atual
  select
    count(*) filter (where wsi.obrigatorio),
    count(*) filter (where wsi.obrigatorio and wie.status = 'aprovado'),
    count(*) filter (where wsi.obrigatorio and wie.status in ('aprovado','reprovado','pulado'))
  into v_total_obrig, v_aprovados, v_concluidos
  from workflow_item_execucoes wie
  join workflow_estagio_itens wsi on wsi.id = wie.estagio_item_id
  where wie.workflow_execucao_id = p_execucao_id
    and wsi.estagio_id = v_estagio.id;

  -- Avalia condição de avanço
  case v_estagio.condicao_avanco
    when 'todos_aprovados' then
      if v_aprovados < v_total_obrig then
        if v_concluidos >= v_total_obrig then
          update workflow_execucoes set status = 'bloqueado' where id = p_execucao_id;
        end if;
        return;
      end if;
    when 'todos_concluidos' then
      if v_concluidos < v_total_obrig then return; end if;
    when 'qualquer_aprovado' then
      if v_aprovados = 0 then return; end if;
  end case;

  -- Busca próximo estágio
  select * into v_proximo
  from workflow_estagios
  where workflow_id = v_exec.workflow_id and ordem > v_exec.estagio_atual_ordem
  order by ordem limit 1;

  if not found then
    -- Último estágio: workflow concluído
    update workflow_execucoes
    set status = 'concluido', concluido_em = now()
    where id = p_execucao_id;
    return;
  end if;

  -- Avança
  update workflow_execucoes
  set estagio_atual_ordem = v_proximo.ordem
  where id = p_execucao_id;

  -- Libera itens do próximo estágio
  update workflow_item_execucoes wie
  set status = 'liberado', liberado_em = now()
  from workflow_estagio_itens wsi
  where wie.estagio_item_id = wsi.id
    and wie.workflow_execucao_id = p_execucao_id
    and wsi.estagio_id = v_proximo.id;
end;
$$;

-- Trigger: checklist concluído → atualiza item do workflow e avalia avanço
create or replace function workflow_on_checklist_concluido()
returns trigger language plpgsql security definer as $$
declare
  v_item record;
  v_resultado text;
begin
  if new.status != 'concluido' or old.status = 'concluido' then
    return new;
  end if;

  select * into v_item
  from workflow_item_execucoes
  where checklist_execucao_id = new.id
  limit 1;

  if not found then return new; end if;

  v_resultado := coalesce(new.resultado, 'aprovado');

  update workflow_item_execucoes
  set status       = v_resultado,
      concluido_em = now()
  where id = v_item.id;

  perform workflow_avaliar_avanco(v_item.workflow_execucao_id);

  return new;
end;
$$;

drop trigger if exists trg_workflow_checklist_concluido on checklist_execucoes;
create trigger trg_workflow_checklist_concluido
  after update on checklist_execucoes
  for each row execute function workflow_on_checklist_concluido();

-- Função auxiliar: inicia uma execução de workflow liberando o 1º estágio
create or replace function workflow_iniciar(p_workflow_id uuid, p_unidade_id uuid, p_usuario_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_exec_id     uuid;
  v_primeiro    record;
begin
  -- Cria a execução
  insert into workflow_execucoes (workflow_id, unidade_id, iniciado_por, estagio_atual_ordem)
  select p_workflow_id, p_unidade_id, p_usuario_id, min(ordem)
  from workflow_estagios where workflow_id = p_workflow_id
  returning id into v_exec_id;

  -- Cria todos os itens como bloqueados
  insert into workflow_item_execucoes (workflow_execucao_id, estagio_item_id, status)
  select v_exec_id, wei.id, 'bloqueado'
  from workflow_estagio_itens wei
  join workflow_estagios ws on ws.id = wei.estagio_id
  where ws.workflow_id = p_workflow_id;

  -- Libera apenas os itens do 1º estágio
  select * into v_primeiro
  from workflow_estagios
  where workflow_id = p_workflow_id
  order by ordem limit 1;

  update workflow_item_execucoes wie
  set status = 'liberado', liberado_em = now()
  from workflow_estagio_itens wsi
  where wie.estagio_item_id = wsi.id
    and wie.workflow_execucao_id = v_exec_id
    and wsi.estagio_id = v_primeiro.id;

  return v_exec_id;
end;
$$;
