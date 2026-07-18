-- Função SÓ de férias (o `usuario_recebe_notificacao` combina férias + turno).
-- Precisamos checar férias isoladamente porque a regra é diferente por canal:
--   • Férias  → suprime TODOS os canais (WhatsApp, e-mail, push), TODOS os eventos.
--   • Turno   → suprime só WhatsApp/push (e-mail passa), e só onde já se aplicava.
-- Sem esta função, o e-mail e o ticket_movimentado escapavam durante as férias.

create or replace function usuario_esta_de_ferias(p_usuario_id uuid, p_momento timestamptz default now())
returns boolean language sql stable as $$
  select exists (
    select 1 from usuarios u
    where u.id = p_usuario_id
      and u.ferias_inicio is not null and u.ferias_fim is not null
      and (p_momento at time zone 'UTC')::date between u.ferias_inicio and u.ferias_fim
  );
$$;
