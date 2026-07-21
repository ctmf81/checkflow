-- FIX urgente da 20260720160000: a policy tickets_leitura passou a fazer uma
-- subconsulta na PRÓPRIA tabela `tickets` dentro da policy de `tickets`. Isso
-- dispara RECURSÃO INFINITA de RLS no Postgres (SQLSTATE 42P17,
-- "infinite recursion detected in policy for relation tickets") e quebra TODA
-- leitura de tickets (listagem, detalhe, etc.).
--
-- Correção: isola a checagem "auth.uid() é abridor de um duplicado deste ticket"
-- numa função SECURITY DEFINER — a leitura interna roda como dono da função e
-- NÃO reaplica a RLS de `tickets`, eliminando a recursão. Mesmo padrão de
-- is_admin_sistema()/empresa_libera_recurso().

create or replace function eh_interessado_no_ticket(p_ticket_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from tickets d
    where d.ticket_pai_id = p_ticket_id and d.aberto_por_id = auth.uid()
  )
$$;

drop policy if exists "tickets_leitura" on tickets;
create policy "tickets_leitura" on tickets
  for select using (
    is_admin_sistema()
    or auth.uid() = assignee_id
    or auth.uid() = aberto_por_id
    or (
      assignee_id is null
      and exists (
        select 1 from usuario_unidade uu
        where uu.usuario_id = auth.uid() and uu.unidade_id = tickets.unidade_id
      )
    )
    or eh_interessado_no_ticket(tickets.id)
  );
