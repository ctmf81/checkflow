-- ============================================================
-- ENTITLEMENTS — RLS por plano (fase 2): rollout p/ DOCUMENTOS
-- ============================================================
-- Primeiro módulo real após o piloto de Dashboards (20260709060000).
-- Envelopa as write policies de documentos/documento_etapas/etapa_imagens
-- (+ storage de imagens de etapa) com o gate de plano:
--   is_admin_sistema() OR (empresa_libera_recurso(<empresa>, 'documentos') AND <regra atual>)
-- Só ESCRITA — a LEITURA continua aberta pelo escopo de unidade/empresa
-- (downgrade de plano não apaga/esconde documentos já criados).
-- Opt-in: empresa sem plano OU plano sem serviços → função retorna true → sem mudança.
-- Recria exatamente as policies de 20260620160000 acrescentando o gate.

-- helper inline: empresa da unidade → gate. Usa subselect direto p/ manter STABLE.

-- ── documentos (tem unidade_id) ───────────────────────────────
drop policy if exists "documentos_escrita" on documentos;
create policy "documentos_escrita" on documentos for all
  using (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = documentos.unidade_id), 'documentos')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (usuario_tem_permissao('documentos', 'criar') or usuario_tem_permissao('documentos', 'excluir'))
    )
  )
  with check (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = documentos.unidade_id), 'documentos')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('documentos', 'criar')
    )
  );

-- ── documento_etapas (via documento da unidade) ───────────────
drop policy if exists "documento_etapas_escrita" on documento_etapas;
create policy "documento_etapas_escrita" on documento_etapas for all
  using (
    is_admin_sistema()
    or documento_id in (
      select d.id from documentos d
      where d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = d.unidade_id), 'documentos')
        and (usuario_tem_permissao('documentos', 'criar') or usuario_tem_permissao('documentos', 'excluir'))
    )
  )
  with check (
    is_admin_sistema()
    or documento_id in (
      select d.id from documentos d
      where d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = d.unidade_id), 'documentos')
        and usuario_tem_permissao('documentos', 'criar')
    )
  );

-- ── etapa_imagens (via etapa → documento da unidade) ──────────
drop policy if exists "etapa_imagens_escrita" on etapa_imagens;
create policy "etapa_imagens_escrita" on etapa_imagens for all
  using (
    is_admin_sistema()
    or etapa_id in (
      select e.id from documento_etapas e join documentos d on d.id = e.documento_id
      where d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = d.unidade_id), 'documentos')
        and (usuario_tem_permissao('documentos', 'criar') or usuario_tem_permissao('documentos', 'excluir'))
    )
  )
  with check (
    is_admin_sistema()
    or etapa_id in (
      select e.id from documento_etapas e join documentos d on d.id = e.documento_id
      where d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = d.unidade_id), 'documentos')
        and usuario_tem_permissao('documentos', 'criar')
    )
  );

-- ── admin_empresa (policies permissivas separadas de 20260620120000) ──
-- RLS combina policies permissivas por OR: sem gatear estas, o admin da empresa
-- escreveria documentos além do plano. O design é "admin da empresa é limitado
-- ao plano" (admin de SISTEMA ignora). Recria as 3 com o gate + regra atual.
drop policy if exists "documentos_admin_empresa" on documentos;
create policy "documentos_admin_empresa" on documentos for all
  using (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = documentos.unidade_id), 'documentos')
  )
  with check (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = documentos.unidade_id), 'documentos')
  );

drop policy if exists "documento_etapas_admin_empresa" on documento_etapas;
create policy "documento_etapas_admin_empresa" on documento_etapas for all
  using (documento_id in (
    select d.id from documentos d
    where is_admin_empresa_unidade(d.unidade_id)
      and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = d.unidade_id), 'documentos')))
  with check (documento_id in (
    select d.id from documentos d
    where is_admin_empresa_unidade(d.unidade_id)
      and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = d.unidade_id), 'documentos')));

drop policy if exists "etapa_imagens_admin_empresa" on etapa_imagens;
create policy "etapa_imagens_admin_empresa" on etapa_imagens for all
  using (etapa_id in (
    select e.id from documento_etapas e join documentos d on d.id = e.documento_id
    where is_admin_empresa_unidade(d.unidade_id)
      and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = d.unidade_id), 'documentos')))
  with check (etapa_id in (
    select e.id from documento_etapas e join documentos d on d.id = e.documento_id
    where is_admin_empresa_unidade(d.unidade_id)
      and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = d.unidade_id), 'documentos')));

-- ── storage: imagens de etapa — INTENCIONALMENTE NÃO ALTERADO ──
-- As policies etapas_img_upload/delete (20260620160000) ficam como estão.
-- Motivo: a linha `documento_etapas`/`etapa_imagens` já é gateada acima, então
-- uma empresa fora do plano não cria a etapa e a imagem não tem onde se anexar.
-- Gatear o storage pelo path exigiria a etapa já existir no INSERT do objeto,
-- o que muda o fluxo do montador e arrisca quebrar upload — sem ganho real.
