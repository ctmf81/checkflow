-- ============================================================
-- 1) Guarda: impedir inativar checklist usado em workflow
--    publicado (evita estágios "presos" para sempre)
-- ============================================================

create or replace function checklist_bloquear_inativacao_em_uso()
returns trigger language plpgsql as $$
declare
  v_count integer;
begin
  if new.status = 'inativo' and old.status != 'inativo' then
    select count(*) into v_count
    from workflow_estagio_itens wei
    join workflow_estagios we on we.id = wei.estagio_id
    join workflows w on w.id = we.workflow_id
    where wei.checklist_id = new.id
      and w.status = 'publicado';

    if v_count > 0 then
      raise exception
        'Não é possível inativar este checklist: ele está em uso em % workflow(s) publicado(s). Remova-o do(s) workflow(s) ou inative o workflow primeiro.',
        v_count;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checklist_bloquear_inativacao on checklists;
create trigger trg_checklist_bloquear_inativacao
  before update on checklists
  for each row execute function checklist_bloquear_inativacao_em_uso();

-- ============================================================
-- 2) Agendamentos — início programado de workflows e checklists
--    Recorrência personalizada: a cada X horas / dias / meses,
--    sempre a partir de uma data/hora de referência.
-- ============================================================

create table if not exists agendamentos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references empresas(id) on delete cascade,
  unidade_id          uuid not null references unidades(id) on delete cascade,
  tipo_alvo           text not null check (tipo_alvo in ('workflow','checklist')),
  workflow_id         uuid references workflows(id) on delete cascade,
  checklist_id        uuid references checklists(id) on delete cascade,
  -- Recorrência
  intervalo_unidade   text not null check (intervalo_unidade in ('horas','dias','meses')),
  intervalo_valor     integer not null check (intervalo_valor > 0),
  referencia_inicio   timestamptz not null,   -- data/hora de referência para o 1º disparo
  proxima_execucao    timestamptz not null,   -- calculado: próximo disparo agendado
  ativo               boolean not null default true,
  ultima_execucao_em  timestamptz,
  criado_por          uuid references usuarios(id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),

  constraint agendamento_alvo_valido check (
    (tipo_alvo = 'workflow'  and workflow_id  is not null and checklist_id is null)
    or
    (tipo_alvo = 'checklist' and checklist_id is not null and workflow_id  is null)
  )
);

create index if not exists idx_agendamentos_proxima on agendamentos(proxima_execucao) where ativo;
create index if not exists idx_agendamentos_unidade  on agendamentos(unidade_id);
create index if not exists idx_agendamentos_empresa  on agendamentos(empresa_id);

-- Recalcula a próxima execução com base no intervalo + referência
create or replace function agendamento_calcular_proxima(
  p_referencia timestamptz,
  p_unidade    text,
  p_valor      integer,
  p_a_partir_de timestamptz default now()
) returns timestamptz language plpgsql immutable as $$
declare
  v_step interval;
  v_next timestamptz;
begin
  v_step := case p_unidade
    when 'horas' then make_interval(hours => p_valor)
    when 'dias'  then make_interval(days  => p_valor)
    when 'meses' then make_interval(months=> p_valor)
  end;

  v_next := p_referencia;
  -- Avança a partir da referência até passar do "agora" (ou do ponto pedido)
  while v_next <= p_a_partir_de loop
    v_next := v_next + v_step;
  end loop;

  return v_next;
end;
$$;

-- Recalcula proxima_execucao automaticamente ao inserir/alterar config
create or replace function agendamento_set_proxima()
returns trigger language plpgsql as $$
begin
  if new.referencia_inicio > now() then
    new.proxima_execucao := new.referencia_inicio;
  else
    new.proxima_execucao := agendamento_calcular_proxima(
      new.referencia_inicio, new.intervalo_unidade, new.intervalo_valor, now()
    );
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_agendamento_set_proxima on agendamentos;
create trigger trg_agendamento_set_proxima
  before insert or update of referencia_inicio, intervalo_unidade, intervalo_valor
  on agendamentos
  for each row execute function agendamento_set_proxima();

-- Processa agendamentos vencidos: dispara workflow_iniciar ou cria checklist_execucao,
-- e empurra proxima_execucao para a próxima ocorrência.
create or replace function agendamentos_processar()
returns integer language plpgsql security definer as $$
declare
  rec     record;
  v_count integer := 0;
begin
  for rec in
    select * from agendamentos
    where ativo and proxima_execucao <= now()
    for update skip locked
  loop
    if rec.tipo_alvo = 'workflow' then
      perform workflow_iniciar(rec.workflow_id, rec.unidade_id, rec.criado_por);
    else
      insert into checklist_execucoes (checklist_id, unidade_id, executado_por, status)
      values (rec.checklist_id, rec.unidade_id, rec.criado_por, 'em_andamento');
    end if;

    update agendamentos
    set ultima_execucao_em = now(),
        proxima_execucao   = agendamento_calcular_proxima(
                               referencia_inicio, intervalo_unidade, intervalo_valor, now()
                             )
    where id = rec.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── RLS ──────────────────────────────────────────────────────

alter table agendamentos enable row level security;

drop policy if exists "agendamentos_leitura" on agendamentos;
create policy "agendamentos_leitura" on agendamentos for select using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

drop policy if exists "agendamentos_escrita" on agendamentos;
create policy "agendamentos_escrita" on agendamentos for all using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
) with check (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

-- Nota: agende a chamada periódica de agendamentos_processar() via
-- pg_cron (ex.: select cron.schedule('agendamentos', '*/5 * * * *',
-- 'select agendamentos_processar()');) ou via rotina externa (Railway cron).
