-- Limpeza do resíduo da correção de escalada de privilégio (20260718160000).
--
-- Aquela migration moveu o role de autorização de `user_metadata` (gravável
-- pelo próprio usuário) para `app_metadata` (só service role), mas deixou o
-- `user_metadata.role` no lugar de PROPÓSITO — removê-lo antes teria quebrado
-- as telas que ainda liam `user.user_metadata?.role`.
--
-- Esses call sites já foram trocados para `app_metadata` e deployados (26
-- pontos, 2026-07-20; `lib/admin.ts` lê só app_metadata e IGNORA user_metadata,
-- coberto por teste). Agora a chave é dado morto — remover para não confundir
-- e não deixar um `role` fantasma no metadado auto-gravável.
--
-- Seguro e idempotente: apaga só a chave `role` de raw_user_meta_data,
-- preservando o resto (ex.: `nome`). Não afeta autorização (que lê app_metadata).

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'role'
where raw_user_meta_data ? 'role';
