-- Escala horizontal: torna o estado de observabilidade da API compartilhado
-- entre réplicas. Antes, dois pedaços viviam SÓ na memória do processo Fastify
-- (instância única): (1) a lista de alertas do painel /sistema/alertas e (2) o
-- último estado do healthcheck do WhatsApp. Com 2+ réplicas cada processo tinha
-- a sua cópia → painel inconsistente e o anti-spam do alerta de WhatsApp se
-- perdia (e-mail repetido). Movendo para o banco, todas as réplicas veem o mesmo.
--
-- Escrita/leitura pela plataforma (API via service role, que ignora RLS).
-- RLS admin-only: tabelas internas de ops, sem exposição a membros da empresa.

-- 1) Alertas do painel (substitui o Map em memória de routes/alerts.ts).
--    id é texto porque as origens já definem a chave (ex.: 'whatsapp-down-<ts>'
--    do healthcheck, ou o id do alerta vindo do webhook do Railway).
create table if not exists sistema_alertas (
  id          text primary key,
  alert_type  text not null,
  severity    text not null,
  message     text not null,
  value       numeric not null default 0,
  threshold   numeric not null default 0,
  service     text not null,
  created_at  timestamptz not null default now(),
  acked       boolean not null default false,
  acked_at    timestamptz
);

-- Ordena/limita por data na leitura (últimos 100, janela de 24h).
create index if not exists sistema_alertas_created_at_idx
  on sistema_alertas (created_at desc);

alter table sistema_alertas enable row level security;

drop policy if exists "sistema_alertas_admin" on sistema_alertas;
create policy "sistema_alertas_admin" on sistema_alertas
  for all using (is_admin_sistema());

-- 2) Estado interno chave→valor (substitui o `let ultimoWhatsappOk` em memória
--    de routes/whatsapp.ts). Genérico de propósito: hoje guarda 'whatsapp_ok',
--    mas serve para qualquer flag de estado da plataforma que precise sobreviver
--    ao processo e ser compartilhada entre réplicas.
create table if not exists sistema_estado (
  chave          text primary key,
  valor          text,
  atualizado_em  timestamptz not null default now()
);

alter table sistema_estado enable row level security;

drop policy if exists "sistema_estado_admin" on sistema_estado;
create policy "sistema_estado_admin" on sistema_estado
  for all using (is_admin_sistema());
