-- Ainda falhava "referential integrity query on tickets ... gave unexpected
-- result" mesmo com policy admin_sistema em ticket_eventos: o Postgres roda a
-- checagem interna da FK ao processar o cascade e o resultado, filtrado por
-- RLS, sai diferente do esperado. Bypass RLS pra função inteira resolve todos
-- os casos parecidos (uma tabela por vez seria jogo de gato e rato).
-- Segurança: a função é `security definer` e já valida `is_admin_sistema()`
-- no topo — ninguém sem essa role consegue chamar.
alter function excluir_empresa_cascata(uuid) set row_security = off;
