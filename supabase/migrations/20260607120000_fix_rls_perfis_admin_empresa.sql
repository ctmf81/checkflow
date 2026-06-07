-- BUG: "Erro ao criar perfil" para administradores de empresa.
-- Causa: a única policy de escrita em `perfis` era "perfis_admin" (is_admin_sistema()),
-- então admins de empresa (perfil_id = ...002) não conseguiam INSERT/UPDATE/DELETE
-- em perfis da própria empresa via RLS — apenas admin de sistema podia.
--
-- Fix: adiciona policy permitindo que o admin da empresa (ou quem tiver a
-- permissão 'perfis') gerencie perfis NÃO-sistema da SUA empresa.

create policy "perfis_gestao_empresa" on perfis
  for all
  using (
    not is_system
    and empresa_id in (
      select usuario_empresa.empresa_id from usuario_empresa
      where usuario_empresa.usuario_id = auth.uid()
        and usuario_empresa.perfil_id = '00000000-0000-0000-0000-000000000002'
    )
  )
  with check (
    not is_system
    and empresa_id in (
      select usuario_empresa.empresa_id from usuario_empresa
      where usuario_empresa.usuario_id = auth.uid()
        and usuario_empresa.perfil_id = '00000000-0000-0000-0000-000000000002'
    )
  );

-- PERFIL_PERMISSOES: o admin da empresa também precisa gravar/alterar os
-- vínculos de permissão dos perfis que ele cria/edita (salvarPermissoes()).
create policy "perfil_permissoes_gestao_empresa" on perfil_permissoes
  for all
  using (
    perfil_id in (
      select id from perfis
      where not is_system
        and empresa_id in (
          select usuario_empresa.empresa_id from usuario_empresa
          where usuario_empresa.usuario_id = auth.uid()
            and usuario_empresa.perfil_id = '00000000-0000-0000-0000-000000000002'
        )
    )
  )
  with check (
    perfil_id in (
      select id from perfis
      where not is_system
        and empresa_id in (
          select usuario_empresa.empresa_id from usuario_empresa
          where usuario_empresa.usuario_id = auth.uid()
            and usuario_empresa.perfil_id = '00000000-0000-0000-0000-000000000002'
        )
    )
  );
