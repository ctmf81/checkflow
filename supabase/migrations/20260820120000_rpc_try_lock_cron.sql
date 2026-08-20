-- Auditoria mensageria 2026-08-20: cron `/cron/reprocessar-aberturas-plano`
-- sem lock. Duas réplicas (ou disparo manual sobreposto) reenviavam a mesma
-- notificação até `marcarAbertoNotificado` correr — race real.
--
-- Fix: RPC `reservar_planos_pendentes_notificacao(p_limite, p_janela_dias)`
-- faz o SELECT + reserva atomicamente com UPDATE...RETURNING. Marca
-- `aberto_notificado_em = '1970-01-01'::timestamptz` (sentinela "em processo"
-- — o código de leitura já filtra `IS NULL` e ignora esse valor).
-- Réplicas concorrentes pegam conjuntos disjuntos. Se o envio falhar,
-- desmarca no worker. Não usa advisory lock (frágil com pgbouncer).

create or replace function reservar_planos_pendentes_notificacao(
  p_limite int default 100,
  p_janela_dias int default 2
)
returns table (id uuid, observacao_abertura text, criado_por uuid)
language sql security definer set search_path = public volatile as $$
  with pendentes as (
    select p.id
    from planos_acao p
    where p.aberto_notificado_em is null
      and p.created_at > (now() - (p_janela_dias || ' days')::interval)
    order by p.created_at
    limit p_limite
    for update skip locked
  )
  update planos_acao set
    aberto_notificado_em = '1970-01-01T00:00:00Z'::timestamptz
  where id in (select id from pendentes)
  returning id, observacao_abertura, criado_por;
$$;

-- Desfaz a reserva quando o envio falha (para reprocessar na próxima rodada).
-- Só desmarca se a coluna ainda está com o sentinela — nunca sobrescreve uma
-- data real (que significa "já foi notificado com sucesso" ou marca manual).
create or replace function desfazer_reserva_plano_notificacao(p_plano_id uuid)
returns void language sql security definer set search_path = public volatile as $$
  update planos_acao set aberto_notificado_em = null
  where id = p_plano_id
    and aberto_notificado_em = '1970-01-01T00:00:00Z'::timestamptz;
$$;
