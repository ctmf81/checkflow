-- ============================================================
-- FIX: usuario não consegue ler suas próprias linhas em usuario_unidade
-- ============================================================
-- A tabela usuario_unidade tem RLS habilitado, mas a única policy
-- existente ("usuario_unidade_admin") só permite acesso a admins de
-- sistema (is_admin_sistema()). Para usuários normais, qualquer
-- select em usuario_unidade retorna vazio — inclusive subqueries
-- dentro de OUTRAS policies (ex: "exists (select 1 from usuario_unidade
-- where usuario_id = auth.uid() ...)"), pois essas subqueries também
-- estão sujeitas ao RLS de usuario_unidade.
--
-- Isso bloqueia, para usuários normais, dezenas de policies que
-- dependem de usuario_unidade — incluindo leitura de checklists,
-- catalogos, documentos, padroes_variaveis, e criação de tickets
-- (tickets_criar), causando o erro "new row violates row-level
-- security policy for table tickets" ao abrir um chamado.
--
-- Policies são permissivas (combinadas com OR), então adicionar esta
-- policy de SELECT não remove o acesso de admin já existente.

create policy "usuario_unidade_propria" on usuario_unidade
  for select using (usuario_id = auth.uid());
