---
name: queries
description: Biblioteca de queries SQL prontas para gestão e suporte do CheckFlow, organizadas por tela/funcionalidade. Use quando o usuário pedir para "consultar", "verificar", "corrigir dado direto no banco", "ver status de X", ou pedir uma query para o Supabase SQL Editor.
---

# Queries de Gestão — CheckFlow

> Cole no SQL Editor do Supabase. Troque os valores entre `<...>` pelos reais.
> Queries de escrita (`update`/`delete`) estão marcadas com ⚠️ — rode primeiro o `select` equivalente para conferir o impacto.

## Evolution Rule
Sempre que criar uma função/RPC ou query nova usada com frequência (debug, correção manual, suporte), adicione aqui na seção correspondente.

---

## 1. Painel de Sistema (`/sistema`)

### Listar empresas com contagens
```sql
select e.id, e.nome, e.cnpj, e.status, e.criado_em,
       (select count(*) from unidades u where u.empresa_id = e.id) as unidades,
       (select count(*) from usuario_empresa ue where ue.empresa_id = e.id) as usuarios
from empresas e
order by e.nome;
```

### Alterar status de uma empresa
```sql
-- ⚠️
update empresas set status = 'inativo', atualizado_em = now()
where id = '<empresa_id>';
```

### Excluir empresa permanentemente (cascata)
Use a RPC, não `delete` direto — ela valida `status = 'inativo'` e permissão de admin:
```sql
-- ⚠️ irreversível
select excluir_empresa_cascata('<empresa_id>');
```

### Conferir se as FKs de cascata foram aplicadas
```sql
select conrelid::regclass as tabela, conname, confdeltype
from pg_constraint
where conname like '%_fkey_cascade';
-- confdeltype = 'c' (cascade) — deve retornar 8 linhas
```

---

## 2. Usuários e Acessos (`/gestao/acessos/usuarios`, `/perfis`)

### Buscar usuário por e-mail/nome
```sql
select u.id, u.nome, u.email, u.status, u.primeiro_acesso, u.turno_id,
       u.termos_aceitos_em, u.termos_versao_aceita
from usuarios u
where u.email ilike '%<termo>%' or u.nome ilike '%<termo>%';
```

### Empresas, perfis e unidades de um usuário
```sql
select e.nome as empresa, p.nome as perfil
from usuario_empresa ue
join empresas e on e.id = ue.empresa_id
join perfis p   on p.id = ue.perfil_id
where ue.usuario_id = '<usuario_id>';

select un.nome as unidade
from usuario_unidade uu
join unidades un on un.id = uu.unidade_id
where uu.usuario_id = '<usuario_id>';
```

### Permissões efetivas de um perfil
```sql
select pm.recurso, pm.acao, pm.descricao
from perfil_permissoes pp
join permissoes pm on pm.id = pp.permissao_id
where pp.perfil_id = '<perfil_id>'
order by pm.recurso, pm.acao;
```

### Trocar perfil de um usuário numa empresa
```sql
-- ⚠️ trigger valida_troca_perfil bloqueia perfis não-públicos se quem
-- executa não for Admin de empresa/sistema — rode autenticado como admin
update usuario_empresa
set perfil_id = '<novo_perfil_id>'
where usuario_id = '<usuario_id>' and empresa_id = '<empresa_id>';
```

### Usuários sem nenhuma empresa vinculada (órfãos)
```sql
select u.id, u.nome, u.email
from usuarios u
left join usuario_empresa ue on ue.usuario_id = u.id
where ue.usuario_id is null;
```

---

## 3. Onboarding (`/sistema/onboarding`)

### Ver config atual de todas as telas
```sql
select page_id, titulo, ativo,
       (cards_override is not null) as customizado
from onboarding_paginas
order by page_id;
```

### Ativar/desativar onboarding de uma tela
```sql
-- ⚠️
update onboarding_paginas set ativo = false, updated_at = now()
where page_id = '<page_id>';
```

### Resetar conteúdo customizado para o padrão do código
```sql
-- ⚠️
update onboarding_paginas set cards_override = null, updated_at = now()
where page_id = '<page_id>';
```

### Adicionar nova tela ao registro (depois de adicionar em `registry.ts`)
```sql
insert into onboarding_paginas (page_id, titulo, ativo)
values ('<page_id>', '<Título>', true)
on conflict (page_id) do nothing;
```

---

## 4. Notificações (`/gestao/configuracoes/notificacoes`)

### Ver templates de uma empresa
```sql
select tipo, canal, ativo, assunto, left(corpo, 80) as corpo_preview
from notificacao_templates
where empresa_id = '<empresa_id>'
order by tipo, canal;
```

### Restaurar templates padrão para uma empresa (sem apagar customizados)
```sql
select seed_notificacao_templates('<empresa_id>');
```

### Desativar um canal de notificação para um tipo
```sql
-- ⚠️
update notificacao_templates set ativo = false
where empresa_id = '<empresa_id>' and tipo = '<tipo>' and canal = '<whatsapp|email>';
```

---

## 5. Tickets (`/gestao/tickets`)

### Tickets com SLA vencido (não resolvidos)
```sql
select t.numero, t.titulo, t.status, t.prioridade, t.sla_deadline_at,
       u.nome as unidade
from tickets t
join unidades u on u.id = t.unidade_id
where t.sla_deadline_at < now()
  and t.status not in ('corrigido','nao_corrigido','cancelado','improcedente','corrigido_parcialmente')
order by t.sla_deadline_at;
```

### Tickets por status (visão geral de uma unidade)
```sql
select status, count(*) 
from tickets
where unidade_id = '<unidade_id>'
group by status
order by count(*) desc;
```

### Categorias sem SLA configurado
```sql
select c.id, c.nome, c.unidade_id
from ticket_categorias c
left join ticket_sla_config s on s.categoria_id = c.id
where s.id is null and c.ativo;
```

### Timeline completa de um ticket
```sql
select tipo, observacao, criado_por, criado_em
from ticket_eventos
where ticket_id = '<ticket_id>'
order by criado_em;
```

---

## 6. Planos de Ação (`/gestao/planos-acao`)

### Planos vencidos em moderação
```sql
select p.id, p.identificador, p.status, p.sla_prazo,
       u.nome as unidade, sg.nome as subgrupo
from planos_acao p
join unidades u on u.id = p.unidade_id
join subgrupos sg on sg.id = p.subgrupo_id
where p.sla_prazo < now()
  and p.status in ('em_moderacao_n1','em_moderacao_n2')
order by p.sla_prazo;
```

### Planos por status (dashboard rápido)
```sql
select status, count(*) from planos_acao group by status;
```

### Movimentações de um plano
```sql
select m.tipo, m.observacao, u.nome as autor, m.created_at
from plano_acao_movimentacoes m
join usuarios u on u.id = m.usuario_id
where m.plano_acao_id = '<plano_id>'
order by m.created_at;
```

---

## 7. Checklists & Execuções (`/gestao/checklists`)

### Checklists publicados de uma unidade
```sql
select id, nome, status, versao_atual, subgrupo_id, tempo_guarda_meses
from checklists
where unidade_id = '<unidade_id>' and status = 'publicado'
order by nome;
```

### Execuções pendentes (em andamento) e atrasadas
```sql
select ce.id, c.nome as checklist, ce.status, ce.data_expiracao, ce.criado_em
from checklist_execucoes ce
join checklists c on c.id = ce.checklist_id
where ce.unidade_id = '<unidade_id>'
  and ce.status = 'em_andamento'
  and ce.data_expiracao < now();
```

### Checklist usado em workflow publicado (não pode ser inativado)
```sql
select w.nome as workflow, w.status
from workflow_estagio_itens wei
join workflow_estagios we on we.id = wei.estagio_id
join workflows w on w.id = we.workflow_id
where wei.checklist_id = '<checklist_id>' and w.status = 'publicado';
```

---

## 8. Workflows (`/gestao/workflows`)

### Execuções em andamento de uma unidade
```sql
select we.id, w.nome as workflow, we.status, we.estagio_atual_ordem, we.iniciado_em
from workflow_execucoes we
join workflows w on w.id = we.workflow_id
where we.unidade_id = '<unidade_id>' and we.status = 'em_andamento';
```

### Estado dos itens de uma execução
```sql
select wi.status, c.nome as checklist, wi.liberado_em, wi.concluido_em
from workflow_item_execucoes wi
join workflow_estagio_itens wei on wei.id = wi.estagio_item_id
join checklists c on c.id = wei.checklist_id
where wi.workflow_execucao_id = '<execucao_id>'
order by wei.estagio_id;
```

### Forçar reavaliação de avanço (após correção manual)
```sql
select workflow_avaliar_avanco('<execucao_id>');
```

---

## 9. Agendamentos (`/gestao/agendamentos`)

### Próximos disparos
```sql
select id, tipo_alvo, intervalo_unidade, intervalo_valor, proxima_execucao, ativo
from agendamentos
where unidade_id = '<unidade_id>'
order by proxima_execucao;
```

### Processar agendamentos manualmente (debug, fora do cron)
```sql
select agendamentos_processar();
```

---

## 10. Turnos (`/gestao/acessos/turnos`)

### Verificar se um usuário está no turno agora
```sql
select usuario_esta_no_turno('<usuario_id>');
```

### Usuários sem turno definido (recebem notificação a qualquer hora)
```sql
select id, nome, email from usuarios where turno_id is null;
```

---

## 11. Termos de Uso (`/sistema/termos`)

### Versão vigente
```sql
select versao, atualizado_em
from termos_uso
order by atualizado_em desc
limit 1;
```

### Usuários que ainda não aceitaram a versão vigente
```sql
select u.id, u.nome, u.email, u.termos_versao_aceita
from usuarios u, (select versao from termos_uso order by atualizado_em desc limit 1) v
where u.termos_versao_aceita is distinct from v.versao;
```

---

## 12. WhatsApp / Evolution API (`/sistema/whatsapp`)

### Status da última sincronização (ver tabela usada pela rota `/whatsapp/status`)
```sql
-- A instância em si vive na Evolution API; aqui só checamos templates
-- e falhas de envio relacionadas
select empresa_id, tipo, canal, ativo from notificacao_templates where canal = 'whatsapp';
```

---

## 13. Sessão (`sessao_usuario`)

### Forçar usuário a escolher empresa novamente no próximo login
```sql
-- ⚠️
update sessao_usuario set ultima_empresa_id = null, ultima_unidade_id = null
where usuario_id = '<usuario_id>';
```
