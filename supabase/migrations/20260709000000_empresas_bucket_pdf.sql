-- ============================================================
-- BUCKET `empresas` — aceitar PDF (Consulta Inteligente)
-- ============================================================
-- O bucket guarda logos, imagens de etapas (POP/IT) e agora o PDF base da
-- Consulta Inteligente. Se o bucket foi criado no painel do Supabase com
-- allowed_mime_types só de imagem (ou um file_size_limit baixo), o upload do
-- PDF era rejeitado com "Erro ao enviar arquivo" — imagens subiam, PDF não.
-- (A migration original 20260603000004 usa `on conflict do nothing`, então não
--  sobrescreve um bucket pré-existente.)
--
-- Libera qualquer tipo (bucket público, controlado pelo app) e sobe o limite
-- para 10 MB (o cliente já limita a 6 MB).

update storage.buckets
set file_size_limit = 10485760,   -- 10 MB
    allowed_mime_types = null      -- sem restrição de tipo
where id = 'empresas';
