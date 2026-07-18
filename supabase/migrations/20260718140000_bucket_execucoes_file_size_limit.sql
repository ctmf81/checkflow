-- Defesa no SERVIDOR contra uploads gigantes no bucket `execucoes`.
-- O limite por tipo (foto 10 MB / vídeo 50 MB) hoje é só no cliente
-- (lib/midia.ts) — o storage aceitava qualquer tamanho se o cliente fosse
-- burlado. Define file_size_limit = 50 MB (o teto do maior tipo permitido).
-- Requer rodar como service role / postgres (dono do schema storage).

update storage.buckets
set file_size_limit = 52428800  -- 50 MiB
where id = 'execucoes';
