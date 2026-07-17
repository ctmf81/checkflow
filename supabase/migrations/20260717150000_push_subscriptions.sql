-- Web Push (PWA): inscrições de notificação por aparelho.
-- Cada usuário pode ter N inscrições (um por navegador/dispositivo).
-- O envio (API, service role) lê todas; o usuário gerencia só as suas.

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  endpoint    text not null unique,          -- URL única do push service (identifica o aparelho)
  p256dh      text not null,                 -- chave pública da inscrição
  auth        text not null,                 -- segredo de autenticação da inscrição
  user_agent  text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_usuario on push_subscriptions(usuario_id);

alter table push_subscriptions enable row level security;

drop policy if exists "push_sub_select" on push_subscriptions;
create policy "push_sub_select" on push_subscriptions for select using (
  usuario_id = auth.uid() or is_admin_sistema()
);

drop policy if exists "push_sub_insert" on push_subscriptions;
create policy "push_sub_insert" on push_subscriptions for insert with check (
  usuario_id = auth.uid()
);

-- UPDATE necessário para o upsert por endpoint (reinscrição no mesmo aparelho
-- atualiza as chaves p256dh/auth).
drop policy if exists "push_sub_update" on push_subscriptions;
create policy "push_sub_update" on push_subscriptions for update using (
  usuario_id = auth.uid()
) with check (
  usuario_id = auth.uid()
);

drop policy if exists "push_sub_delete" on push_subscriptions;
create policy "push_sub_delete" on push_subscriptions for delete using (
  usuario_id = auth.uid() or is_admin_sistema()
);
