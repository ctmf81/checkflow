-- ============================================================
-- CONSULTA INTELIGENTE — cache de markdown do documento
-- ============================================================
-- Em vez de mandar o PDF inteiro para a IA a cada pergunta (caro em tokens e
-- só compatível com modelos que leem PDF), guardamos UMA versão markdown do
-- arquivo. A consulta passa a enviar só o texto markdown (barato, qualquer
-- provedor). O PDF original continua salvo em arquivo_url para download.
--
-- conteudo_markdown   → markdown extraído do PDF (null = ainda não gerado)
-- markdown_gerado_em  → quando foi gerado (para regenerar se o arquivo mudar)

alter table documentos add column if not exists conteudo_markdown text;
alter table documentos add column if not exists markdown_gerado_em timestamptz;

comment on column documentos.conteudo_markdown is
  'Markdown extraído do arquivo (consulta_inteligente) para a IA consultar sem reprocessar o PDF a cada pergunta. Gerado 1x via IA.';
