-- ============================================================
-- Turnos: define janelas de horário em que um usuário está
-- "de plantão". Usado para NÃO disparar mensagens de moderação
-- (WhatsApp) para quem está fora do turno.
--
-- Dois tipos suportados:
--  • administrativo — horário fixo por dia da semana
--    (ex: seg–sex 08–17h, sábado 08–11h)
--  • escala         — ciclo rotativo trabalho/folga a partir de
--    uma data de referência (ex: 12x36: 12h trabalho, 36h folga)
--
-- Importante: o turno restringe APENAS o envio de mensagens —
-- o usuário continua aparecendo como moderador N1/N2 normalmente
-- (pode acessar e moderar planos de ação a qualquer momento).
-- ============================================================

create table if not exists turnos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,                 -- ex: "Comercial", "Escala 12x36"
  tipo          text not null check (tipo in ('administrativo', 'escala')),

  -- tipo = 'administrativo'
  -- config: { "dias": [ { "dia": 1, "inicio": "08:00", "fim": "17:00" }, ... ] }
  --   dia: 0=domingo .. 6=sábado. Cada dia pode ter horário próprio
  --   (ex: sábado com janela menor). Dias ausentes = sem expediente.
  --
  -- tipo = 'escala'
  -- config: { "data_referencia": "2026-01-01", "hora_inicio": "07:00",
  --           "horas_trabalho": 12, "horas_folga": 36 }
  --   A partir de data_referencia + hora_inicio, alterna ciclos de
  --   trabalho/folga continuamente (ex: 12x36, 24x48, etc).
  config        jsonb not null default '{}'::jsonb,

  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_turnos_empresa on turnos(empresa_id);

-- Vínculo opcional do usuário a um turno (1 turno por usuário)
alter table usuarios
  add column if not exists turno_id uuid references turnos(id) on delete set null;

create index if not exists idx_usuarios_turno on usuarios(turno_id);

-- ============================================================
-- Função: usuário está dentro do seu turno agora?
-- Sem turno associado => sempre "dentro" (não restringe ninguém
-- que não tenha configurado turno).
-- ============================================================
create or replace function usuario_esta_no_turno(p_usuario_id uuid, p_momento timestamptz default now())
returns boolean language plpgsql stable as $$
declare
  v_turno         turnos%rowtype;
  v_dia           smallint;
  v_hora_local    time;
  v_dia_cfg       jsonb;
  v_inicio        time;
  v_fim           time;
  -- escala
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

  -- Sem turno (ou turno inativo): não restringe
  if not found then
    return true;
  end if;

  -- ── Turno administrativo: horário por dia da semana ──
  if v_turno.tipo = 'administrativo' then
    v_dia        := extract(dow from p_momento)::smallint; -- 0=domingo
    v_hora_local := p_momento::time;

    select d into v_dia_cfg
    from jsonb_array_elements(coalesce(v_turno.config->'dias', '[]'::jsonb)) d
    where (d->>'dia')::smallint = v_dia
    limit 1;

    if v_dia_cfg is null then
      return false; -- dia sem expediente configurado
    end if;

    v_inicio := (v_dia_cfg->>'inicio')::time;
    v_fim    := (v_dia_cfg->>'fim')::time;

    if v_inicio <= v_fim then
      return v_hora_local >= v_inicio and v_hora_local < v_fim;
    else
      return v_hora_local >= v_inicio or v_hora_local < v_fim; -- vira a noite
    end if;
  end if;

  -- ── Turno de escala: ciclo rotativo trabalho/folga (ex: 12x36) ──
  if v_turno.tipo = 'escala' then
    v_data_ref    := (v_turno.config->>'data_referencia')::date;
    v_hora_ini    := coalesce((v_turno.config->>'hora_inicio')::time, '00:00'::time);
    v_horas_trab  := coalesce((v_turno.config->>'horas_trabalho')::numeric, 12);
    v_horas_folga := coalesce((v_turno.config->>'horas_folga')::numeric, 36);

    if v_data_ref is null then
      return true; -- config incompleta: não restringe
    end if;

    v_inicio_ts   := (v_data_ref::timestamp + v_hora_ini);
    v_ciclo_horas := v_horas_trab + v_horas_folga;

    if v_ciclo_horas <= 0 then
      return true;
    end if;

    v_minutos_desde := extract(epoch from (p_momento - v_inicio_ts)) / 60.0;
    if v_minutos_desde < 0 then
      return false; -- escala ainda não começou
    end if;

    -- Posição dentro do ciclo atual, em horas
    v_pos_no_ciclo := mod(v_minutos_desde / 60.0, v_ciclo_horas);

    return v_pos_no_ciclo < v_horas_trab;
  end if;

  return true;
end;
$$;

-- ── RLS ──────────────────────────────────────────────────────
alter table turnos enable row level security;

drop policy if exists "turnos_leitura" on turnos;
create policy "turnos_leitura" on turnos for select using (
  is_admin_sistema()
  or empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
);

drop policy if exists "turnos_escrita" on turnos;
create policy "turnos_escrita" on turnos for all using (
  is_admin_sistema()
  or empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
) with check (
  is_admin_sistema()
  or empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
);
