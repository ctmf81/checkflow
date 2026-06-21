-- ============================================================
-- Documentos — escrita por PERMISSÃO de gestão + cota de armazenamento.
-- Antes só `is_admin_sistema` escrevia documentos/etapas/imagens.
-- Agora quem tem a permissão `documentos` (criar/excluir) também gerencia,
-- escopado à sua unidade. Espelha o padrão de catálogos/agendamentos.
-- Aditiva (OR) — admin de sistema e admin da empresa seguem podendo.
-- Inclui:
--   1) RLS de escrita em documentos / documento_etapas / etapa_imagens
--   2) Storage: imagens de etapa (bucket 'empresas', prefixo 'etapas/')
--   3) uso_armazenamento.origem aceita 'documento' (cota)
-- ============================================================

-- ── 1. RLS de escrita por permissão ───────────────────────────
drop policy if exists "documentos_escrita" on documentos;
create policy "documentos_escrita" on documentos for all
  using (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (usuario_tem_permissao('documentos', 'criar') or usuario_tem_permissao('documentos', 'excluir'))
    )
  )
  with check (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('documentos', 'criar')
    )
  );

drop policy if exists "documento_etapas_escrita" on documento_etapas;
create policy "documento_etapas_escrita" on documento_etapas for all
  using (
    is_admin_sistema()
    or documento_id in (
      select id from documentos
      where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and (usuario_tem_permissao('documentos', 'criar') or usuario_tem_permissao('documentos', 'excluir'))
    )
  )
  with check (
    is_admin_sistema()
    or documento_id in (
      select id from documentos
      where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and usuario_tem_permissao('documentos', 'criar')
    )
  );

drop policy if exists "etapa_imagens_escrita" on etapa_imagens;
create policy "etapa_imagens_escrita" on etapa_imagens for all
  using (
    is_admin_sistema()
    or etapa_id in (
      select e.id from documento_etapas e join documentos d on d.id = e.documento_id
      where d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and (usuario_tem_permissao('documentos', 'criar') or usuario_tem_permissao('documentos', 'excluir'))
    )
  )
  with check (
    is_admin_sistema()
    or etapa_id in (
      select e.id from documento_etapas e join documentos d on d.id = e.documento_id
      where d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and usuario_tem_permissao('documentos', 'criar')
    )
  );

-- ── 2. Storage: imagens de etapa (bucket 'empresas', prefixo 'etapas/') ──
-- O upload das imagens vai para empresas/etapas/{etapa_id}/...; o bucket
-- 'empresas' só permitia admin (logos). Libera p/ quem tem permissão de docs.
drop policy if exists "etapas_img_upload" on storage.objects;
create policy "etapas_img_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'empresas'
    and name like 'etapas/%'
    and (is_admin_sistema() or usuario_tem_permissao('documentos', 'criar'))
  );

drop policy if exists "etapas_img_delete" on storage.objects;
create policy "etapas_img_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'empresas'
    and name like 'etapas/%'
    and (is_admin_sistema() or usuario_tem_permissao('documentos', 'criar') or usuario_tem_permissao('documentos', 'excluir'))
  );

-- ── 3. Cota de armazenamento — origem 'documento' ─────────────
alter table uso_armazenamento drop constraint if exists uso_armazenamento_origem_check;
alter table uso_armazenamento
  add constraint uso_armazenamento_origem_check
  check (origem in ('execucao', 'ticket', 'pdf', 'tarefa', 'documento'));
