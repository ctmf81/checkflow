-- ============================================================
-- FIX: evidências de ticket (foto/vídeo/arquivo) não subiam.
--
-- As evidências de ticket vão para o bucket 'execucoes' no caminho
-- `tickets/<ticket_id>/<arquivo>`. Mas as policies de storage
-- execucoes_upload / execucoes_delete só permitiam caminhos cujo
-- 1º segmento é um id de checklist_execucoes:
--   (string_to_array(name,'/'))[1]::uuid in (select id from checklist_execucoes ...)
-- Para um caminho de ticket, o 1º segmento é 'tickets' → o upload é
-- barrado (e ainda tentava castar 'tickets'::uuid). Resultado: o upload
-- falhava, a evidência nunca era salva e não aparecia na timeline.
--
-- Amplia as policies para aceitar TAMBÉM `tickets/<ticket_id>/...`.
-- Usa comparação por texto (id::text) para não castar o segmento do
-- caminho para uuid (evita erro quando o segmento é 'tickets').
-- Idempotente.
-- ============================================================

drop policy if exists "execucoes_upload" on storage.objects;
create policy "execucoes_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'execucoes'
    and (
      is_admin_sistema()
      or (
        (string_to_array(name, '/'))[1] = 'tickets'
        and (string_to_array(name, '/'))[2] in (
          select id::text from tickets
          where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        )
      )
      or (
        (string_to_array(name, '/'))[1] in (
          select id::text from checklist_execucoes
          where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        )
      )
    )
  );

drop policy if exists "execucoes_delete" on storage.objects;
create policy "execucoes_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'execucoes'
    and (
      is_admin_sistema()
      or (
        (string_to_array(name, '/'))[1] = 'tickets'
        and (string_to_array(name, '/'))[2] in (
          select id::text from tickets
          where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        )
      )
      or (
        (string_to_array(name, '/'))[1] in (
          select id::text from checklist_execucoes
          where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        )
      )
    )
  );
