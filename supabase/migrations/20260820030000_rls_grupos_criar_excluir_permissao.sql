-- Auditoria 2026-08-20 identificou: `grupos.criar` e `grupos.excluir` existem em
-- `permissoes` e no construtor de perfis, mas a RLS de `grupos` só tinha
-- `grupos_admin` (is_admin_sistema, for all) e `grupos_admin_empresa`. Perfil
-- customizado (ex.: "Gestão do Grupo") com essas permissões marcadas era
-- SILENCIOSAMENTE bloqueado — RLS retorna 0 linhas sem erro. Mesmo bug de
-- `grupos.editar` corrigido em 20260818230557, mas criar/excluir passaram.
--
-- Fix: helpers SECURITY DEFINER (mesma abordagem de usuario_pode_editar_grupo)
-- validando (a) permissão do perfil E (b) escopo (unidade pertence a empresa
-- do usuário). INSERT usa a unidade alvo; DELETE usa a id do próprio grupo.

create or replace function usuario_pode_criar_grupo_na_unidade(p_unidade_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    usuario_tem_permissao('grupos', 'criar')
    and exists (
      select 1 from unidades u
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where u.id = p_unidade_id
        and ue.usuario_id = auth.uid()
    )
$$;

create or replace function usuario_pode_excluir_grupo(p_grupo_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    usuario_tem_permissao('grupos', 'excluir')
    and exists (
      select 1 from grupos g
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where g.id = p_grupo_id
        and ue.usuario_id = auth.uid()
    )
$$;

drop policy if exists "grupos_permissao_criar" on grupos;
create policy "grupos_permissao_criar" on grupos for insert
  with check (usuario_pode_criar_grupo_na_unidade(unidade_id));

drop policy if exists "grupos_permissao_excluir" on grupos;
create policy "grupos_permissao_excluir" on grupos for delete
  using (usuario_pode_excluir_grupo(id));
