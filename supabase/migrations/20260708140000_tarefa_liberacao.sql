-- ============================================================
-- TAREFAS — data de liberação (agendamento da lista)
-- ============================================================
-- liberacao_em = quando a lista publicada passa a aparecer para o operador.
-- null  → liberada imediatamente ao publicar (comportamento atual).
-- futuro → lista "agendada": publicada, mas ainda oculta na Operação até a data.
-- Independente da janela de ABERTURA (data limite / nº de respostas), que rege
-- o encerramento; liberacao_em rege o INÍCIO.

alter table tarefa_listas add column if not exists liberacao_em timestamptz;

comment on column tarefa_listas.liberacao_em is
  'Data/hora em que a lista publicada passa a aparecer na Operação (null = imediata). Antes disso a lista fica "agendada".';
