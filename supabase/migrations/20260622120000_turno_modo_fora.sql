-- ============================================================
-- Turnos: modo de comportamento FORA do horário do turno.
--
-- Antes, o turno só suprimia notificações de moderação (WhatsApp)
-- fora do horário. Agora cada turno escolhe UM entre 3 modos:
--
--   'notificacao' (padrão) — fora do turno NÃO recebe notificação
--                            WhatsApp; acessa e usa o sistema normal.
--                            (preserva o comportamento histórico)
--   'login'                — fora do turno NÃO consegue logar; quem já
--                            está logado continua. Notificações normais.
--   'aviso'                — fora do turno só vê um aviso ("fora do seu
--                            horário"); não bloqueia nada.
--
-- Isenções do bloqueio de login: admin de sistema e admin da empresa.
-- ============================================================

alter table turnos
  add column if not exists modo_fora_turno text not null default 'notificacao'
    check (modo_fora_turno in ('notificacao', 'login', 'aviso'));

-- ── Recebe notificação agora? ────────────────────────────────
-- false só quando: tem turno ativo com modo 'notificacao' e está
-- fora dele agora. Demais modos (login/aviso) não suprimem envio.
create or replace function usuario_recebe_notificacao(p_usuario_id uuid, p_momento timestamptz default now())
returns boolean language sql stable as $$
  select not exists (
    select 1
    from turnos t
    join usuarios u on u.turno_id = t.id
    where u.id = p_usuario_id
      and t.ativo
      and t.modo_fora_turno = 'notificacao'
      and not usuario_esta_no_turno(p_usuario_id, p_momento)
  );
$$;

-- ── Pode acessar (login) agora? ──────────────────────────────
-- false só quando: tem turno ativo com modo 'login', está fora dele
-- agora, e NÃO é admin de sistema nem admin da empresa do turno.
create or replace function usuario_pode_acessar(p_usuario_id uuid, p_momento timestamptz default now())
returns boolean language sql stable security definer
set search_path = public as $$
  select not exists (
    select 1
    from turnos t
    join usuarios u on u.turno_id = t.id
    where u.id = p_usuario_id
      and t.ativo
      and t.modo_fora_turno = 'login'
      and not usuario_esta_no_turno(p_usuario_id, p_momento)
      and not is_admin_sistema()
      and not is_admin_empresa(t.empresa_id)
  );
$$;

-- ── Deve mostrar aviso de fora-do-turno? ─────────────────────
-- true quando: tem turno ativo com modo 'aviso' e está fora agora.
create or replace function usuario_deve_avisar_turno(p_usuario_id uuid, p_momento timestamptz default now())
returns boolean language sql stable as $$
  select exists (
    select 1
    from turnos t
    join usuarios u on u.turno_id = t.id
    where u.id = p_usuario_id
      and t.ativo
      and t.modo_fora_turno = 'aviso'
      and not usuario_esta_no_turno(p_usuario_id, p_momento)
  );
$$;

grant execute on function usuario_recebe_notificacao(uuid, timestamptz) to authenticated, service_role;
grant execute on function usuario_pode_acessar(uuid, timestamptz)       to authenticated, service_role;
grant execute on function usuario_deve_avisar_turno(uuid, timestamptz)  to authenticated, service_role;
