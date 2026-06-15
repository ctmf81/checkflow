-- ============================================================
-- BILLING — Fase 2A: assinatura, uso por período e enforcement
-- ============================================================
-- Decisões (padrão de mercado): período de USO é sempre MENSAL,
-- ancorado no dia da assinatura (independente do ciclo de cobrança).
-- Sem rollover (use ou perde) — contadores resetam a cada período.
-- Snapshot dos termos do plano na assinatura (editar catálogo não
-- afeta quem já assinou). Armazenamento = capacidade fixa (snapshot +
-- pacotes permanentes), uso sempre real.

-- ─── Assinatura da empresa (1:1) ────────────────────────────
create table if not exists empresa_assinaturas (
  empresa_id                  uuid primary key references empresas(id) on delete cascade,
  plano_id                    uuid references planos(id) on delete set null,
  -- snapshot dos termos do plano (congelados na contratação)
  plano_nome                  text not null,
  plano_tipo                  text not null check (plano_tipo in ('gratuito','trial','pago')),
  valor                       numeric(10,2) not null default 0,
  ciclo                       text check (ciclo is null or ciclo in ('mensal','anual')),
  limite_execucoes_mes        int,
  limite_armazenamento_bytes  bigint,
  limite_tokens_ia_mes        bigint,
  -- estado de cobrança
  status                      text not null default 'trial' check (status in ('trial','ativo','inadimplente','cancelado')),
  -- período de USO (sempre mensal, ancorado no dia da assinatura)
  periodo_inicio              date not null default current_date,
  periodo_fim                 date not null default (current_date + interval '1 month')::date,
  -- contadores do período (resetam a cada período — use ou perde)
  execucoes_usadas            int    not null default 0,
  tokens_ia_usados            bigint not null default 0,
  execucoes_extra             int    not null default 0,   -- créditos de pacote comprados no período
  tokens_ia_extra             bigint not null default 0,
  -- trial
  trial_fim                   date,
  ja_usou_trial               boolean not null default false,
  -- troca de plano agendada (downgrade/troca de ciclo aplicada no fim do período)
  proximo_plano_id            uuid references planos(id) on delete set null,
  troca_efetiva_em            date,
  -- Asaas (Fase 3)
  asaas_customer_id           text,
  asaas_subscription_id       text,
  criado_em                   timestamptz not null default now(),
  atualizado_em               timestamptz not null default now()
);

-- Compras de pacotes (auditoria + capacidade permanente de armazenamento)
create table if not exists empresa_pacotes_comprados (
  id            uuid primary key default uuid_generate_v4(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  pacote_id     uuid references pacotes_adicionais(id) on delete set null,
  tipo          text not null check (tipo in ('execucoes','tokens_ia','armazenamento')),
  quantidade    bigint not null,
  valor         numeric(10,2) not null default 0,
  -- execucoes/tokens: período em que o crédito foi aplicado; null p/ armazenamento (permanente)
  periodo_inicio date,
  criado_em     timestamptz not null default now(),
  criado_por    uuid
);
create index if not exists idx_pacotes_comprados_empresa on empresa_pacotes_comprados(empresa_id);

-- ─── RLS ────────────────────────────────────────────────────
-- Leitura: admin_sistema OU Admin da empresa (perfil 000…002) da própria empresa.
-- Contém valor/preço — não exposto a membros comuns (mesmo critério de empresa_financeiro).
-- Escrita: admin_sistema (e funções SECURITY DEFINER abaixo).
alter table empresa_assinaturas enable row level security;
drop policy if exists "assinatura_leitura" on empresa_assinaturas;
create policy "assinatura_leitura" on empresa_assinaturas for select using (
  is_admin_sistema()
  or empresa_id in (
    select empresa_id from usuario_empresa
    where usuario_id = auth.uid() and perfil_id = '00000000-0000-0000-0000-000000000002'
  )
);
drop policy if exists "assinatura_admin_escrita" on empresa_assinaturas;
create policy "assinatura_admin_escrita" on empresa_assinaturas for all
  using (is_admin_sistema()) with check (is_admin_sistema());

alter table empresa_pacotes_comprados enable row level security;
drop policy if exists "pacotes_comprados_leitura" on empresa_pacotes_comprados;
create policy "pacotes_comprados_leitura" on empresa_pacotes_comprados for select using (
  is_admin_sistema()
  or empresa_id in (
    select empresa_id from usuario_empresa
    where usuario_id = auth.uid() and perfil_id = '00000000-0000-0000-0000-000000000002'
  )
);
drop policy if exists "pacotes_comprados_admin_escrita" on empresa_pacotes_comprados;
create policy "pacotes_comprados_admin_escrita" on empresa_pacotes_comprados for all
  using (is_admin_sistema()) with check (is_admin_sistema());

-- ─── Avanço de período / trial / troca agendada ─────────────
create or replace function avancar_periodo_assinatura(p_empresa_id uuid)
returns void language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  fp planos%rowtype;
begin
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id for update;
  if not found then return; end if;

  -- Trial expirado → cai no plano gratuito (se existir um ativo)
  if a.status = 'trial' and a.trial_fim is not null and a.trial_fim <= current_date then
    select * into fp from planos where tipo = 'gratuito' and ativo order by ordem limit 1;
    if found then
      a.plano_id := fp.id; a.plano_nome := fp.nome; a.plano_tipo := fp.tipo;
      a.valor := fp.valor; a.ciclo := fp.ciclo;
      a.limite_execucoes_mes := fp.limite_execucoes_mes;
      a.limite_armazenamento_bytes := fp.limite_armazenamento_bytes;
      a.limite_tokens_ia_mes := fp.limite_tokens_ia_mes;
      a.status := 'ativo';
    end if;
    a.trial_fim := null;
  end if;

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

-- ─── Contadores de uso (gatilhos) ───────────────────────────
create or replace function billing_inc_execucao()
returns trigger language plpgsql security definer as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from unidades where id = NEW.unidade_id;
  if v_empresa is not null then
    perform avancar_periodo_assinatura(v_empresa);
    update empresa_assinaturas
      set execucoes_usadas = execucoes_usadas + 1, atualizado_em = now()
      where empresa_id = v_empresa;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_billing_inc_execucao on checklist_execucoes;
create trigger trg_billing_inc_execucao after insert on checklist_execucoes
  for each row execute function billing_inc_execucao();

create or replace function billing_inc_tokens()
returns trigger language plpgsql security definer as $$
begin
  if NEW.empresa_id is not null then
    perform avancar_periodo_assinatura(NEW.empresa_id);
    update empresa_assinaturas
      set tokens_ia_usados = tokens_ia_usados + coalesce(NEW.tokens_entrada,0) + coalesce(NEW.tokens_saida,0),
          atualizado_em = now()
      where empresa_id = NEW.empresa_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_billing_inc_tokens on uso_ia_eventos;
create trigger trg_billing_inc_tokens after insert on uso_ia_eventos
  for each row execute function billing_inc_tokens();

-- ─── Enforcement (booleans) ─────────────────────────────────
-- Sem assinatura configurada → não bloqueia. Limite null → ilimitado.
create or replace function billing_pode_executar(p_empresa_id uuid)
returns boolean language plpgsql security definer as $$
declare a empresa_assinaturas%rowtype;
begin
  perform avancar_periodo_assinatura(p_empresa_id);
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id;
  if not found then return true; end if;
  if a.limite_execucoes_mes is null then return true; end if;
  return a.execucoes_usadas < (a.limite_execucoes_mes + a.execucoes_extra);
end $$;

create or replace function billing_pode_consumir_ia(p_empresa_id uuid)
returns boolean language plpgsql security definer as $$
declare a empresa_assinaturas%rowtype;
begin
  perform avancar_periodo_assinatura(p_empresa_id);
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id;
  if not found then return true; end if;
  if a.limite_tokens_ia_mes is null then return true; end if;
  return a.tokens_ia_usados < (a.limite_tokens_ia_mes + a.tokens_ia_extra);
end $$;

-- Armazenamento: capacidade = snapshot + pacotes permanentes; uso = soma líquida real.
create or replace function billing_armazenamento_disponivel(p_empresa_id uuid, p_bytes bigint)
returns boolean language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  v_capacidade bigint;
  v_usado bigint;
begin
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id;
  if not found then return true; end if;
  if a.limite_armazenamento_bytes is null then return true; end if;
  select a.limite_armazenamento_bytes + coalesce(sum(quantidade),0) into v_capacidade
    from empresa_pacotes_comprados where empresa_id = p_empresa_id and tipo = 'armazenamento';
  select coalesce(sum(tamanho_bytes),0) into v_usado
    from uso_armazenamento where empresa_id = p_empresa_id;
  return (v_usado + coalesce(p_bytes,0)) <= v_capacidade;
end $$;

-- ─── Leitura consolidada (RPC) ──────────────────────────────
create or replace function billing_status(p_empresa_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  v_storage_usado bigint;
  v_storage_extra bigint;
begin
  if not (
    is_admin_sistema()
    or exists (
      select 1 from usuario_empresa
      where usuario_id = auth.uid() and empresa_id = p_empresa_id
        and perfil_id = '00000000-0000-0000-0000-000000000002'
    )
  ) then
    raise exception 'Sem permissão para consultar a assinatura desta empresa.';
  end if;

  perform avancar_periodo_assinatura(p_empresa_id);
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id;
  if not found then return null; end if;

  select coalesce(sum(tamanho_bytes),0) into v_storage_usado
    from uso_armazenamento where empresa_id = p_empresa_id;
  select coalesce(sum(quantidade),0) into v_storage_extra
    from empresa_pacotes_comprados where empresa_id = p_empresa_id and tipo = 'armazenamento';

  return jsonb_build_object(
    'plano_nome', a.plano_nome,
    'plano_tipo', a.plano_tipo,
    'status', a.status,
    'valor', a.valor,
    'ciclo', a.ciclo,
    'periodo_inicio', a.periodo_inicio,
    'periodo_fim', a.periodo_fim,
    'trial_fim', a.trial_fim,
    'proximo_plano_id', a.proximo_plano_id,
    'troca_efetiva_em', a.troca_efetiva_em,
    'execucoes', jsonb_build_object('usado', a.execucoes_usadas, 'limite', a.limite_execucoes_mes, 'extra', a.execucoes_extra),
    'tokens_ia', jsonb_build_object('usado', a.tokens_ia_usados, 'limite', a.limite_tokens_ia_mes, 'extra', a.tokens_ia_extra),
    'armazenamento', jsonb_build_object('usado', v_storage_usado, 'limite', a.limite_armazenamento_bytes, 'extra', v_storage_extra)
  );
end $$;
