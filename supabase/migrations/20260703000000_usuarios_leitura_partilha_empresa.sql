-- ============================================================
-- FIX: operador não conseguia ler o nome de colegas (abridor /
-- responsável / autor de eventos de ticket).
--
-- A policy `usuarios_leitura_scoped` autoriza ler a linha de outro
-- usuário se ambos compartilham empresa (via usuario_empresa). Mas
-- a subquery rodava sob o RLS de `usuario_empresa`, onde o operador
-- só enxerga a PRÓPRIA linha (self-select). Resultado: o join nunca
-- alcançava o colega → embed `usuarios` vinha null nos tickets →
-- página de detalhe quebrava ("This page couldn't load").
--
-- Solução: função SECURITY DEFINER que avalia o compartilhamento de
-- empresa sem o RLS aninhado, usada na policy.
-- Idempotente.
-- ============================================================

create or replace function public.partilha_empresa(p_outro uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from usuario_empresa ue1
    join usuario_empresa ue2 on ue2.empresa_id = ue1.empresa_id
    where ue1.usuario_id = auth.uid()
      and ue2.usuario_id = p_outro
  );
$$;

grant execute on function public.partilha_empresa(uuid) to authenticated;

drop policy if exists "usuarios_leitura_scoped" on usuarios;
create policy "usuarios_leitura_scoped" on usuarios
  for select using (
    auth.uid() = id
    or is_admin_sistema()
    or public.partilha_empresa(id)
  );
