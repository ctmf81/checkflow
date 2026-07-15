-- ============================================================
-- Férias do usuário — não recebe notificações durante o período
-- ============================================================
-- O gestor informa um período de férias (início/fim) na gestão de usuários.
-- Durante esse período, o usuário NÃO recebe notificação (WhatsApp/e-mail),
-- reusando a função que o turno já usa: usuario_recebe_notificacao.

alter table usuarios
  add column if not exists ferias_inicio date,
  add column if not exists ferias_fim    date;

-- Recebe notificação? NÃO quando:
--   • está dentro do período de férias (datas inclusivas), OU
--   • tem turno ativo modo 'notificacao' e está fora do turno agora (regra existente).
create or replace function usuario_recebe_notificacao(p_usuario_id uuid, p_momento timestamptz default now())
returns boolean language sql stable as $$
  select
    -- Férias
    not exists (
      select 1 from usuarios u
      where u.id = p_usuario_id
        and u.ferias_inicio is not null and u.ferias_fim is not null
        and (p_momento at time zone 'UTC')::date between u.ferias_inicio and u.ferias_fim
    )
    -- Turno (modo notificacao, fora do horário)
    and not exists (
      select 1
      from turnos t
      join usuarios u on u.turno_id = t.id
      where u.id = p_usuario_id
        and t.ativo
        and t.modo_fora_turno = 'notificacao'
        and not usuario_esta_no_turno(p_usuario_id, p_momento)
    );
$$;
