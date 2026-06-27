-- ============================================================
-- PRÉ-CADASTRO público (via QR Code) + moderação pelo admin da empresa
-- ============================================================
-- A pessoa acessa uma página pública (QR aponta para a empresa), preenche um
-- formulário e cria um registro PENDENTE. O admin da empresa modera na tela de
-- usuários; ao aprovar, o usuário é criado pelo fluxo existente (/api/usuarios/
-- criar), que já dispara o código de primeiro acesso (WhatsApp + e-mail).

create table if not exists pre_cadastros (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,
  cpf           text not null,
  telefone      text,
  email         text,
  observacao    text,                                  -- ex: setor/unidade que atua
  status        text not null default 'pendente' check (status in ('pendente','aprovado','rejeitado')),
  usuario_id    uuid references usuarios(id) on delete set null,  -- preenchido na aprovação
  criado_em     timestamptz not null default now(),
  moderado_por  uuid references usuarios(id) on delete set null,
  moderado_em   timestamptz
);

create index if not exists idx_pre_cadastros_empresa_status on pre_cadastros (empresa_id, status);

alter table pre_cadastros enable row level security;

grant insert on pre_cadastros to anon, authenticated;
grant select, update on pre_cadastros to authenticated;

-- INSERT público (anônimo): só pode criar registro PENDENTE. Sem leitura/edição
-- para anon (anti-enumeração). A moderação é a barreira contra spam virar usuário.
drop policy if exists "pre_cad_insert_publico" on pre_cadastros;
create policy "pre_cad_insert_publico" on pre_cadastros
  for insert to anon, authenticated
  with check (status = 'pendente');

-- SELECT: admin de sistema ou admin da empresa de destino
drop policy if exists "pre_cad_select_admin" on pre_cadastros;
create policy "pre_cad_select_admin" on pre_cadastros
  for select to authenticated
  using (is_admin_sistema() or is_admin_empresa(empresa_id));

-- UPDATE: admin modera (aprovar/rejeitar)
drop policy if exists "pre_cad_update_admin" on pre_cadastros;
create policy "pre_cad_update_admin" on pre_cadastros
  for update to authenticated
  using (is_admin_sistema() or is_admin_empresa(empresa_id))
  with check (is_admin_sistema() or is_admin_empresa(empresa_id));

-- RPC pública: nome + logo da empresa para a página de pré-cadastro, sem expor
-- a tabela empresas ao anon. Só empresas ativas.
create or replace function empresa_publica(p_id uuid)
returns table (nome text, logo_url text)
language sql security definer stable set search_path = public as $$
  select e.nome, e.logo_url from empresas e where e.id = p_id and e.status <> 'inativo'
$$;

revoke all on function empresa_publica(uuid) from public;
grant execute on function empresa_publica(uuid) to anon, authenticated;
