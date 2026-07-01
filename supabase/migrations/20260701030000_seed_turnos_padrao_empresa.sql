-- Cria 2 turnos padrão em cada nova empresa: "Administrativo" e "12x36".
-- Segue o mesmo padrão de trg_empresa_gestao_grupo_seed / trg_empresa_notif_seed.

create or replace function seed_turnos_padrao(p_empresa_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Idempotente: não recria se a empresa já tem turnos.
  if exists (select 1 from turnos where empresa_id = p_empresa_id) then
    return;
  end if;

  -- Turno 1: Administrativo — seg a sex, 08h às 17h
  insert into turnos (empresa_id, nome, tipo, config, hora_inicio, hora_fim) values (
    p_empresa_id,
    'Administrativo',
    'administrativo',
    '{"dias":[{"dia":1,"inicio":"08:00","fim":"17:00"},{"dia":2,"inicio":"08:00","fim":"17:00"},{"dia":3,"inicio":"08:00","fim":"17:00"},{"dia":4,"inicio":"08:00","fim":"17:00"},{"dia":5,"inicio":"08:00","fim":"17:00"}]}'::jsonb,
    '08:00', '17:00'
  );

  -- Turno 2: 12x36 — escala rotativa, referência 2026-01-01 07h
  insert into turnos (empresa_id, nome, tipo, config, hora_inicio, hora_fim) values (
    p_empresa_id,
    '12x36',
    'escala',
    '{"data_referencia":"2026-01-01","hora_inicio":"07:00","horas_trabalho":12,"horas_folga":36}'::jsonb,
    '07:00', '19:00'
  );
end;
$$;

-- Trigger: semeia ao criar nova empresa
create or replace function trg_seed_turnos_empresa()
returns trigger language plpgsql security definer as $$
begin
  perform seed_turnos_padrao(new.id);
  return new;
end;
$$;

drop trigger if exists trg_empresa_turnos_seed on empresas;
create trigger trg_empresa_turnos_seed
  after insert on empresas
  for each row execute function trg_seed_turnos_empresa();

-- Backfill: empresas existentes que ainda não têm turnos
do $$
declare r record;
begin
  for r in select id from empresas loop
    perform seed_turnos_padrao(r.id);
  end loop;
end;
$$;
