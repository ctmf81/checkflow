-- ============================================================
-- ENTITLEMENTS — RLS por plano (fase 2): rollout p/ PADRÕES
-- ============================================================
-- Recurso 'padrao'. Config/autoria (variáveis + padrões + instâncias).
-- As escritas atuais são só por permissão ('padrao','editar'), sem escopo de
-- unidade → adiciona o gate por empresa derivada da unidade. `unidade_id` é
-- NULLABLE (template global): quando null, a subquery da empresa retorna null e
-- empresa_libera_recurso(null, ...) = true → templates globais sempre liberados.
-- Sem policy admin_empresa nessas tabelas (não existe). Leitura intacta.
-- Opt-in: empresa sem plano/serviços → true → sem mudança.

-- variaveis (unidade_id direto)
drop policy if exists "variaveis_escrita" on variaveis;
create policy "variaveis_escrita" on variaveis for all
  using (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = variaveis.unidade_id), 'padrao')))
  with check (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = variaveis.unidade_id), 'padrao')));

-- padroes (unidade_id direto)
drop policy if exists "padroes_escrita" on padroes;
create policy "padroes_escrita" on padroes for all
  using (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = padroes.unidade_id), 'padrao')))
  with check (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = padroes.unidade_id), 'padrao')));

-- variavel_valores (via variaveis → unidade)
drop policy if exists "variavel_valores_escrita" on variavel_valores;
create policy "variavel_valores_escrita" on variavel_valores for all
  using (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u join variaveis v on v.unidade_id = u.id where v.id = variavel_valores.variavel_id), 'padrao')))
  with check (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u join variaveis v on v.unidade_id = u.id where v.id = variavel_valores.variavel_id), 'padrao')));

-- padrao_variaveis (via padroes → unidade)
drop policy if exists "padrao_variaveis_escrita" on padrao_variaveis;
create policy "padrao_variaveis_escrita" on padrao_variaveis for all
  using (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id where p.id = padrao_variaveis.padrao_id), 'padrao')))
  with check (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id where p.id = padrao_variaveis.padrao_id), 'padrao')));

-- padrao_instancias (via padroes → unidade)
drop policy if exists "padrao_instancias_escrita" on padrao_instancias;
create policy "padrao_instancias_escrita" on padrao_instancias for all
  using (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id where p.id = padrao_instancias.padrao_id), 'padrao')))
  with check (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id where p.id = padrao_instancias.padrao_id), 'padrao')));

-- padrao_instancia_valores (via padrao_instancias → padroes → unidade)
drop policy if exists "padrao_instancia_valores_escrita" on padrao_instancia_valores;
create policy "padrao_instancia_valores_escrita" on padrao_instancia_valores for all
  using (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id join padrao_instancias pi on pi.padrao_id = p.id where pi.id = padrao_instancia_valores.instancia_id), 'padrao')))
  with check (is_admin_sistema() or (usuario_tem_permissao('padrao', 'editar')
    and empresa_libera_recurso((select u.empresa_id from unidades u join padroes p on p.unidade_id = u.id join padrao_instancias pi on pi.padrao_id = p.id where pi.id = padrao_instancia_valores.instancia_id), 'padrao')));
