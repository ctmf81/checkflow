---
name: launch
description: Pre-launch checklist for CheckFlow — use before onboarding any paying or trial user. Covers technical blockers, features pendentes, infraestrutura e requisitos de negócio. Trigger on any mention of "lançar", "primeiro cliente", "trial", "precificação", "planos", "monetização", "cobrar", "pagante", or "pronto para produção".
---

# 🚀 Launch Readiness — CheckFlow

> Consulte este arquivo **antes de ativar qualquer usuário trial ou pagante.**
> Status: 🔴 = bloqueador | 🟡 = importante, pode lançar sem | 🟢 = pronto

---

## 1. Infraestrutura & Deploy

| # | Item | Status | Ação |
|---|------|--------|------|
| 1.1 | Chaves de IA (Gemini/Anthropic/OpenAI/Groq/custom) | 🟢 | Gerenciadas em `/sistema/integracoes-ia` (tabela `ia_provedores`, migrations aplicadas) — env vars são só fallback |
| 1.2 | Migrations pendentes do Supabase | 🟢 | Todas aplicadas até 2026-06-13 (ver `/status`) |
| 1.3 | `SUPABASE_SECRET_KEY` configurada no Railway | 🟢 | Já configurado |
| 1.4 | Domínio customizado | 🟡 | Opcional no início |

---

## 2. WhatsApp (Evolution API)

| # | Item | Status | Ação |
|---|------|--------|------|
| 2.1 | Envio de mensagens com falha silenciosa | 🔴 | Revisar fluxo de disparo — tratar erros e exibir feedback |
| 2.2 | Redis desabilitado (`CACHE_REDIS_ENABLED=false`) | 🟡 | Verificar se está setado na Evolution API no Railway |
| 2.3 | Reconexão automática de sessão WhatsApp | 🟡 | Hoje reconecta manual via QR — avaliar reconexão automática |
| 2.4 | Templates de mensagem revisados e testados | 🔴 | Testar cada trigger de disparo (execução concluída, reprovação, workflow avançou) |

---

## 3. Precificação & Planos (a desenvolver)

| # | Item | Status | Ação |
|---|------|--------|------|
| 3.1 | Definir modelo de planos (ex: por unidade, por usuário, por execução) | 🔴 | Decisão de produto — definir antes de codar |
| 3.2 | Tabela `planos` e `empresa_plano` no banco | 🔴 | Migration + RLS |
| 3.3 | Tela de gestão de planos (admin CheckFlow) | 🔴 | UI interna para ativar/desativar planos por empresa |
| 3.4 | Limites por plano (ex: nº de usuários, unidades, checklists) | 🔴 | Regras de negócio + enforcement no backend |
| 3.5 | Gateway de pagamento (Stripe ou Pagar.me) | 🟡 | Pode começar com cobrança manual/boleto |
| 3.6 | Trial automático com expiração | 🟡 | Período de carência por empresa — campo `trial_ate` em `empresas` |
| 3.7 | Bloqueio gracioso ao vencer plano/trial | 🟡 | Banner de aviso + trava de novas execuções |

---

## 4. IA — Consulta Inteligente (Gemini)

| # | Item | Status | Ação |
|---|------|--------|------|
| 4.1 | Provedor de IA ativo configurado | 🟢 | Ver item 1.1 |
| 4.2 | Limite gratuito: 1.500 req/dia por chave | 🟡 | OK para início; monitorar volume |
| 4.3 | Migrar para plano pago Gemini se ultrapassar limite | 🟡 | Ativar billing na Google Cloud quando necessário |
| 4.4 | Restringir `consulta_inteligente` por plano | 🟡 | Feature premium — desabilitar em planos básicos via `planos.features` |

---

## 5. Segurança & Conformidade

| # | Item | Status | Ação |
|---|------|--------|------|
| 5.1 | RLS em todas as tabelas de dados de usuário | 🟢 | Verificado — ver `/security` |
| 5.2 | Secrets fora do código-fonte | 🟢 | Nunca commitados |
| 5.3 | LGPD — política de privacidade | 🟡 | Necessária antes de clientes pagantes |
| 5.4 | Backup automático do Supabase | 🟡 | Verificar plano do Supabase (PITR) |

---

## 6. Experiência do Primeiro Uso (Onboarding)

| # | Item | Status | Ação |
|---|------|--------|------|
| 6.1 | Fluxo de cadastro de empresa funcional | 🟡 | Verificar se cria empresa + unidade padrão automaticamente |
| 6.2 | E-mail de boas-vindas | 🟡 | Supabase Auth email templates |
| 6.3 | Dados de exemplo / seed por empresa | 🟡 | Facilita adoção no trial |

---

## Ordem sugerida de desenvolvimento

```
1. Corrigir WhatsApp (2.1, 2.4)          ← confiança do produto
2. Definir modelo de planos (3.1)        ← decisão de produto
3. Implementar planos no banco (3.2–3.4) ← base para cobrar
4. Trial com expiração (3.6)             ← onboarding seguro
5. Gateway de pagamento (3.5)            ← monetização real
6. Bloqueio gracioso (3.7)               ← proteção da receita
7. Gemini por plano (4.4)                ← feature premium
```

---

## Evolution Rule
Ao concluir um item, marcar como 🟢 e registrar a data. Ao iniciar desenvolvimento de planos/precificação, criar uma skill `/pricing` dedicada.
