-- ============================================================
-- STORAGE `empresas` — arquivo da Consulta Inteligente (prefixo documentos/)
-- ============================================================
-- O PDF base da Consulta Inteligente sobe em empresas/documentos/{id}/...,
-- mas as policies de INSERT do bucket só cobriam:
--   • upload_logo       → is_admin_sistema()
--   • etapas_img_upload → prefixo 'etapas/%' + permissão de documentos
-- Não havia policy para o prefixo 'documentos/%' → admin da empresa/gestor com
-- permissão de documentos batia em "new row violates row-level security policy".
-- Espelha a regra das imagens de etapa, agora para 'documentos/%'.

-- Remove a policy de UPDATE ampla criada antes (não era a causa; abria demais).
drop policy if exists "atualizar_empresas" on storage.objects;

drop policy if exists "documentos_arquivo_upload" on storage.objects;
create policy "documentos_arquivo_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'empresas'
    and name like 'documentos/%'
    and (is_admin_sistema() or usuario_tem_permissao('documentos', 'criar'))
  );

drop policy if exists "documentos_arquivo_delete" on storage.objects;
create policy "documentos_arquivo_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'empresas'
    and name like 'documentos/%'
    and (is_admin_sistema() or usuario_tem_permissao('documentos', 'criar') or usuario_tem_permissao('documentos', 'excluir'))
  );
