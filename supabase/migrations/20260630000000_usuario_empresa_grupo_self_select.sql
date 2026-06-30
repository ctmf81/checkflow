-- Self-select faltante em usuario_empresa e usuario_grupo.
--
-- Sintoma (achado no teste manual como operador real, 2026-06-30):
--   operador/N1/N2/gestor (não-admin) logava e caía em "Nenhuma unidade
--   selecionada". O SessionContext lê usuario_empresa do PRÓPRIO usuário para
--   descobrir empresa/unidade, mas as ÚNICAS policies de usuario_empresa eram
--   admin-sistema (20260603000003) e admin-empresa (20260620120000). Sem uma
--   policy "ver a própria linha", a leitura voltava VAZIA → minhasEmpresas=[]
--   → nenhuma empresa/unidade resolvida. O admin não cai nisso porque o
--   is_admin_empresa já o cobre.
--
-- Alcance: além da tela, zerava toda subquery do tipo
--   `select empresa_id from usuario_empresa where usuario_id = auth.uid()`
--   (empresas_acesso, turnos, workflows, billing, uso_*) para não-admins —
--   a subquery roda sob o RLS da própria usuario_empresa.
--
-- Mesma classe do gotcha já corrigido em usuario_unidade (20260614030000) e
-- usuario_subgrupo (20260622210000); usuario_empresa e usuario_grupo ficaram
-- de fora. Esta migration fecha os dois.
--
-- Seguro: cada usuário lê apenas as PRÓPRIAS linhas (usuario_id = auth.uid()).
-- Não expõe vínculos de outros usuários; a ESCRITA continua restrita a admin
-- (policies `for all` de admin-sistema/admin-empresa permanecem intactas).

drop policy if exists "usuario_empresa_propria" on usuario_empresa;
create policy "usuario_empresa_propria" on usuario_empresa
  for select using (usuario_id = auth.uid());

drop policy if exists "usuario_grupo_propria" on usuario_grupo;
create policy "usuario_grupo_propria" on usuario_grupo
  for select using (usuario_id = auth.uid());
