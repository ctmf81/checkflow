-- Opção por agendamento: "não empilhar" ocorrências.
--
-- Por padrão (nao_empilhar = false) cada slot vencido gera sua própria
-- ocorrência pendente — útil quando a NÃO EXECUÇÃO precisa ser registrada
-- hora a hora (cada horário vira um registro).
--
-- Com nao_empilhar = true, o processamento só cria uma nova ocorrência de
-- checklist se NÃO houver uma pendente daquele agendamento (em_andamento,
-- executado_por nulo) — evita o acúmulo de "Agendados pendentes". Enquanto
-- houver uma aberta, pula sem avançar proxima_execucao (gera a próxima assim
-- que a atual for respondida/executada ou marcada não-executável).
--
-- Aplica-se a checklists (onde existe a pendência agendada). Workflows têm
-- fluxo próprio e seguem gerando normalmente.

alter table agendamentos
  add column if not exists nao_empilhar boolean not null default false;

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
