-- ENTITLEMENTS — fecha o último furo do rollout RLS-por-plano: o CRON de
-- agendamentos no downgrade.
--
-- A RLS de `agendamentos` (20260709120000) bloqueia a NOVA autoria quando a
-- empresa perde o módulo, mas `agendamentos_processar()` roda com service role
-- (via pg_cron e via POST /cron/agendamentos/processar) e IGNORA a RLS — então
-- agendamentos JÁ criados continuavam disparando execuções mesmo fora do plano.
-- A própria migration da RLS registrou isso como "regra de produto do cron".
--
-- Correção: gate explícito no topo do loop. Empresa sem o recurso 'agendamentos'
-- no plano → pula o agendamento SEM avançar `proxima_execucao` (mesma mecânica
-- do "fora do dia/horário"). Assim, ao religar o módulo, retoma de onde parou
-- (não empilha as ocorrências do período pausado). Cobre checklist e workflow.
--
-- Opt-in preservado: empresa sem plano/serviços → empresa_libera_recurso = true
-- → nenhum agendamento é pausado (comportamento atual inalterado).
--
-- Recria a função inteira (base: 20260717120000_agendamento_nao_empilhar) porque
-- é `create or replace`; a única mudança é o bloco de gate marcado abaixo.

create or replace function agendamentos_processar()
returns integer language plpgsql security definer as $$
declare
  rec      record;
  v_count  integer := 0;
  v_guarda integer;
  v_local  timestamp;
  v_dow    smallint;
  v_hora   smallint;
begin
  v_local := (now() at time zone 'America/Sao_Paulo');
  v_dow   := extract(dow  from v_local);   -- 0=domingo … 6=sábado
  v_hora  := extract(hour from v_local);   -- 0..23

  for rec in
    select * from agendamentos
    where ativo and proxima_execucao <= now()
    for update skip locked
  loop
    -- ── GATE DE PLANO (novo): empresa sem o módulo Agendamentos → pausa. ──
    -- O cron ignora a RLS (service role), então a checagem é explícita aqui.
    -- Não avança proxima_execucao: religar o módulo retoma de onde parou.
    if not empresa_libera_recurso(
         (select u.empresa_id from unidades u where u.id = rec.unidade_id),
         'agendamentos'
       ) then
      continue;
    end if;

    -- Fora dos dias da semana permitidos → aguarda
    if rec.dias_semana is not null and array_length(rec.dias_semana, 1) is not null
       and not (v_dow = any(rec.dias_semana)) then
      continue;
    end if;

    -- Fora da faixa de horário permitida → aguarda. Janela [inicio, fim) em
    -- horas: fim é EXCLUSIVA (das 8 às 18 = 08:00 até 17:59).
    if rec.hora_inicio is not null and rec.hora_fim is not null
       and not (v_hora >= rec.hora_inicio and v_hora < rec.hora_fim) then
      continue;
    end if;

    -- "Não empilhar": se já existe pendência aberta deste agendamento (checklist),
    -- aguarda ela ser resolvida antes de gerar outra (sem avançar proxima_execucao).
    if rec.nao_empilhar and rec.tipo_alvo = 'checklist' then
      perform 1 from checklist_execucoes
        where agendamento_id = rec.id and status = 'em_andamento' and executado_por is null
        limit 1;
      if found then
        continue;
      end if;
    end if;

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
