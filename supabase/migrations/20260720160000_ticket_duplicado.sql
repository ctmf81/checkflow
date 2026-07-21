-- Tickets — vínculo de duplicados (parte 2/2). APLICAR DEPOIS da 20260720150000.
--
-- Cenário: várias pessoas abrem tickets para a mesma coisa. Quem assume um deles
-- pode vincular os outros como DUPLICADOS de um PRINCIPAL. O duplicado congela
-- (status 'duplicado', sai das filas ativas e do SLA); quem o abriu vira
-- "interessado" do principal — acompanha por lá (lê o principal + é avisado na
-- conclusão). O (des)vínculo é feito server-side (apps/api, service role) com
-- os eventos de timeline; este arquivo garante a INTEGRIDADE no banco.

-- ── Coluna: pai = duplicado aponta para o principal ──
alter table tickets
  add column if not exists ticket_pai_id uuid references tickets(id) on delete set null;

create index if not exists idx_tickets_pai on tickets(ticket_pai_id);

-- ── Trigger de integridade do vínculo ──
-- Impede: auto-vínculo, cross-unidade, cadeia (principal que já é duplicado) e
-- tornar duplicado um ticket que já é principal de outros (mantém FLAT).
create or replace function tickets_valida_vinculo()
returns trigger language plpgsql as $$
declare
  v_pai_unidade uuid;
  v_pai_de_pai  uuid;
begin
  if new.ticket_pai_id is not null
     and (tg_op = 'INSERT' or new.ticket_pai_id is distinct from old.ticket_pai_id) then

    if new.ticket_pai_id = new.id then
      raise exception 'Um ticket não pode ser duplicado de si mesmo';
    end if;

    select unidade_id, ticket_pai_id into v_pai_unidade, v_pai_de_pai
    from tickets where id = new.ticket_pai_id;

    if v_pai_unidade is null then
      raise exception 'Ticket principal não encontrado';
    end if;
    if v_pai_unidade <> new.unidade_id then
      raise exception 'Só é possível vincular tickets da mesma unidade';
    end if;
    if v_pai_de_pai is not null then
      raise exception 'O principal não pode ser ele mesmo um duplicado (vínculo é plano)';
    end if;
    if exists (select 1 from tickets f where f.ticket_pai_id = new.id) then
      raise exception 'Este ticket já é principal de outros duplicados; não pode virar duplicado';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tickets_valida_vinculo on tickets;
create trigger trg_tickets_valida_vinculo
  before insert or update on tickets
  for each row execute function tickets_valida_vinculo();

-- ── RLS: o abridor de um duplicado enxerga o PRINCIPAL ──
-- (hoje, ticket com responsável só é visível ao responsável/abridor/admin; o
-- interessado precisa ler o principal para acompanhar.)
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
    or exists (
      select 1 from tickets d
      where d.ticket_pai_id = tickets.id and d.aberto_por_id = auth.uid()
    )
  );
