-- ============================================================
-- FIX: a timeline do ticket vinha VAZIA mesmo com eventos no banco.
--
-- As telas de detalhe (operação e gestão) fazem embed do autor do
-- evento com `autor:usuarios(nome)`. Mas ticket_eventos.autor_id
-- referenciava auth.users(id), não public.usuarios(id) — o PostgREST
-- não acha essa relação e a query INTEIRA falha ("Could not find a
-- relationship between 'ticket_eventos' and 'usuarios'"), retornando
-- zero eventos → timeline em branco.
--
-- Mesma correção da migration 20260614050000 (que cobriu tickets mas
-- esqueceu ticket_eventos): repontar a FK para usuarios(id). Como
-- usuarios.id já referencia auth.users(id) 1:1, é seguro e mantém o
-- nome de constraint padrão usado no embed.
-- ============================================================

alter table ticket_eventos drop constraint if exists ticket_eventos_autor_id_fkey;
alter table ticket_eventos add constraint ticket_eventos_autor_id_fkey
  foreign key (autor_id) references usuarios(id) on delete restrict;
