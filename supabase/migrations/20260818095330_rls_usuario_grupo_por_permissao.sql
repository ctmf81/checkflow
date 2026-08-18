-- Permite que quem tem a permissão grupos.adicionar_usuario OU
-- grupos.gerenciar_usuario (via perfil "Gestão do Grupo" ou equivalente) possa
-- vincular usuários a grupos e subgrupos DENTRO das empresas em que ele atua.
--
-- Antes: apenas admin_sistema e admin_empresa podiam escrever em usuario_grupo
-- e usuario_subgrupo. A UI de perfis exibia essas permissões, mas a RLS
-- silenciosamente bloqueava o INSERT — "clico salvar e nada acontece".
--
-- Escopo: o grupo/subgrupo alvo precisa pertencer a uma unidade de alguma
-- empresa em que o usuário tenha vínculo (usuario_empresa). Isso evita que
-- um "Gestor" da empresa A adicione gente em grupos da empresa B.

create policy "usuario_grupo_permissao" on usuario_grupo for all
  using (
    (usuario_tem_permissao('grupos', 'gerenciar_usuario')
      or usuario_tem_permissao('grupos', 'adicionar_usuario'))
    and grupo_id in (
      select g.id from grupos g
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where ue.usuario_id = auth.uid()
    )
  )
  with check (
    (usuario_tem_permissao('grupos', 'gerenciar_usuario')
      or usuario_tem_permissao('grupos', 'adicionar_usuario'))
    and grupo_id in (
      select g.id from grupos g
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where ue.usuario_id = auth.uid()
    )
  );

create policy "usuario_subgrupo_permissao" on usuario_subgrupo for all
  using (
    (usuario_tem_permissao('grupos', 'gerenciar_usuario')
      or usuario_tem_permissao('grupos', 'adicionar_usuario'))
    and subgrupo_id in (
      select s.id from subgrupos s
      join grupos g on g.id = s.grupo_id
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where ue.usuario_id = auth.uid()
    )
  )
  with check (
    (usuario_tem_permissao('grupos', 'gerenciar_usuario')
      or usuario_tem_permissao('grupos', 'adicionar_usuario'))
    and subgrupo_id in (
      select s.id from subgrupos s
      join grupos g on g.id = s.grupo_id
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where ue.usuario_id = auth.uid()
    )
  );
