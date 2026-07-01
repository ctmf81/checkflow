-- Admin da empresa pode ler todos os usuários vinculados à sua empresa.
-- Sem esta policy, o join `usuario:usuario_id(...)` em usuario_empresa retornava
-- null para o próprio admin (e para outros usuários em alguns contextos), causando
-- sumiço na listagem de Acessos → Usuários.
--
-- A policy existente "usuarios_leitura_scoped" já cobre este caso via sub-query,
-- mas o planner pode avaliar RLS recursivamente de formas inesperadas com PostgREST.
-- Esta policy adicional garante o SELECT diretamente, sem depender do join.
drop policy if exists "usuarios_admin_empresa" on usuarios;
create policy "usuarios_admin_empresa" on usuarios for select
  using (
    id in (
      select ue.usuario_id
      from usuario_empresa ue
      where ue.empresa_id in (
        select empresa_id
        from usuario_empresa
        where usuario_id = auth.uid()
          and perfil_id = '00000000-0000-0000-0000-000000000002'
      )
    )
  );
