-- FIX: excluir empresa cascata falhava com
--   "referential integrity query on 'tickets' from constraint
--    'ticket_eventos_ticket_id_fkey' on 'ticket_eventos' gave unexpected result"
-- ticket_eventos tem RLS. Quando o cascade tenta remover tickets, o Postgres
-- roda a checagem interna da FK contra ticket_eventos e a policy existente
-- (só admin_empresa em ALL) filtra as linhas — resultado inesperado.
-- Adiciona policy `for all` cobrindo admin_sistema, sem afetar o resto.
drop policy if exists "ticket_eventos_admin_sistema_all" on ticket_eventos;
create policy "ticket_eventos_admin_sistema_all" on ticket_eventos for all
  using (is_admin_sistema())
  with check (is_admin_sistema());
