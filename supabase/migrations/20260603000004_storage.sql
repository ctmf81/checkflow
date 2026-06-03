-- Bucket para logos de empresas
insert into storage.buckets (id, name, public)
values ('empresas', 'empresas', true)
on conflict (id) do nothing;

-- Policy: qualquer autenticado pode fazer upload
create policy "upload_logo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'empresas');

-- Policy: leitura pública
create policy "leitura_publica" on storage.objects
  for select to public
  using (bucket_id = 'empresas');

-- Policy: dono pode deletar
create policy "deletar_logo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'empresas');
