-- ============================================================
-- Pós-trial = SOMENTE LEITURA PERMANENTE (sem plano gratuito, sem corte total)
-- ============================================================
-- Decisão de produto (2026-07-13): acabou o trial e a empresa não contratou um
-- pago/cortesia → o sistema **bloqueia a criação de itens operacionais** (não cria
-- checklist, tarefa, ticket, agendamento, workflow) mas **continua deixando
-- consultar/operar o que já existe**, PARA SEMPRE. Sai o fallback "cai no plano
-- gratuito" e sai a fase "bloqueada" (corte de acesso total).

-- ── 1. Fase da assinatura: trial vencido → 'carencia' PERMANENTE ──
-- (mantém 'pago' e 'cortesia' sempre ativos). Não existe mais 'bloqueada'.
create or replace function empresa_fase_assinatura(p_empresa_id uuid)
returns text language sql security definer stable as $$
  select case
    when p_empresa_id is null then 'ativa'
    when not exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id) then 'ativa'
    when exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id and ea.plano_tipo in ('pago', 'cortesia')) then 'ativa'
    else coalesce((
      select case
        when ea.trial_fim is null then 'ativa'
        when current_date <= ea.trial_fim then 'ativa'
        else 'carencia'   -- trial vencido → somente leitura, sem prazo p/ corte total
      end
      from empresa_assinaturas ea
      where ea.empresa_id = p_empresa_id
      order by ea.trial_fim desc nulls last
      limit 1
    ), 'ativa')
  end;
$$;

-- ── 2. avancar_periodo_assinatura: remove o fallback trial→gratuito ──
-- ⚠️ Antes o expirar do trial ZERAVA `trial_fim` (mesmo sem gratuito), o que
-- devolvia a empresa p/ 'ativa'. Agora o trial_fim é PRESERVADO → a fase fica
-- 'carencia' (somente leitura) até contratar um pago/cortesia.
create or replace function avancar_periodo_assinatura(p_empresa_id uuid)
returns void language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  fp planos%rowtype;
begin
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id for update;
  if not found then return; end if;

  -- (sem fallback trial→gratuito: trial vencido NÃO troca de plano; trial_fim fica)

  -- Avança períodos vencidos (sempre mensal); aplica troca de plano agendada
  while a.periodo_fim <= current_date loop
    if a.proximo_plano_id is not null and a.troca_efetiva_em is not null and a.troca_efetiva_em <= a.periodo_fim then
      select * into fp from planos where id = a.proximo_plano_id;
      if found then
        a.plano_id := fp.id; a.plano_nome := fp.nome; a.plano_tipo := fp.tipo;
        a.valor := fp.valor; a.ciclo := fp.ciclo;
        a.limite_execucoes_mes := fp.limite_execucoes_mes;
        a.limite_armazenamento_bytes := fp.limite_armazenamento_bytes;
        a.limite_tokens_ia_mes := fp.limite_tokens_ia_mes;
        a.status := 'ativo';
      end if;
      a.proximo_plano_id := null;
      a.troca_efetiva_em := null;
    end if;
    a.periodo_inicio := a.periodo_fim;
    a.periodo_fim := (a.periodo_fim + interval '1 month')::date;
    a.execucoes_usadas := 0;
    a.tokens_ia_usados := 0;
    a.execucoes_extra := 0;
    a.tokens_ia_extra := 0;
  end loop;

  update empresa_assinaturas set
    plano_id = a.plano_id, plano_nome = a.plano_nome, plano_tipo = a.plano_tipo,
    valor = a.valor, ciclo = a.ciclo,
    limite_execucoes_mes = a.limite_execucoes_mes,
    limite_armazenamento_bytes = a.limite_armazenamento_bytes,
    limite_tokens_ia_mes = a.limite_tokens_ia_mes,
    status = a.status,
    periodo_inicio = a.periodo_inicio, periodo_fim = a.periodo_fim,
    execucoes_usadas = a.execucoes_usadas, tokens_ia_usados = a.tokens_ia_usados,
    execucoes_extra = a.execucoes_extra, tokens_ia_extra = a.tokens_ia_extra,
    trial_fim = a.trial_fim,
    proximo_plano_id = a.proximo_plano_id, troca_efetiva_em = a.troca_efetiva_em,
    atualizado_em = now()
  where empresa_id = p_empresa_id;
end $$;

-- ── 3. Bloqueio de CRIAÇÃO (só operacional): + agendamentos e workflows ──
-- Espelha o padrão de checklists/tarefa_listas/tickets (RESTRICTIVE insert,
-- AND com as permissivas; admin de sistema passa). Config (grupos, usuários,
-- perfis, documentos...) NÃO é bloqueada — o admin ainda regulariza.
drop policy if exists "agendamentos_criar_periodo" on agendamentos;
create policy "agendamentos_criar_periodo" on agendamentos
  as restrictive for insert
  with check (
    is_admin_sistema()
    or empresa_pode_criar((select u.empresa_id from unidades u where u.id = agendamentos.unidade_id))
  );

-- workflows referencia empresa_id DIRETO (não unidade_id).
drop policy if exists "workflows_criar_periodo" on workflows;
create policy "workflows_criar_periodo" on workflows
  as restrictive for insert
  with check (
    is_admin_sistema()
    or empresa_pode_criar(workflows.empresa_id)
  );
