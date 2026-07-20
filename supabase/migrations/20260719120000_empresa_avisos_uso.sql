-- Alertas de limite de uso ao admin da empresa (Fase 1): registro de
-- idempotência para o cron `/cron/billing/avisos-uso`.
--
-- Cada linha marca que um aviso (recurso × faixa) já foi enviado no período de
-- cobrança vigente. A chave inclui `periodo_ref` (= empresa_assinaturas.
-- periodo_inicio) → o aviso reseta naturalmente a cada novo período: execuções
-- e tokens zeram e voltam a poder alertar; armazenamento (permanente) só volta
-- a alertar na virada do período se ainda estiver acima da faixa.
--
-- Escrita/leitura pela plataforma (cron via service role, que ignora RLS).
-- RLS admin-only: tabela interna, sem exposição a membros da empresa.

create table if not exists empresa_avisos_uso (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  recurso      text not null check (recurso in ('execucoes','tokens_ia','armazenamento')),
  faixa        text not null check (faixa in ('80','100')),
  periodo_ref  date not null,
  avisado_em   timestamptz not null default now(),
  unique (empresa_id, recurso, faixa, periodo_ref)
);

create index if not exists idx_empresa_avisos_uso_empresa
  on empresa_avisos_uso (empresa_id, periodo_ref);

alter table empresa_avisos_uso enable row level security;

drop policy if exists "avisos_uso_admin" on empresa_avisos_uso;
create policy "avisos_uso_admin" on empresa_avisos_uso
  for all using (is_admin_sistema());
