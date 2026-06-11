-- ============================================================
-- HARDENING — correções da auditoria de regras de negócio (2026-06-11)
-- ============================================================
-- 1. Policy de UPDATE de tickets: branch `tratar` ganha escopo de unidade
--    (antes, qualquer usuário com a permissão podia atualizar tickets de
--    QUALQUER unidade conhecendo o id).
-- 2. Motor de workflow: execução concluída sem `resultado` passa a contar
--    como REPROVADA (antes 'aprovado' — um update manual via SQL podia
--    avançar um estágio `todos_aprovados` indevidamente).
-- 3. Execuções agendadas de checklist: deixam de nascer como execução "do
--    gestor que criou o agendamento". Passam a ter `executado_por` nulo,
--    `data_expiracao` calculada e vínculo com o agendamento de origem —
--    aparecem na Operação como pendência da unidade, e o operador que
--    executar assume a execução (em vez de criar uma duplicata órfã).

-- ─── 1. tickets_atualizar com escopo de unidade no branch `tratar` ──────────
drop policy if exists "tickets_atualizar" on tickets;
create policy "tickets_atualizar" on tickets
  for update using (
    auth.uid() = assignee_id
    or auth.uid() = aberto_por_id
    or is_admin_sistema()
    or (
      usuario_tem_permissao('ticket', 'tratar')
      and exists (
        select 1 from usuario_unidade uu
        where uu.usuario_id = auth.uid() and uu.unidade_id = tickets.unidade_id
      )
    )
  );

-- ─── 2. resultado nulo = reprovado no motor de workflow ─────────────────────
create or replace function workflow_on_checklist_concluido()
returns trigger language plpgsql security definer as $$
declare
  v_item record;
  v_resultado text;
begin
  if new.status != 'concluido' or old.status = 'concluido' then
    return new;
  end if;

  select * into v_item
  from workflow_item_execucoes
  where checklist_execucao_id = new.id
  limit 1;

  if not found then return new; end if;

  -- Fail-safe: sem resultado explícito, NUNCA conta como aprovado.
  v_resultado := coalesce(new.resultado, 'reprovado');

  update workflow_item_execucoes
  set status       = v_resultado,
      concluido_em = now()
  where id = v_item.id;

  perform workflow_avaliar_avanco(v_item.workflow_execucao_id);

  return new;
end;
$$;

-- ─── 3. Execuções agendadas: pendência da unidade, não execução do gestor ───
alter table checklist_execucoes
  add column if not exists agendamento_id uuid references agendamentos(id) on delete set null;

create index if not exists idx_execucoes_agendamento
  on checklist_execucoes (agendamento_id) where agendamento_id is not null;

create or replace function agendamentos_processar()
returns integer language plpgsql security definer as $$
declare
  rec      record;
  v_count  integer := 0;
  v_guarda integer;
begin
  for rec in
    select * from agendamentos
    where ativo and proxima_execucao <= now()
    for update skip locked
  loop
    if rec.tipo_alvo = 'workflow' then
      perform workflow_iniciar(rec.workflow_id, rec.unidade_id, rec.criado_por);
    else
      select coalesce(tempo_guarda_meses, 12) into v_guarda
      from checklists where id = rec.checklist_id;

      -- executado_por nulo = pendência aguardando um operador da unidade
      insert into checklist_execucoes
        (checklist_id, unidade_id, executado_por, status, agendamento_id, data_expiracao)
      values
        (rec.checklist_id, rec.unidade_id, null, 'em_andamento', rec.id,
         (now() + make_interval(months => coalesce(v_guarda, 12)))::date);
    end if;

    update agendamentos
    set ultima_execucao_em = now(),
        proxima_execucao   = agendamento_calcular_proxima(
                               referencia_inicio, intervalo_unidade, intervalo_valor, now()
                             )
    where id = rec.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Limpeza: execuções agendadas órfãs criadas pelo comportamento antigo
-- (em_andamento, sem respostas, executado_por = criador do agendamento).
-- Não há como distinguir com certeza absoluta das execuções manuais
-- abandonadas, então NÃO apagamos automaticamente — ver query de inspeção
-- na skill /queries antes de qualquer limpeza manual.
