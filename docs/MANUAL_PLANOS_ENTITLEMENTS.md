# 📖 Manual — Planos, Serviços e Ciclo de Assinatura (CheckFlow)

> Manual gerado a partir do `/biz` (fonte única). Explica como funcionam os planos, o que cada empresa recebe, e o que acontece ao contratar, subir ou descer de plano.
> Público: administração do sistema, suporte e comercial.

---

## 1. Conceitos

- **Serviço** = uma unidade que um plano pode incluir. Dois tipos:
  - **Módulo** — libera uma funcionalidade (ex.: Tickets, Documentos, Dashboards).
  - **Característica** — uma capacidade sinalizada por flag (ex.: Consulta Inteligente / IA).
- **Plano** = um pacote de serviços + limites de uso + tipo de cobrança.
- **Assinatura** = o vínculo de uma empresa a um plano. A empresa **herda os serviços do plano ativo**.

O admin de **sistema** cria e configura planos e serviços; a empresa apenas **usa** o que o plano dela libera.

---

## 2. Tipos de plano

| Tipo | Cobrança | Uso |
|------|----------|-----|
| **Gratuito** | Sem cobrança | Plano grátis permanente |
| **Teste (trial)** | Sem cobrança por N dias | Uso livre por um período; depois entra no ciclo de bloqueio (ver §6) |
| **Pago** | Valor + ciclo (mensal/anual) | Plano comercial |
| **Cortesia** | Sem cobrança | Concedido a ONGs/parceiros — como um "pago que não paga": **sempre ativo**, sem carência nem bloqueio |

- **Plano padrão**: um plano pode ser marcado como **padrão** (só um). **Toda empresa nova nasce com ele**. Depois, o admin de sistema pode trocar por outro plano conforme o porte/interesse da empresa.
- Cada plano define **quais serviços inclui** e os **limites de uso** (execuções/mês, armazenamento, tokens de IA).

---

## 3. Serviços padrão (sempre disponíveis)

Alguns serviços são **base** e ficam **sempre liberados**, em qualquer plano ou downgrade — nunca são bloqueados:

- **Checklists**
- **Estrutura** (grupos / áreas / subgrupos)
- **Catálogos**
- **Planos de Ação** (decisão atual — pode ser desmarcado no futuro se virar gateável)

Os demais serviços (Tickets, Documentos, Dashboards, Tarefas, Agendamentos, Turnos, Padrões, IA) **dependem do plano**.

---

## 4. O que a empresa vê (regra opt-in)

O sistema só restringe quando faz sentido:

- Empresa **sem plano**, ou com **plano sem nenhum serviço configurado** → **sem restrição** (vê tudo). Isso protege empresas antigas: nada muda até o plano ter serviços marcados.
- Quando o plano tem serviços marcados, o gating "liga":
  - **Menu**: módulos fora do plano **somem** da barra lateral.
  - **Perfis**: no construtor de perfil, só aparecem os recursos liberados (+ administração básica).
  - **Escrita**: criar/editar nos módulos fora do plano é **bloqueado** (no servidor, à prova de driblar pela URL).
- **Admin de sistema** (plataforma) ignora todo o gating. **Admin da empresa** é limitado ao plano dela.

---

## 5. Contratar / Upgrade / Downgrade — por módulo

**Contratar ou fazer upgrade** (o plano passa a incluir o módulo): liberado **na hora** (próxima carga da sessão) — aparece no menu, no perfil, e a escrita é destravada. Sem migração de dados.

**Downgrade** (o plano deixa de incluir o módulo): a regra é **preservar o dado e barrar só a autoria nova** — nunca apaga nada, nunca trava operação em andamento:

| Módulo | O que é bloqueado no downgrade | O que continua |
|--------|-------------------------------|----------------|
| **Leitura (todos)** | — | Dados já criados continuam visíveis |
| **Documentos** | Criar/editar documento, etapa, imagem | Excluir (limpeza) e ler |
| **Tarefas** | Criar/editar lista e seus itens | Operador **executar/responder** lista publicada; excluir lista |
| **Tickets** | **Abrir ticket novo** + config (categorias/SLA) | **Tratar/concluir/comentar/anexar** em tickets já abertos |
| **Agendamentos** | Criar/editar agendamento | Ler *(⚠️ agendamentos já existentes seguem disparando — pausar seria regra do cron, não coberta hoje)* |
| **Turnos** | Criar/editar turno | Turnos configurados seguem valendo |
| **Padrões** | Criar/editar variáveis/padrões | Ler; templates globais sempre liberados |
| **Planos de Ação** | Só a autoria do **catálogo de causa raiz** | O plano em si (nasce no finalizar da execução, moderação N1/N2) **nunca é bloqueado** |

Regra de ouro: **admin de sistema ignora tudo; admin da empresa segue o plano.**

---

## 6. Ciclo de vida da assinatura

A empresa está sempre em uma de **duas fases** (não há mais corte total de acesso — a
fase "Bloqueada" foi removida em 2026-07-13; pós-trial passou a ser somente-leitura):

| Fase | Quando | O que acontece |
|------|--------|----------------|
| **Ativa** | Trial dentro do prazo; OU plano **pago/cortesia em dia**; OU sem plano | Tudo normal |
| **Carência (somente-leitura)** | Trial vencido (**permanente**, sem prazo p/ corte); OU assinatura **cancelada**; OU **plano pago inadimplente há mais de 7 dias** do vencimento | **Criação bloqueada** (novos checklists, tarefas, tickets, agendamentos, workflows). Banner: *"O sistema se encontra com funcionalidades reduzidas..."*. A **operação continua** (executar checklist, tratar ticket aberto); o **admin regulariza** contratando/pagando. |

**Inadimplência (planos pagos)** — decisão 2026-07-22:
- A fatura recorrente vence e não é paga → webhook `PAYMENT_OVERDUE` marca a assinatura
  **inadimplente** e grava a data de vencimento; o admin é avisado (WhatsApp+e-mail) com
  a **data-limite do corte**.
- Passados **7 dias** do vencimento sem pagar → a empresa cai para **Carência**
  (somente-leitura). É automático (date-driven), reusando o mecanismo do pós-trial.
- Assim que o pagamento confirma → volta a **Ativa** na hora.
- Na tela `/gestao/plano`, um banner vermelho mostra a fatura vencida e a data-limite.

- Planos **pago/cortesia em dia** = **Ativa**. O bloqueio de criação é no servidor (RLS,
  não dá pra driblar); a operação viva nunca é estrangulada.
- Detalhes técnicos e de billing (split de parceiro, etc.): ver `/biz`.

---

## 7. Cotas × Entitlements

São coisas separadas:
- **Entitlements** = quais **módulos** o plano libera (este manual).
- **Cotas** = limites de **uso** (execuções/mês, armazenamento, tokens de IA), controladas pelo billing.

Um módulo liberado ainda respeita a cota do plano.

---

## 8. Onde configurar (admin de sistema)

| Tela | Para quê |
|------|----------|
| `/sistema/servicos` | Catálogo de serviços (módulos/características); marcar quais são "padrão" |
| `/sistema/planos` | Criar/editar planos: tipo, valor, dias de teste, limites, **quais serviços inclui**, marcar o **plano padrão** |
| `/sistema/empresas/[id]` | Atribuir/trocar o plano de uma empresa |
| `/gestao/plano` (na empresa) | Comparação serviços × planos (para o cliente comparar antes de assinar) |

---

*Regras técnicas detalhadas (migrations, policies RLS, funções) ficam em `/biz`, `/db` e `/security`. Este manual é a leitura de produto/negócio.*
