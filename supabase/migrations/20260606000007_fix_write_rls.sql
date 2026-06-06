-- ============================================================
-- FIX: políticas de UPDATE e DELETE sem restrição de unidade
-- Identificado via pen test — userB conseguia update/delete
-- em checklists e execuções de outras unidades conhecendo o ID.
-- ============================================================

-- ── checklists ────────────────────────────────────────────────

drop policy if exists "checklists_update" on checklists;
drop policy if exists "checklists_delete" on checklists;
drop policy if exists "checklists_insert" on checklists;
drop policy if exists "checklists_escrita" on checklists;

-- INSERT: só pode criar checklist na unidade à qual pertence
create policy "checklists_insert" on checklists
  for insert with check (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

-- UPDATE: só pode editar checklist da sua unidade
create policy "checklists_update" on checklists
  for update using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

-- DELETE: só pode deletar checklist da sua unidade
create policy "checklists_delete" on checklists
  for delete using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

-- ── checklist_execucoes ───────────────────────────────────────

drop policy if exists "execucoes_insert" on checklist_execucoes;
drop policy if exists "execucoes_update" on checklist_execucoes;
drop policy if exists "execucoes_delete" on checklist_execucoes;
drop policy if exists "execucoes_escrita" on checklist_execucoes;
drop policy if exists "execucoes_leitura" on checklist_execucoes;

-- SELECT: só vê execuções da sua unidade
create policy "execucoes_leitura" on checklist_execucoes
  for select using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

-- INSERT: só pode inserir execução na sua unidade
create policy "execucoes_insert" on checklist_execucoes
  for insert with check (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

-- UPDATE: só pode atualizar execução da sua unidade
-- (necessário para o fluxo de workflow: status em_andamento → concluido)
create policy "execucoes_update" on checklist_execucoes
  for update using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

-- DELETE: só admin pode deletar execuções (auditoria)
create policy "execucoes_delete" on checklist_execucoes
  for delete using (
    is_admin_sistema()
  );

-- ── checklist_secoes / atividades / opcoes (write) ───────────

drop policy if exists "secoes_escrita"     on checklist_secoes;
drop policy if exists "atividades_escrita" on checklist_atividades;
drop policy if exists "opcoes_escrita"     on checklist_atividade_opcoes;

create policy "secoes_escrita" on checklist_secoes
  for all using (
    is_admin_sistema()
    or checklist_id in (
      select id from checklists
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

create policy "atividades_escrita" on checklist_atividades
  for all using (
    is_admin_sistema()
    or checklist_id in (
      select id from checklists
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

create policy "opcoes_escrita" on checklist_atividade_opcoes
  for all using (
    is_admin_sistema()
    or atividade_id in (
      select ca.id from checklist_atividades ca
      join checklists cl on cl.id = ca.checklist_id
      where cl.unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

-- ── checklist_execucao_respostas (write) ─────────────────────

drop policy if exists "respostas_insert" on checklist_execucao_respostas;
drop policy if exists "respostas_leitura" on checklist_execucao_respostas;
drop policy if exists "respostas_escrita" on checklist_execucao_respostas;

create policy "respostas_leitura" on checklist_execucao_respostas
  for select using (
    is_admin_sistema()
    or execucao_id in (
      select id from checklist_execucoes
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

create policy "respostas_insert" on checklist_execucao_respostas
  for insert with check (
    is_admin_sistema()
    or execucao_id in (
      select id from checklist_execucoes
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );
