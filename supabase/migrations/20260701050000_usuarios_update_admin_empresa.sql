-- Admin da empresa pode atualizar dados dos usuários da própria empresa.
-- Sem esta policy, o UPDATE via browser client falhava silenciosamente para
-- qualquer usuário que não fosse o próprio (nome, cpf, telefone, turno_id, etc.).

drop policy if exists "usuarios_escrita_admin_empresa" on usuarios;
create policy "usuarios_escrita_admin_empresa" on usuarios
  for update
  using (
    is_admin_sistema()
    or exists (
      select 1 from usuario_empresa ue_editor
      join usuario_empresa ue_alvo
        on ue_alvo.empresa_id = ue_editor.empresa_id
       and ue_alvo.usuario_id = usuarios.id
      where ue_editor.usuario_id = auth.uid()
        and ue_editor.perfil_id = '00000000-0000-0000-0000-000000000002'
    )
  );
