-- Adiciona coluna para armazenar a URL do PDF gerado após cada execução
alter table checklist_execucoes
  add column if not exists pdf_url text;
