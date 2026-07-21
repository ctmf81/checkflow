-- Tickets — vínculo de duplicados (parte 1/2: novos valores de enum).
--
-- ⚠️ APLICAR ESTA MIGRATION SOZINHA, ANTES da 20260720160000.
-- `ALTER TYPE ... ADD VALUE` não pode ser usado na MESMA transação em que o
-- valor é criado (Postgres). Se rodar junto com a parte 2 (que referencia
-- 'duplicado' em policy/trigger), o Postgres reclama "unsafe use of new value".
-- Por isso os ADD VALUE ficam isolados aqui.
--
-- Novo status 'duplicado': ticket congelado, vinculado a um principal.
-- Novos eventos de timeline 'vinculo'/'desvinculo': registram o (des)vínculo.

alter type ticket_status add value if not exists 'duplicado';

alter type ticket_evento_tipo add value if not exists 'vinculo';
alter type ticket_evento_tipo add value if not exists 'desvinculo';
