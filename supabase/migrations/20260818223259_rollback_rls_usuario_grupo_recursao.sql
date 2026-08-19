-- ROLLBACK URGENTE da migration `20260818095330_rls_usuario_grupo_por_permissao.sql`.
--
-- A policy criada gerava RECURSÃO INFINITA em RLS:
--   usuario_grupo_permissao subquery → grupos → grupos_membro subquery → usuario_grupo
--   usuario_subgrupo_permissao subquery → subgrupos → subgrupos_membro subquery → usuario_subgrupo
--
-- Efeito em prod: 500 em qualquer query envolvendo essas tabelas
-- (usuario_grupo, usuario_subgrupo, e as tabelas que fazem JOIN com elas —
-- tickets, checklists, planos_acao, etc). Toda a operação parou.
--
-- O bug original (perfil "Gestão do Grupo" não consegue adicionar usuário ao
-- grupo) volta com este rollback — vou refazer usando SECURITY DEFINER function
-- pra evitar a recursão, numa migration seguinte.
drop policy if exists "usuario_grupo_permissao" on usuario_grupo;
drop policy if exists "usuario_subgrupo_permissao" on usuario_subgrupo;
