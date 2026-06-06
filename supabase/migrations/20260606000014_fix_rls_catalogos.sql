-- ============================================================
-- Fix RLS catálogos: catálogos com unidade_id NULL (catálogo
-- "geral" da empresa) não eram visíveis para usuários comuns,
-- pois a policy só comparava unidade_id diretamente.
-- Agora também libera leitura quando o catálogo é da mesma
-- empresa do usuário (via unidades), mesmo sem unidade_id.
-- ============================================================

drop policy if exists "catalogos_leitura" on catalogos;
create policy "catalogos_leitura" on catalogos
  for select using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
    or (
      unidade_id is null
      and exists (
        select 1
        from usuario_unidade uu
        join unidades u on u.id = uu.unidade_id
        where uu.usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "valores_leitura" on catalogo_valores;
create policy "valores_leitura" on catalogo_valores
  for select using (
    is_admin_sistema()
    or catalogo_id in (
      select c.id from catalogos c
      where c.unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
      or (
        c.unidade_id is null
        and exists (
          select 1 from usuario_unidade uu where uu.usuario_id = auth.uid()
        )
      )
    )
  );
