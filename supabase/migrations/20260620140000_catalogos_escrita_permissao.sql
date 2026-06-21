-- ============================================================
-- Catálogos — escrita por PERMISSÃO de gestão (não só admin).
-- Antes, a única policy de escrita era `catalogos_admin` (is_admin_sistema),
-- então um gestor com a permissão 'catalogos' tomava erro de RLS ao criar/
-- editar/excluir catálogo pela tela. Espelha o padrão de `agendamentos`.
-- Aditiva (OR) — admin de sistema e admin da empresa continuam podendo.
-- ============================================================

-- CATALOGOS (tem unidade_id)
drop policy if exists "catalogos_escrita" on catalogos;
create policy "catalogos_escrita" on catalogos for all
  using (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (
        usuario_tem_permissao('catalogos', 'criar')
        or usuario_tem_permissao('catalogos', 'editar')
        or usuario_tem_permissao('catalogos', 'excluir')
      )
    )
  )
  with check (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (
        usuario_tem_permissao('catalogos', 'criar')
        or usuario_tem_permissao('catalogos', 'editar')
      )
    )
  );

-- CATALOGO_VALORES (via catálogo da unidade)
drop policy if exists "catalogo_valores_escrita" on catalogo_valores;
create policy "catalogo_valores_escrita" on catalogo_valores for all
  using (
    is_admin_sistema()
    or catalogo_id in (
      select id from catalogos
      where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and (
          usuario_tem_permissao('catalogos', 'criar')
          or usuario_tem_permissao('catalogos', 'editar')
          or usuario_tem_permissao('catalogos', 'excluir')
        )
    )
  )
  with check (
    is_admin_sistema()
    or catalogo_id in (
      select id from catalogos
      where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and (
          usuario_tem_permissao('catalogos', 'criar')
          or usuario_tem_permissao('catalogos', 'editar')
        )
    )
  );
