-- ============================================================
-- Períodos de turno (equipes rotativas em escalas tipo 12x36)
--
-- Cada turno de tipo 'escala' pode ter N períodos nomeados,
-- separados por offset_horas a partir do ponto zero do ciclo.
-- Ex: 12x36 → 4 períodos com offset 0h, 12h, 24h, 36h.
--
-- O usuário é vinculado ao turno (modelo) E ao período (equipe),
-- permitindo perguntas como "quem é o líder do Turno 2?".
-- ============================================================

create table turno_periodos (
  id           uuid primary key default gen_random_uuid(),
  turno_id     uuid not null references turnos(id) on delete cascade,
  nome         text not null,
  offset_horas numeric not null default 0,
  ordem        smallint not null default 0,
  constraint turno_periodos_unico unique (turno_id, ordem)
);

create index on turno_periodos(turno_id);

-- Vínculo opcional: qual período (equipe) o usuário pertence
alter table usuarios
  add column if not exists turno_periodo_id uuid references turno_periodos(id) on delete set null;

-- ============================================================
-- RLS
-- ============================================================
alter table turno_periodos enable row level security;

create policy "turno_periodos_leitura" on turno_periodos for select using (
  exists (
    select 1 from turnos t
    join usuario_empresa ue on ue.empresa_id = t.empresa_id
    where t.id = turno_periodos.turno_id and ue.usuario_id = auth.uid()
  )
  or is_admin_sistema()
);

create policy "turno_periodos_escrita" on turno_periodos for all using (
  exists (
    select 1 from turnos t
    join usuario_empresa ue on ue.empresa_id = t.empresa_id
    where t.id = turno_periodos.turno_id and ue.usuario_id = auth.uid()
  )
  or is_admin_sistema()
) with check (
  exists (
    select 1 from turnos t
    join usuario_empresa ue on ue.empresa_id = t.empresa_id
    where t.id = turno_periodos.turno_id and ue.usuario_id = auth.uid()
  )
  or is_admin_sistema()
);

-- ============================================================
-- Atualiza usuario_esta_no_turno() para usar o offset do período
-- ============================================================
create or replace function usuario_esta_no_turno(p_usuario_id uuid, p_momento timestamptz default now())
returns boolean language plpgsql stable as $$
declare
  v_turno         turnos%rowtype;
  v_offset_horas  numeric := 0;
  v_dia           smallint;
  v_hora_local    time;
  v_dia_cfg       jsonb;
  v_inicio        time;
  v_fim           time;
  v_data_ref      date;
  v_hora_ini      time;
  v_horas_trab    numeric;
  v_horas_folga   numeric;
  v_inicio_ts     timestamptz;
  v_ciclo_horas   numeric;
  v_minutos_desde numeric;
  v_pos_no_ciclo  numeric;
begin
  select t.* into v_turno
  from turnos t
  join usuarios u on u.turno_id = t.id
  where u.id = p_usuario_id and t.ativo;

  if not found then return true; end if;

  -- Offset do período (equipe) do usuário — zero se não atribuído a nenhum período
  select coalesce(tp.offset_horas, 0) into v_offset_horas
  from usuarios u
  left join turno_periodos tp on tp.id = u.turno_periodo_id
  where u.id = p_usuario_id;

  -- ── Turno administrativo: horário por dia da semana ──────────
  if v_turno.tipo = 'administrativo' then
    v_dia        := extract(dow from p_momento)::smallint;
    v_hora_local := p_momento::time;

    select d into v_dia_cfg
    from jsonb_array_elements(coalesce(v_turno.config->'dias', '[]'::jsonb)) d
    where (d->>'dia')::smallint = v_dia
    limit 1;

    if v_dia_cfg is null then return false; end if;

    v_inicio := (v_dia_cfg->>'inicio')::time;
    v_fim    := (v_dia_cfg->>'fim')::time;

    if v_inicio <= v_fim then
      return v_hora_local >= v_inicio and v_hora_local < v_fim;
    else
      return v_hora_local >= v_inicio or v_hora_local < v_fim;
    end if;
  end if;

  -- ── Turno de escala: ciclo rotativo trabalho/folga ───────────
  if v_turno.tipo = 'escala' then
    v_data_ref    := (v_turno.config->>'data_referencia')::date;
    v_hora_ini    := coalesce((v_turno.config->>'hora_inicio')::time, '00:00'::time);
    v_horas_trab  := coalesce((v_turno.config->>'horas_trabalho')::numeric, 12);
    v_horas_folga := coalesce((v_turno.config->>'horas_folga')::numeric, 36);

    if v_data_ref is null then return true; end if;

    v_ciclo_horas := v_horas_trab + v_horas_folga;
    if v_ciclo_horas <= 0 then return true; end if;

    -- Aplica o offset do período: desloca o ponto zero do ciclo desta equipe
    v_inicio_ts := (v_data_ref::timestamp + v_hora_ini)
                   + (v_offset_horas * interval '1 hour');

    v_minutos_desde := extract(epoch from (p_momento - v_inicio_ts)) / 60.0;
    if v_minutos_desde < 0 then return false; end if;

    v_pos_no_ciclo := mod(v_minutos_desde / 60.0, v_ciclo_horas);
    return v_pos_no_ciclo < v_horas_trab;
  end if;

  return true;
end;
$$;

-- ============================================================
-- Atualiza seed para criar períodos no 12x36 automático
-- ============================================================
create or replace function seed_turnos_padrao(p_empresa_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_turno_id uuid;
begin
  if exists (select 1 from turnos where empresa_id = p_empresa_id) then
    return;
  end if;

  insert into turnos (empresa_id, nome, tipo, config, hora_inicio, hora_fim)
  values (
    p_empresa_id, 'Administrativo', 'administrativo',
    '{"dias":[{"dia":1,"inicio":"08:00","fim":"17:00"},{"dia":2,"inicio":"08:00","fim":"17:00"},{"dia":3,"inicio":"08:00","fim":"17:00"},{"dia":4,"inicio":"08:00","fim":"17:00"},{"dia":5,"inicio":"08:00","fim":"17:00"}]}'::jsonb,
    '08:00', '17:00'
  );

  insert into turnos (empresa_id, nome, tipo, config, hora_inicio, hora_fim)
  values (
    p_empresa_id, '12x36', 'escala',
    '{"data_referencia":"2026-01-01","hora_inicio":"07:00","horas_trabalho":12,"horas_folga":36}'::jsonb,
    '07:00', '19:00'
  )
  returning id into v_turno_id;

  -- 4 equipes do 12x36: offset = índice × 12h
  insert into turno_periodos (turno_id, nome, offset_horas, ordem) values
    (v_turno_id, 'Turno 1', 0,  1),
    (v_turno_id, 'Turno 2', 12, 2),
    (v_turno_id, 'Turno 3', 24, 3),
    (v_turno_id, 'Turno 4', 36, 4);
end;
$$;

-- ============================================================
-- Backfill: adiciona períodos ao 12x36 das empresas existentes
-- ============================================================
do $$
declare
  r record;
begin
  for r in
    select t.id
    from turnos t
    where t.tipo = 'escala' and t.nome = '12x36'
      and not exists (select 1 from turno_periodos tp where tp.turno_id = t.id)
  loop
    insert into turno_periodos (turno_id, nome, offset_horas, ordem) values
      (r.id, 'Turno 1', 0,  1),
      (r.id, 'Turno 2', 12, 2),
      (r.id, 'Turno 3', 24, 3),
      (r.id, 'Turno 4', 36, 4);
  end loop;
end;
$$;
