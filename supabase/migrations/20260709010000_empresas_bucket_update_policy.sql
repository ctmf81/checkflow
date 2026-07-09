-- ============================================================
-- BUCKET `empresas` — policy de UPDATE (fix upsert)
-- ============================================================
-- O bucket tinha INSERT + SELECT + DELETE, mas NÃO UPDATE. Uploads com
-- `upsert: true` (ex.: ConsultaInteligenteModal, logo em NovaEmpresaModal)
-- exigem a permissão de UPDATE no storage.objects — sem ela, o Supabase
-- retorna "new row violates row-level security policy".

drop policy if exists "atualizar_empresas" on storage.objects;
create policy "atualizar_empresas" on storage.objects
  for update to authenticated
  using (bucket_id = 'empresas')
  with check (bucket_id = 'empresas');
