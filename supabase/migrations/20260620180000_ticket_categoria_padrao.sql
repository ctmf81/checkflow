-- ============================================================
-- Tickets — categoria padrão renomeada e RLS escopada por unidade.
--   A) Categoria genérica "Sem categoria" → "Não informada".
--   C) Escrita de categorias/SLA por PERMISSÃO ('ticket','categorias_gerir')
--      + escopo da UNIDADE (cada tela = unidade ativa). Antes a policy
--      não restringia unidade.
-- ============================================================

-- A) Renomeia a categoria padrão (função + dados existentes)
create or replace function garantir_categoria_generica(p_unidade_id uuid)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  select id into v_id from ticket_categorias
  where unidade_id = p_unidade_id and e_generica = true;
  if v_id is null then
    insert into ticket_categorias (unidade_id, nome, e_generica)
    values (p_unidade_id, 'Não informada', true)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

update ticket_categorias
  set nome = 'Não informada'
  where e_generica = true and nome = 'Sem categoria';

-- C) RLS de escrita por permissão + unidade
drop policy if exists "ticket_categorias_escrita" on ticket_categorias;
create policy "ticket_categorias_escrita" on ticket_categorias for all
  using (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('ticket', 'categorias_gerir')
    )
  )
  with check (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('ticket', 'categorias_gerir')
    )
  );

drop policy if exists "ticket_sla_escrita" on ticket_sla_config;
create policy "ticket_sla_escrita" on ticket_sla_config for all
  using (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('ticket', 'categorias_gerir')
    )
  )
  with check (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('ticket', 'categorias_gerir')
    )
  );
