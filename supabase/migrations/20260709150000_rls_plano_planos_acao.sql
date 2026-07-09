-- ============================================================
-- ENTITLEMENTS — RLS por plano (fase 2): rollout p/ PLANOS DE AÇÃO
-- ============================================================
-- O serviço "Planos de Ação" mapeia ao recurso 'causa_raiz' (seed de servicos).
-- ⚠️ O plano de ação em si é OPERACIONAL: nasce automático no FINALIZAR de uma
-- execução reprovada e é moderado por função N1/N2. Gatear planos_acao_insert
-- QUEBRARIA a finalização de checklist → NÃO se toca em planos_acao / evidências
-- / movimentações. O gate incide só na AUTORIA do CATÁLOGO de causa raiz.
--
-- Também NÃO se gateiam (operação viva do fluxo de moderação, causa é opcional):
--   • causa_raiz_insert_resolvedor (N1/N2 cria causa nova durante a abertura)
--   • cr_ocorrencias_insert / cr_ocorrencias_admin (registro de ocorrência)
-- Opt-in: empresa sem plano/serviços → true → sem mudança.

-- Catálogo de causa raiz — escrita por permissão (autoria): + gate
drop policy if exists "causa_raiz_escrita" on causa_raiz;
create policy "causa_raiz_escrita" on causa_raiz for all
  using (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = causa_raiz.unidade_id), 'causa_raiz')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (usuario_tem_permissao('causa_raiz', 'criar')
           or usuario_tem_permissao('causa_raiz', 'editar')
           or usuario_tem_permissao('causa_raiz', 'excluir'))
    )
  )
  with check (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = causa_raiz.unidade_id), 'causa_raiz')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (usuario_tem_permissao('causa_raiz', 'criar') or usuario_tem_permissao('causa_raiz', 'editar'))
    )
  );

-- Catálogo via admin_empresa (20260620120000): + gate
drop policy if exists "causa_raiz_admin_empresa" on causa_raiz;
create policy "causa_raiz_admin_empresa" on causa_raiz for all
  using (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = causa_raiz.unidade_id), 'causa_raiz')
  )
  with check (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = causa_raiz.unidade_id), 'causa_raiz')
  );
