-- ============================================================
-- PRÉ-CADASTRO público de PARCEIROS + validação pelo admin de sistema
-- ============================================================
-- Interessado em ser parceiro acessa uma página pública (/seja-parceiro),
-- preenche um formulário e cria um registro PENDENTE. O admin de sistema valida
-- na tela de Parceiros; ao aprovar, vira um `parceiros` (status ativo) e é só
-- associar a uma empresa. Espelha o pré-cadastro de usuários (20260627000000).

create table if not exists parceiro_pre_cadastros (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  documento     text not null,                                -- CPF/CNPJ só dígitos
  email         text not null,
  telefone      text,
  mensagem      text,                                         -- como pretende indicar / observações
  status        text not null default 'pendente' check (status in ('pendente','aprovado','rejeitado')),
  parceiro_id   uuid references parceiros(id) on delete set null,  -- preenchido na aprovação
  criado_em     timestamptz not null default now(),
  moderado_por  uuid,
  moderado_em   timestamptz
);

create index if not exists idx_parceiro_pre_cadastros_status on parceiro_pre_cadastros (status, criado_em desc);

alter table parceiro_pre_cadastros enable row level security;

grant insert on parceiro_pre_cadastros to anon, authenticated;
grant select, update on parceiro_pre_cadastros to authenticated;

-- INSERT público (anônimo): só cria registro PENDENTE. Sem leitura/edição para
-- anon (anti-enumeração). A validação é a barreira contra spam virar parceiro.
drop policy if exists "parceiro_pre_cad_insert_publico" on parceiro_pre_cadastros;
create policy "parceiro_pre_cad_insert_publico" on parceiro_pre_cadastros
  for insert to anon, authenticated
  with check (status = 'pendente');

-- SELECT/UPDATE: só admin de sistema (parceiros são dado sensível admin-only).
drop policy if exists "parceiro_pre_cad_select_admin" on parceiro_pre_cadastros;
create policy "parceiro_pre_cad_select_admin" on parceiro_pre_cadastros
  for select to authenticated using (is_admin_sistema());

drop policy if exists "parceiro_pre_cad_update_admin" on parceiro_pre_cadastros;
create policy "parceiro_pre_cad_update_admin" on parceiro_pre_cadastros
  for update to authenticated using (is_admin_sistema()) with check (is_admin_sistema());
