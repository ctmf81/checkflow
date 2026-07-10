-- ============================================================
-- Padrões — escrita por QUALQUER permissão de padrão (criar/editar/excluir)
-- ============================================================
-- Antes, todas as write policies de padrão checavam só 'padrao','editar' →
-- as ações 'padrao','criar' e 'padrao','excluir' do construtor de perfil eram
-- inertes, e quem tinha só "criar padrão" não conseguia criar/editar variáveis
-- (variáveis são parte indissociável de um padrão). Decisão do usuário:
-- "criar padrão implica poder criar/editar/deletar variáveis".
-- Agora qualquer permissão de padrão libera o CRUD de padrões + variáveis
-- (espelha o padrão de catálogos). Mantém o gate de plano (entitlements) de
-- 20260709140000. `unidade_id` nullable = template global sempre liberado.

-- Check de permissão amplo (reutilizado):
--   usuario_tem_permissao('padrao','criar'|'editar'|'excluir')

drop policy if exists "variaveis_escrita" on variaveis;
create policy "variaveis_escrita" on variaveis for all
  using (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = variaveis.unidade_id), 'padrao')))
  with check (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = variaveis.unidade_id), 'padrao')));

drop policy if exists "padroes_escrita" on padroes;
create policy "padroes_escrita" on padroes for all
  using (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = padroes.unidade_id), 'padrao')))
  with check (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = padroes.unidade_id), 'padrao')));

drop policy if exists "variavel_valores_escrita" on variavel_valores;
create policy "variavel_valores_escrita" on variavel_valores for all
  using (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u join variaveis v on v.unidade_id = u.id where v.id = variavel_valores.variavel_id), 'padrao')))
  with check (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u join variaveis v on v.unidade_id = u.id where v.id = variavel_valores.variavel_id), 'padrao')));

drop policy if exists "padrao_variaveis_escrita" on padrao_variaveis;
create policy "padrao_variaveis_escrita" on padrao_variaveis for all
  using (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id where p.id = padrao_variaveis.padrao_id), 'padrao')))
  with check (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id where p.id = padrao_variaveis.padrao_id), 'padrao')));

drop policy if exists "padrao_instancias_escrita" on padrao_instancias;
create policy "padrao_instancias_escrita" on padrao_instancias for all
  using (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id where p.id = padrao_instancias.padrao_id), 'padrao')))
  with check (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id where p.id = padrao_instancias.padrao_id), 'padrao')));

drop policy if exists "padrao_instancia_valores_escrita" on padrao_instancia_valores;
create policy "padrao_instancia_valores_escrita" on padrao_instancia_valores for all
  using (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id join padrao_instancias pi on pi.padrao_id = p.id where pi.id = padrao_instancia_valores.instancia_id), 'padrao')))
  with check (is_admin_sistema() or (
    (usuario_tem_permissao('padrao','criar') or usuario_tem_permissao('padrao','editar') or usuario_tem_permissao('padrao','excluir'))
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id join padrao_instancias pi on pi.padrao_id = p.id where pi.id = padrao_instancia_valores.instancia_id), 'padrao')));
