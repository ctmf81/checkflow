-- Throttle dos lembretes de gestão ao admin (Fase 3). Guarda o último envio de
-- cada TIPO de lembrete por empresa, para o cron `/cron/gestao/lembretes` não
-- reenviar todo dia. Hoje o único tipo é 'pre_cadastros_pendentes', mas a
-- coluna `tipo` deixa a tabela pronta para novos lembretes de gestão.
--
-- Escrita/leitura pela plataforma (cron via service role, que ignora RLS).
-- RLS admin-only: tabela interna, sem exposição a membros da empresa.

create table if not exists empresa_gestao_lembretes (
  empresa_id       uuid not null references empresas(id) on delete cascade,
  tipo             text not null,
  ultimo_envio_em  timestamptz not null default now(),
  primary key (empresa_id, tipo)
);

alter table empresa_gestao_lembretes enable row level security;

drop policy if exists "gestao_lembretes_admin" on empresa_gestao_lembretes;
create policy "gestao_lembretes_admin" on empresa_gestao_lembretes
  for all using (is_admin_sistema());
