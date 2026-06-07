-- ============================================================
-- VULNERABILIDADE (achada pelo pentest/run.mjs):
-- O bucket "execucoes" foi criado como `public = true`
-- (migration 20260606000004) com uma policy de leitura
-- "execucoes_leitura" liberada `to public` — qualquer pessoa,
-- mesmo sem autenticação (chave anon), conseguia LISTAR e
-- BAIXAR evidências de execução (fotos, assinaturas, docs)
-- de qualquer empresa/unidade.
--
-- A migration 20260606000005 já havia trocado upload/delete
-- para policies escopadas por unidade, mas manteve o bucket
-- público e nunca removeu a policy de leitura pública.
--
-- Esta migration remove a policy de leitura pública e cria uma
-- policy escopada (mesma regra de upload/delete: usuário só
-- acessa execuções da própria unidade, ou é admin de sistema).
--
-- NOTA: o bucket continua `public = true` propositalmente —
-- o app usa `getPublicUrl()` em várias telas (operação, planos
-- de ação) para exibir fotos/evidências, e essas URLs servem o
-- arquivo via CDN público sem checar RLS. Tornar o bucket
-- privado quebraria essas URLs (exigiria migrar tudo para
-- `createSignedUrl`, refatoração maior e fora do escopo deste
-- fix pontual). Os paths usam UUID de execução (não enumerável),
-- então o risco residual de acesso direto por URL conhecida é
-- baixo — o problema real era a ENUMERAÇÃO via list(), que esta
-- policy bloqueia.
-- ============================================================

drop policy if exists "execucoes_leitura" on storage.objects;

create policy "execucoes_leitura_scoped" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'execucoes'
    and (
      is_admin_sistema()
      or (string_to_array(name, '/'))[1]::uuid in (
        select id from checklist_execucoes
        where unidade_id in (
          select unidade_id from usuario_unidade where usuario_id = auth.uid()
        )
      )
    )
  );
