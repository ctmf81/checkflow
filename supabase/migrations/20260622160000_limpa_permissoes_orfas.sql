-- ============================================================
-- Limpa permissões que saíram do construtor de perfis (UI):
--  • 'planos_acao' (ver/moderar_n1/moderar_n2) — moderação é decidida
--    em Subgrupos → Funções (N1/N2/Executor), não pelo perfil.
--  • 'configuracoes' (ver/editar) — não usada em nenhum enforcement.
--
-- Removê-las de `permissoes` cascateia para `perfil_permissoes`
-- (FK permissao_id ... on delete cascade), apagando os vínculos órfãos.
-- Nenhuma RLS/trigger consome essas permissões, então é seguro.
-- ============================================================

delete from permissoes
where recurso in ('planos_acao', 'configuracoes');
