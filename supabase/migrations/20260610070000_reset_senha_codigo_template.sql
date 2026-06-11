-- ============================================================
-- reset_senha agora envia um CODIGO de 6 digitos (OTP), nao um link
-- ============================================================
-- Atualiza os templates padrao de reset_senha (whatsapp/email) para
-- usar {{codigo}} no lugar de {{link}}, e recria seed_notificacao_templates
-- mantendo as demais seções intactas.

create or replace function seed_notificacao_templates(p_empresa_id uuid)
returns void language plpgsql security definer as $$
begin

  -- ── ticket_aberto / whatsapp ──────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'ticket_aberto', 'whatsapp', null,
$tpl${{emoji_prioridade}} *Novo Ticket #{{numero}} — {{prioridade}}*

*{{titulo}}*

*Destino:* {{grupo}} / {{subgrupo}}{{linha_categoria}}
*Aberto por:* {{ator}}

{{descricao}}

🔗 {{link}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── ticket_aberto / email ─────────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'ticket_aberto', 'email',
   '{{emoji_prioridade}} Ticket #{{numero}} aberto — {{titulo}}',
$tpl$Olá, {{destinatario}}!

Um novo ticket foi aberto para a sua área e aguarda ser assumido.

Ticket: #{{numero}} — {{titulo}}
Destino: {{grupo}} / {{subgrupo}}{{linha_categoria}}
Prioridade: {{prioridade}}
Aberto por: {{ator}}

{{descricao}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── ticket_movimentado / whatsapp ─────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'ticket_movimentado', 'whatsapp', null,
$tpl$📋 *Ticket #{{numero}} — {{evento}}*

*{{titulo}}*
*Por:* {{ator}}

{{observacao}}

🔗 {{link}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── ticket_movimentado / email ────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'ticket_movimentado', 'email',
   '📋 Ticket #{{numero}} — {{evento}}',
$tpl$Olá, {{destinatario}}!

Houve uma movimentação no ticket que envolve você.

Ticket: #{{numero}} — {{titulo}}
Ação: {{evento}}
Por: {{ator}}

{{observacao}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_aberto / whatsapp ───────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_aberto', 'whatsapp', null,
$tpl$🔴 *Novo Plano de Ação aberto*

*Área:* {{subgrupo}}
*Atividade:* {{atividade}}
*Checklist:* {{checklist}}
*Aberto por:* {{ator}}
*Observação:* {{observacao}}{{linha_sla}}

🔗 {{link}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_aberto / email ──────────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_aberto', 'email',
   '🔴 Plano de Ação aberto — {{atividade}}',
$tpl$Olá, {{destinatario}}!

Um novo plano de ação foi aberto na sua área e precisa de moderação.

Área: {{subgrupo}}
Atividade: {{atividade}}
Checklist: {{checklist}}
Aberto por: {{ator}}
{{linha_sla}}

Observação:
{{observacao}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_enviado_n2 / whatsapp ───────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_enviado_n2', 'whatsapp', null,
$tpl$🟠 *Plano de Ação escalado para você (N2)*

*Área:* {{subgrupo}}
*Atividade:* {{atividade}}
*Checklist:* {{checklist}}
*Enviado por (N1):* {{n1}}
*Observação:* {{observacao}}

🔗 {{link}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_enviado_n2 / email ──────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_enviado_n2', 'email',
   '🟠 Plano de Ação escalado para você — {{atividade}}',
$tpl$Olá, {{destinatario}}!

O moderador N1 escalou um plano de ação para sua análise.

Área: {{subgrupo}}
Atividade: {{atividade}}
Checklist: {{checklist}}
Enviado por (N1): {{n1}}

Observação do N1:
{{observacao}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── reset_senha / whatsapp ────────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'reset_senha', 'whatsapp', null,
$tpl$Olá{{linha_nome}}! 👋

Seu código de verificação do *CheckFlow* é:

*{{codigo}}*

Informe esse código na tela de recuperação de senha (ou primeiro acesso) para continuar.

_Este código expira em 15 minutos. Se você não solicitou, ignore esta mensagem._$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── reset_senha / email ───────────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'reset_senha', 'email',
   'Código de verificação — CheckFlow',
$tpl$Olá{{linha_nome}}!

Seu código de verificação do CheckFlow é:

{{codigo}}

Informe esse código na tela de recuperação de senha (ou primeiro acesso) para continuar. Ele expira em 15 minutos.$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

end;
$$;

-- Atualiza, para empresas existentes, somente os templates de reset_senha
-- que ainda estão com o conteúdo padrão antigo (baseado em {{link}}) —
-- preserva customizações feitas pelos admins.
update notificacao_templates
set corpo = $tpl$Olá{{linha_nome}}! 👋

Seu código de verificação do *CheckFlow* é:

*{{codigo}}*

Informe esse código na tela de recuperação de senha (ou primeiro acesso) para continuar.

_Este código expira em 15 minutos. Se você não solicitou, ignore esta mensagem._$tpl$
where tipo = 'reset_senha' and canal = 'whatsapp' and corpo like '%{{link}}%';

update notificacao_templates
set assunto = 'Código de verificação — CheckFlow',
    corpo = $tpl$Olá{{linha_nome}}!

Seu código de verificação do CheckFlow é:

{{codigo}}

Informe esse código na tela de recuperação de senha (ou primeiro acesso) para continuar. Ele expira em 15 minutos.$tpl$
where tipo = 'reset_senha' and canal = 'email' and corpo like '%{{link}}%';
