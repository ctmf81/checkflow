-- ============================================================
-- Durabilidade da notificação de "Plano de Ação aberto" (N1)
-- ============================================================
-- Antes: o aviso de abertura era best-effort (fire-and-forget). Se a Evolution/
-- WhatsApp estivesse fora no momento do disparo — sobretudo na SINCRONIZAÇÃO de
-- planos criados OFFLINE, que acontece toda de uma vez ao reconectar — o aviso
-- ao N1 se perdia, sem retry.
--
-- Agora: aberto_notificado_em registra QUANDO o disparo 'aberto' completou sem
-- erro de canal. NULL = ainda não confirmado → o cron
-- /cron/reprocessar-aberturas-plano reenvia até confirmar. A escrita do carimbo
-- e o reenvio são feitos pela API com service role (sem mexer em RLS).

alter table planos_acao
  add column if not exists aberto_notificado_em timestamptz;

-- Backfill: planos JÁ existentes são considerados "já notificados" — não reenviar
-- histórico. Só os criados a partir daqui entram no fluxo de retry.
update planos_acao
  set aberto_notificado_em = created_at
  where aberto_notificado_em is null;

-- Índice parcial: o cron varre só os pendentes (poucos), nunca a tabela inteira.
create index if not exists idx_planos_acao_aberto_pendente
  on planos_acao (created_at)
  where aberto_notificado_em is null;
