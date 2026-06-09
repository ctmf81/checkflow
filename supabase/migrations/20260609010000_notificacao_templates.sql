-- ============================================================
-- NOTIFICAÇÃO TEMPLATES — gestão de mensagens por empresa
-- ============================================================
-- Cada empresa tem um registro por tipo × canal.
-- Seed automático ao inserir nova empresa via trigger.
-- Corpo usa {{variavel}} para interpolação no momento do envio.

create type notificacao_tipo as enum (
  'ticket_aberto',
  'ticket_movimentado',
  'plano_aberto',
  'plano_enviado_n2',
  'reset_senha'
);

create type notificacao_canal as enum ('whatsapp', 'email');

create table notificacao_templates (
  id          uuid primary key default uuid_generate_v4(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  tipo        notificacao_tipo not null,
  canal       notificacao_canal not null,
  ativo       boolean not null default true,
  assunto     text,   -- somente email
  corpo       text not null,
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, tipo, canal)
);

-- atualizado_em automático
create or replace function notif_templates_set_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end;
$$;
create trigger trg_notif_templates_updated
  before update on notificacao_templates
  for each row execute function notif_templates_set_atualizado_em();

-- ─── RLS ──────────────────────────────────────────────────────

alter table notificacao_templates enable row level security;

create policy "notif_templates_leitura" on notificacao_templates
  for select using (
    exists (
      select 1 from usuario_unidade uu
      join unidades u on u.id = uu.unidade_id
      where uu.usuario_id = auth.uid() and u.empresa_id = notificacao_templates.empresa_id
    )
  );

create policy "notif_templates_escrita" on notificacao_templates
  for all using (
    is_admin_sistema()
    or exists (
      select 1 from usuario_unidade uu
      join unidades u on u.id = uu.unidade_id
      where uu.usuario_id = auth.uid() and u.empresa_id = notificacao_templates.empresa_id
    )
  );

-- ─── Seed de defaults ─────────────────────────────────────────
-- Chamado ao criar empresa e também ao rodar esta migration
-- para empresas já existentes.

create or replace function seed_notificacao_templates(p_empresa_id uuid)
returns void language plpgsql security definer as $$
begin

  -- ── ticket_aberto / whatsapp ──────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'ticket_aberto', 'whatsapp', null,
$$tpl${{emoji_prioridade}} *Novo Ticket #{{numero}} — {{prioridade}}*

*{{titulo}}*

*Destino:* {{grupo}} / {{subgrupo}}{{linha_categoria}}
*Aberto por:* {{ator}}

{{descricao}}

🔗 {{link}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── ticket_aberto / email ─────────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'ticket_aberto', 'email',
   '{{emoji_prioridade}} Ticket #{{numero}} aberto — {{titulo}}',
$$tpl$Olá, {{destinatario}}!

Um novo ticket foi aberto para a sua área e aguarda ser assumido.

Ticket: #{{numero}} — {{titulo}}
Destino: {{grupo}} / {{subgrupo}}{{linha_categoria}}
Prioridade: {{prioridade}}
Aberto por: {{ator}}

{{descricao}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── ticket_movimentado / whatsapp ─────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'ticket_movimentado', 'whatsapp', null,
$$tpl$📋 *Ticket #{{numero}} — {{evento}}*

*{{titulo}}*
*Por:* {{ator}}

{{observacao}}

🔗 {{link}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── ticket_movimentado / email ────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'ticket_movimentado', 'email',
   '📋 Ticket #{{numero}} — {{evento}}',
$$tpl$Olá, {{destinatario}}!

Houve uma movimentação no ticket que envolve você.

Ticket: #{{numero}} — {{titulo}}
Ação: {{evento}}
Por: {{ator}}

{{observacao}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_aberto / whatsapp ───────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_aberto', 'whatsapp', null,
$$tpl$🔴 *Novo Plano de Ação aberto*

*Área:* {{subgrupo}}
*Atividade:* {{atividade}}
*Checklist:* {{checklist}}
*Aberto por:* {{ator}}
*Observação:* {{observacao}}{{linha_sla}}

🔗 {{link}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_aberto / email ──────────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_aberto', 'email',
   '🔴 Plano de Ação aberto — {{atividade}}',
$$tpl$Olá, {{destinatario}}!

Um novo plano de ação foi aberto na sua área e precisa de moderação.

Área: {{subgrupo}}
Atividade: {{atividade}}
Checklist: {{checklist}}
Aberto por: {{ator}}
{{linha_sla}}

Observação:
{{observacao}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_enviado_n2 / whatsapp ───────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_enviado_n2', 'whatsapp', null,
$$tpl$🟠 *Plano de Ação escalado para você (N2)*

*Área:* {{subgrupo}}
*Atividade:* {{atividade}}
*Checklist:* {{checklist}}
*Enviado por (N1):* {{n1}}
*Observação:* {{observacao}}

🔗 {{link}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_enviado_n2 / email ──────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_enviado_n2', 'email',
   '🟠 Plano de Ação escalado para você — {{atividade}}',
$$tpl$Olá, {{destinatario}}!

O moderador N1 escalou um plano de ação para sua análise.

Área: {{subgrupo}}
Atividade: {{atividade}}
Checklist: {{checklist}}
Enviado por (N1): {{n1}}

Observação do N1:
{{observacao}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── reset_senha / whatsapp ────────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'reset_senha', 'whatsapp', null,
$$tpl$Olá{{linha_nome}}! 👋

Você solicitou a recuperação de senha do *CheckFlow*.

Clique no link abaixo para criar uma nova senha:
{{link}}

_Este link expira em 1 hora._$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── reset_senha / email ───────────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'reset_senha', 'email',
   'Recuperação de senha — CheckFlow',
$$tpl$Olá{{linha_nome}}!

Você solicitou a recuperação de senha do CheckFlow.

Clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.

{{link}}$$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

end;
$$;

-- ─── Trigger: seed ao criar nova empresa ──────────────────────

create or replace function trg_seed_notif_empresa()
returns trigger language plpgsql security definer as $$
begin
  perform seed_notificacao_templates(new.id);
  return new;
end;
$$;

create trigger trg_empresa_notif_seed
  after insert on empresas
  for each row execute function trg_seed_notif_empresa();

-- ─── Seed para empresas já existentes ────────────────────────

do $$
declare r record;
begin
  for r in select id from empresas loop
    perform seed_notificacao_templates(r.id);
  end loop;
end;
$$;

-- ─── Índice ───────────────────────────────────────────────────

create index idx_notif_templates_empresa on notificacao_templates(empresa_id);
