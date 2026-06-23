-- ============================================================
-- FIX: usuário não consegue ler suas próprias linhas em usuario_subgrupo
-- ============================================================
-- Mesma classe do fix usuario_unidade_propria (20260614030000):
-- usuario_subgrupo tem RLS habilitado mas só policies admin
-- (usuario_subgrupo_admin / usuario_subgrupo_admin_empresa). Para
-- usuários normais, qualquer select em usuario_subgrupo retorna vazio —
-- inclusive subqueries dentro de OUTRAS policies (ex:
-- "subgrupo_id in (select subgrupo_id from usuario_subgrupo where
-- usuario_id = auth.uid() and funcao in ('nivel_1','nivel_2'))").
--
-- Isso bloqueava:
--   1) a policy causa_raiz_insert_resolvedor (N1/N2 não conseguiam criar
--      causa raiz na abertura do plano de ação);
--   2) no front, a leitura do próprio funcao para decidir se mostra a
--      seção de causa raiz (ehResolvedor) — N1/N2 nunca via a seção.
-- Pego por pentest/causa-raiz-rls.mjs (diag: "N1 vê 0 linhas").
--
-- Policies são permissivas (OR), então adicionar este SELECT não remove
-- o acesso admin já existente.

create policy "usuario_subgrupo_propria" on usuario_subgrupo
  for select using (usuario_id = auth.uid());
