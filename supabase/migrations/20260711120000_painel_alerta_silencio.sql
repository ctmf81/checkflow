-- ============================================================
-- PAINEL — alerta de silêncio (não execução) por painel
-- ============================================================
-- Cada painel monitora o histórico de UMA atividade. Se a atividade parar de
-- receber leituras (o checklist deixou de ser executado), o painel hoje só
-- "congela" no último ponto — silêncio passa despercebido numa TV.
-- `alerta_silencio_horas` = por quanto tempo sem NOVA leitura o selo de frescor
-- vira alerta (amarelo na metade do prazo, vermelho ao estourar). null = sem
-- alerta (comportamento anterior). O gestor define conforme a cadência esperada
-- da atividade (forno mede a cada 30min → 1h; limpeza 1x/turno → 8h).
alter table dashboard_paineis
  add column if not exists alerta_silencio_horas int;
