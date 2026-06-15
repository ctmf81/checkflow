-- ============================================================
-- FIX: tickets.aberto_por_id / assignee_id apontavam para auth.users,
-- mas as telas fazem embed via "usuarios!tickets_aberto_por_id_fkey"
-- ============================================================
-- PostgREST só consegue embutir (`usuarios!fk_name(...)`) quando existe
-- uma foreign key real entre as duas tabelas no schema public. Como
-- tickets_aberto_por_id_fkey e tickets_assignee_id_fkey referenciam
-- auth.users(id) (não public.usuarios(id)), a query com embed falha
-- com "Could not find a relationship between 'tickets' and 'usuarios'"
-- — o select retorna null e as telas de listagem/detalhe de tickets
-- mostram "Nenhum ticket encontrado" mesmo com tickets existindo.
--
-- usuarios.id já referencia auth.users(id) 1:1, então repontar para
-- usuarios(id) é seguro e mantém o mesmo nome de constraint (convenção
-- padrão tabela_coluna_fkey), que é o nome usado nos embeds do frontend.

alter table tickets drop constraint tickets_aberto_por_id_fkey;
alter table tickets add constraint tickets_aberto_por_id_fkey
  foreign key (aberto_por_id) references usuarios(id) on delete restrict;

alter table tickets drop constraint tickets_assignee_id_fkey;
alter table tickets add constraint tickets_assignee_id_fkey
  foreign key (assignee_id) references usuarios(id) on delete set null;
