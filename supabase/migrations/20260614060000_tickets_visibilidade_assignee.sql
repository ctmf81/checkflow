-- ============================================================
-- Tickets: ao ser assumido, o ticket some da lista dos demais
-- membros da unidade — fica visível apenas para quem abriu,
-- o responsável (assignee) e admin_sistema.
-- ============================================================

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
  );

-- ============================================================
-- Transferência de ticket: o assignee precisa listar TODOS os
-- grupos/subgrupos da unidade do ticket (não só o seu próprio),
-- para escolher o destino. `grupos_membro`/`subgrupos_membro`
-- (escopo "meu grupo") continuam valendo; esta policy adiciona
-- visibilidade por unidade.
-- ============================================================
create policy "grupos_unidade_membro" on grupos for select using (
  unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

create policy "subgrupos_unidade_membro" on subgrupos for select using (
  grupo_id in (
    select id from grupos
    where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);
