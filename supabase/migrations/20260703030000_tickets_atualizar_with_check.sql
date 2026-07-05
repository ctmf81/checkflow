-- ============================================================
-- FIX: transferência de ticket por operador podia ser bloqueada.
--
-- A policy tickets_atualizar tinha só USING (sem WITH CHECK), então o
-- Postgres usava a mesma expressão como WITH CHECK na LINHA NOVA. Ao
-- transferir para OUTRO responsável (assignee muda para outra pessoa,
-- ou vira null), a linha nova deixa de satisfazer `auth.uid()=assignee_id`
-- — e um operador que não fosse o abridor era barrado.
--
-- Quem PODE iniciar a atualização continua restrito pelo USING (assignee,
-- abridor, admin, ou permissão 'tratar'). O WITH CHECK passa a exigir só
-- que a linha resultante continue na MESMA unidade a que o usuário pertence
-- — impede mover o ticket para fora do alcance do usuário, mas permite
-- transferir de grupo/subgrupo e reatribuir o responsável.
-- Idempotente.
-- ============================================================

drop policy if exists "tickets_atualizar" on tickets;
create policy "tickets_atualizar" on tickets
  for update
  using (
    auth.uid() = assignee_id
    or auth.uid() = aberto_por_id
    or is_admin_sistema()
    or usuario_tem_permissao('ticket', 'tratar')
  )
  with check (
    is_admin_sistema()
    or exists (
      select 1 from usuario_unidade uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = tickets.unidade_id
    )
  );
