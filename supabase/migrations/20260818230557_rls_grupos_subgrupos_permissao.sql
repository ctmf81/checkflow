-- Bug: perfil "Gestão do Grupo" tem grupos.editar / subgrupos.editar / subgrupos.criar
-- na UI de perfis, mas a RLS de `grupos` e `subgrupos` só honrava
-- admin_sistema e admin_empresa. Efeito: desativar/editar sub grupo (ou grupo)
-- pelo Gestor do Grupo silenciosamente NÃO ATUALIZAVA — RLS bloqueia sem erro,
-- 0 linhas afetadas, tela dizia "sucesso" mas nada mudava.
--
-- Fix mesma abordagem do 20260818225748: helper SECURITY DEFINER que checa
-- (a) permissão E (b) escopo (grupo pertence a empresa em que o usuário atua).
-- SECURITY DEFINER evita recursão em RLS na subquery interna.

create or replace function usuario_pode_editar_grupo(p_grupo_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    usuario_tem_permissao('grupos', 'editar')
    and exists (
      select 1 from grupos g
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where g.id = p_grupo_id
        and ue.usuario_id = auth.uid()
    )
$$;

create or replace function usuario_pode_editar_subgrupo(p_subgrupo_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    (usuario_tem_permissao('subgrupos', 'editar')
      or usuario_tem_permissao('subgrupos', 'gerenciar_funcoes'))
    and exists (
      select 1 from subgrupos s
      join grupos g on g.id = s.grupo_id
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where s.id = p_subgrupo_id
        and ue.usuario_id = auth.uid()
    )
$$;

-- Criar subgrupo (INSERT) — precisa da permissão criar E do grupo alvo
-- pertencer a uma empresa em que o usuário atua.
create or replace function usuario_pode_criar_subgrupo_no_grupo(p_grupo_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    usuario_tem_permissao('subgrupos', 'criar')
    and exists (
      select 1 from grupos g
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where g.id = p_grupo_id
        and ue.usuario_id = auth.uid()
    )
$$;

drop policy if exists "grupos_permissao_editar"    on grupos;
create policy "grupos_permissao_editar" on grupos for update
  using (usuario_pode_editar_grupo(id))
  with check (usuario_pode_editar_grupo(id));

-- Para subgrupos: SELECT+UPDATE+DELETE via usuario_pode_editar_subgrupo (edição
-- inclui desativação = update status). INSERT via usuario_pode_criar_subgrupo_no_grupo.
drop policy if exists "subgrupos_permissao_editar" on subgrupos;
create policy "subgrupos_permissao_editar" on subgrupos for update
  using (usuario_pode_editar_subgrupo(id))
  with check (usuario_pode_editar_subgrupo(id));

drop policy if exists "subgrupos_permissao_criar" on subgrupos;
create policy "subgrupos_permissao_criar" on subgrupos for insert
  with check (usuario_pode_criar_subgrupo_no_grupo(grupo_id));

drop policy if exists "subgrupos_permissao_deletar" on subgrupos;
create policy "subgrupos_permissao_deletar" on subgrupos for delete
  using (usuario_pode_editar_subgrupo(id));
