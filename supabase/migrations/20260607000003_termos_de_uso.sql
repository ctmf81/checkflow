-- ============================================================
-- Termo de Uso: registra quando (e qual versão) o usuário
-- aceitou o termo, para exibir no primeiro acesso e sempre
-- que uma nova versão do termo for publicada.
-- ============================================================

alter table usuarios
  add column if not exists termos_aceitos_em       timestamptz,
  add column if not exists termos_versao_aceita    text;

-- Versão vigente do termo de uso (centralizada — facilita revisões futuras
-- sem precisar de migration: basta atualizar esta constante e pedir reaceite
-- comparando com `termos_versao_aceita`).
-- Convenção de versão: 'YYYY-MM-DD'
comment on column usuarios.termos_versao_aceita is
  'Versão do termo de uso aceita pelo usuário (ex: 2026-06-07). Comparar com a versão vigente para exigir reaceite.';
