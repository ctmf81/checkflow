-- ============================================================
-- NOTIFICAÇÃO — seed dos novos templates
-- ============================================================
-- plano_devolvido_n1  → WhatsApp + Email (N2 devolve o plano ao N1)
-- tarefa_publicada    → só WhatsApp (nova lista de tarefas publicada)
--
-- Roda numa migração à parte de 20260708120000 porque usa os valores de
-- enum adicionados lá (que só ficam disponíveis após aquela transação).

create or replace function seed_notificacao_templates_extra(p_empresa_id uuid)
returns void language plpgsql security definer as $$
begin

  -- ── plano_devolvido_n1 / whatsapp ─────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_devolvido_n1', 'whatsapp', null,
$tpl$🟡 *Plano de Ação devolvido para N1*

*Área:* {{subgrupo}}
*Atividade:* {{atividade}}
*Checklist:* {{checklist}}
*Devolvido por (N2):* {{ator}}
*Observação:* {{observacao}}

🔗 {{link}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── plano_devolvido_n1 / email ────────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'plano_devolvido_n1', 'email',
   '🟡 Plano de Ação devolvido para N1 — {{atividade}}',
$tpl$Olá, {{destinatario}}!

O plano de ação de {{atividade}} ({{checklist}}) foi devolvido para N1 por {{ator}}.

Área: {{subgrupo}}

Observação:
{{observacao}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

  -- ── tarefa_publicada / whatsapp ───────────────────────────
  insert into notificacao_templates (empresa_id, tipo, canal, assunto, corpo) values
  (p_empresa_id, 'tarefa_publicada', 'whatsapp', null,
$tpl$📋 *Nova lista de tarefas*

Olá, {{destinatario}}! Você tem uma nova lista para responder: *{{titulo}}*.

Abra o app na aba *Tarefas* para responder.
🔗 {{link}}$tpl$)
  on conflict (empresa_id, tipo, canal) do nothing;

end;
$$;

-- Nova empresa passa a receber os templates padrão + os extras
create or replace function trg_seed_notif_empresa()
returns trigger language plpgsql security definer as $$
begin
  perform seed_notificacao_templates(new.id);
  perform seed_notificacao_templates_extra(new.id);
  return new;
end;
$$;

-- Semeia os extras para empresas já existentes
do $$
declare r record;
begin
  for r in select id from empresas loop
    perform seed_notificacao_templates_extra(r.id);
  end loop;
end;
$$;
