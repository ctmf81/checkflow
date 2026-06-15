-- ============================================================
-- BILLING — Fase 3: integração Asaas (cobranças + webhook)
-- ============================================================
-- empresa_assinaturas já tem asaas_customer_id / asaas_subscription_id (Fase 2A).
-- Aqui: espelho local das cobranças do Asaas + log de eventos do webhook
-- para idempotência (entrega "at least once").

-- Espelho das cobranças (assinatura recorrente e pacotes avulsos)
create table if not exists empresa_cobrancas (
  id                    uuid primary key default uuid_generate_v4(),
  empresa_id            uuid not null references empresas(id) on delete cascade,
  tipo                  text not null check (tipo in ('assinatura','pacote')),
  asaas_payment_id      text unique,
  asaas_subscription_id text,
  pacote_id             uuid references pacotes_adicionais(id) on delete set null,
  descricao             text,
  valor                 numeric(10,2) not null default 0,
  billing_type          text,        -- PIX/BOLETO/CREDIT_CARD/UNDEFINED
  status                text not null default 'PENDING',  -- espelha status do Asaas
  vencimento            date,
  pago_em               timestamptz,
  invoice_url           text,        -- link da fatura/checkout Asaas
  meta                  jsonb,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
create index if not exists idx_cobrancas_empresa on empresa_cobrancas(empresa_id);
create index if not exists idx_cobrancas_subscription on empresa_cobrancas(asaas_subscription_id) where asaas_subscription_id is not null;

-- Idempotência do webhook: cada evento do Asaas tem um id único (evt_...)
create table if not exists asaas_webhook_eventos (
  event_id     text primary key,
  evento       text,
  payload      jsonb,
  processado_em timestamptz not null default now()
);

-- ─── RLS ────────────────────────────────────────────────────
-- Cobranças: leitura admin_sistema OU Admin da empresa (perfil …002); escrita admin_sistema/service-role.
alter table empresa_cobrancas enable row level security;
drop policy if exists "cobrancas_leitura" on empresa_cobrancas;
create policy "cobrancas_leitura" on empresa_cobrancas for select using (
  is_admin_sistema()
  or empresa_id in (
    select empresa_id from usuario_empresa
    where usuario_id = auth.uid() and perfil_id = '00000000-0000-0000-0000-000000000002'
  )
);
drop policy if exists "cobrancas_admin_escrita" on empresa_cobrancas;
create policy "cobrancas_admin_escrita" on empresa_cobrancas for all
  using (is_admin_sistema()) with check (is_admin_sistema());

-- Log de webhook: admin_sistema apenas (escrito pelo service-role da API)
alter table asaas_webhook_eventos enable row level security;
drop policy if exists "webhook_eventos_admin" on asaas_webhook_eventos;
create policy "webhook_eventos_admin" on asaas_webhook_eventos for all
  using (is_admin_sistema()) with check (is_admin_sistema());

-- ─── Crédito de pacotes (chamado pelo webhook quando o pagamento confirma) ──
-- Execuções/tokens entram como saldo extra do período corrente (use ou perde).
create or replace function billing_creditar_execucoes(p_empresa_id uuid, p_qtd bigint)
returns void language plpgsql security definer as $$
begin
  perform avancar_periodo_assinatura(p_empresa_id);
  update empresa_assinaturas
    set execucoes_extra = execucoes_extra + p_qtd::int, atualizado_em = now()
    where empresa_id = p_empresa_id;
end $$;

create or replace function billing_creditar_tokens(p_empresa_id uuid, p_qtd bigint)
returns void language plpgsql security definer as $$
begin
  perform avancar_periodo_assinatura(p_empresa_id);
  update empresa_assinaturas
    set tokens_ia_extra = tokens_ia_extra + p_qtd, atualizado_em = now()
    where empresa_id = p_empresa_id;
end $$;
