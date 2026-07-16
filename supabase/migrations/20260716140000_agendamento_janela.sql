-- Janela de geração dos agendamentos: restringe em quais DIAS DA SEMANA e em
-- qual FAIXA DE HORÁRIO o disparo pode acontecer. Tudo opcional (null = sem
-- restrição), retrocompatível com os agendamentos existentes.
--
-- Fuso de referência: America/Sao_Paulo (o `now()` do banco é UTC).

alter table agendamentos
  add column if not exists dias_semana smallint[],           -- 0=domingo … 6=sábado; null/vazio = todos os dias
  add column if not exists hora_inicio smallint,             -- 0..23; null = sem restrição (hora inicial, inclusiva)
  add column if not exists hora_fim    smallint;             -- 1..24; null = sem restrição (hora final, EXCLUSIVA)

-- hora_fim é exclusiva: das 8 às 18 = 08:00 até 17:59 (a hora 18 não gera).
alter table agendamentos drop constraint if exists agendamento_hora_valida;
alter table agendamentos add constraint agendamento_hora_valida check (
  (hora_inicio is null and hora_fim is null)
  or (hora_inicio between 0 and 23 and hora_fim between 1 and 24 and hora_inicio < hora_fim)
);

-- Reprocessa com as janelas: se o momento atual (em São Paulo) está fora do
-- dia/horário permitido, PULA o registro sem avançar proxima_execucao — assim
-- ele dispara na próxima passada do cron já dentro da janela (as ocorrências
-- perdidas fora da janela colapsam em um único disparo, pois
-- agendamento_calcular_proxima empurra para a próxima ocorrência > now()).
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
