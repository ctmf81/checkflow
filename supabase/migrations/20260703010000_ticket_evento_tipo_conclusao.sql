-- ============================================================
-- FIX: concluir ticket falhava ("Não foi possível registrar o
-- evento"). O fluxo atual conclui direto (responsável marca
-- corrigido/parcial/não corrigido) e emite ticket_eventos.tipo =
-- 'conclusao'. Mas o enum ticket_evento_tipo só tinha os valores
-- do fluxo antigo de 2 etapas ('conclusao_proposta' + 'validacao'),
-- então o insert quebrava com "invalid input value for enum".
--
-- Adiciona 'conclusao' ao enum. ADD VALUE é auto-commit no SQL
-- Editor; idempotente via IF NOT EXISTS.
-- ============================================================

alter type ticket_evento_tipo add value if not exists 'conclusao';
