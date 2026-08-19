-- 2ª tentativa do fix Bug 2 (Gestão do Grupo não consegue ler/gerenciar vínculos
-- de outros membros do grupo). A 1ª (20260818095330) foi revertida por causar
-- recursão em RLS — a policy tinha subquery direta em `grupos`, e `grupos_membro`
-- tem subquery em `usuario_grupo`, loop → 500.
--
-- Fix: helper SECURITY DEFINER que bypassa RLS no SELECT interno. Padrão já
-- usado em `subgrupo_tem_n2`, `is_admin_empresa_grupo`, etc.
--
-- Semântica: quem tem a permissão `grupos.gerenciar_usuario` OU
-- `grupos.adicionar_usuario` (via qualquer perfil na empresa dona do grupo)
-- pode LER, INSERIR e DELETAR vínculos em `usuario_grupo`/`usuario_subgrupo`
-- deste grupo — dentro das empresas em que ele atua (bloqueia cross-empresa).

create or replace function usuario_pode_gerir_grupo(p_grupo_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    (usuario_tem_permissao('grupos', 'gerenciar_usuario')
      or usuario_tem_permissao('grupos', 'adicionar_usuario'))
    and exists (
      select 1 from grupos g
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where g.id = p_grupo_id
        and ue.usuario_id = auth.uid()
    )
$$;

create or replace function usuario_pode_gerir_subgrupo(p_subgrupo_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    (usuario_tem_permissao('grupos', 'gerenciar_usuario')
      or usuario_tem_permissao('grupos', 'adicionar_usuario'))
    and exists (
      select 1 from subgrupos s
      join grupos g on g.id = s.grupo_id
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where s.id = p_subgrupo_id
        and ue.usuario_id = auth.uid()
    )
$$;

-- Recria as policies (drop-if-exists por segurança se rerodar)
drop policy if exists "usuario_grupo_permissao"    on usuario_grupo;
drop policy if exists "usuario_subgrupo_permissao" on usuario_subgrupo;

create policy "usuario_grupo_permissao" on usuario_grupo for all
  using (usuario_pode_gerir_grupo(grupo_id))
  with check (usuario_pode_gerir_grupo(grupo_id));

create policy "usuario_subgrupo_permissao" on usuario_subgrupo for all
  using (usuario_pode_gerir_subgrupo(subgrupo_id))
  with check (usuario_pode_gerir_subgrupo(subgrupo_id));
