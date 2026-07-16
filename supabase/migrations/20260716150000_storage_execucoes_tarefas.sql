-- ============================================================
-- FIX: evidências de TAREFA (foto/vídeo) não subiam.
--
-- As evidências de lista de tarefas vão para o bucket 'execucoes' no
-- caminho `tarefas/<tarefa_execucao_id>/<arquivo>`. Mas as policies
-- execucoes_upload / execucoes_delete só aceitavam caminhos cujo 1º
-- segmento é id de checklist_execucoes OU 'tickets'. Para um caminho de
-- tarefa, o 1º segmento é 'tarefas' → o upload era barrado com
-- "new row violates row-level security policy" (e ainda tentava castar
-- 'tarefas'::uuid). Resultado: "Erro ao enviar a evidência".
--
-- Amplia as policies para aceitar TAMBÉM `tarefas/<tarefa_execucao_id>/...`,
-- escopado à unidade do usuário (tarefa_execucoes.unidade_id). Comparação
-- por texto (id::text) para não castar o segmento 'tarefas' para uuid.
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
        (string_to_array(name, '/'))[1] = 'tarefas'
        and (string_to_array(name, '/'))[2] in (
          select id::text from tarefa_execucoes
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
        (string_to_array(name, '/'))[1] = 'tarefas'
        and (string_to_array(name, '/'))[2] in (
          select id::text from tarefa_execucoes
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
