# Billing Asaas — E2E Validation Checklist

**Status:** Código 100% pronto. Falta validação manual no sandbox.  
**Env:** Railway API service deve ter `ASAAS_API_KEY`, `ASAAS_ENV=sandbox`, `ASAAS_WEBHOOK_TOKEN`

---

## Pre-Flight Checks

- [ ] **Railway API env vars:**
  - `ASAAS_API_KEY` = sandbox key (`$aact_hmlg_...`)
  - `ASAAS_ENV` = `sandbox`
  - `ASAAS_WEBHOOK_TOKEN` = secret gerado (qualquer string, anote-a)
  - `INTERNAL_API_SECRET` = valor compartilhado web↔api

- [ ] **Asaas sandbox account:**
  - Login em `https://sandbox.asaas.com`
  - Gere API key (Settings → API)
  - Configure webhook: URL `https://<api>/billing/webhook/asaas`, token = `ASAAS_WEBHOOK_TOKEN`, eventos:
    - `PAYMENT_CREATED`
    - `PAYMENT_CONFIRMED`
    - `PAYMENT_RECEIVED`
    - `PAYMENT_OVERDUE`

- [ ] **Supabase:**
  - Migration `20260615180000_billing_asaas.sql` **aplicada** (tabelas `empresa_cobrancas`, `asaas_webhook_eventos`)
  - RPC `billing_creditar_execucoes`, `billing_creditar_tokens` existem
  - Table `empresa_assinaturas`, `empresa_pacotes_comprados` existem (Fase 2A)

- [ ] **UI staging:**
  - Acesse `/gestao/plano` (item "Plano" no sidebar)
  - Deve mostrar plano atual + botão "Assinar plano"
  - Deve mostrar pacotes adicionais + "Comprar"

---

## Test Scenario 1: Assinar Plano (Billing Fase 2A+3)

### Step 1: Create test empresa
1. Go to `/sistema/empresas` (System admin)
2. Create empresa:
   - **Nome:** "Sandbox Billing Test"
   - **CNPJ:** `11222333000181` (sandbox test CNPJ, válido)
   - **Plano:** Gratuito (padrão)
   - **Status:** Ativo
3. Note the `empresa_id`

### Step 2: Create admin user for empresa
1. Go to `/gestao/acessos/usuarios` (dentro da empresa)
2. Create user:
   - **Name:** "Test Admin"
   - **CPF:** `12345678900` (qualquer valor)
   - **Telefone:** `85987654321`
   - **Perfil:** Admin da empresa
   - **Unidades:** Select all
3. Note `usuario_id`

### Step 3: Login como admin & subscribe plan
1. Logout
2. Login como Test Admin (CPF)
3. Go to `/gestao/plano`
4. Should see:
   - Current plan: **Gratuito** (limite 100 execuções/mês)
   - Available plans: Starter (300 exec/mês), Professional (1000 exec/mês), etc
5. Click **"Assinar Starter"** (ou qualquer plan)
6. Modal should show:
   - Plan name + price
   - Próxima cobrança data
   - Botão "Confirmar"
7. Click **Confirmar**
   - Rota `POST /billing/assinar` executa:
     - Cria cliente no Asaas (se não existe)
     - Cria cobrança (primeira cobrança imediata)
     - Gera `invoiceUrl` (link Asaas)
   - Browser abre `window.open(invoiceUrl)` → Asaas sandbox payment page

### Step 4: Complete payment (Sandbox)
1. Asaas payment page opens (ou erro de popup-blocker)
2. **If popup-blocker error:**
   - ⏳ Check network tab → verify `invoiceUrl` was generated (HTTP 200)
   - Copy URL manually from console/network
   - Open in new tab
3. **In Asaas sandbox payment page:**
   - **Buyer data:** test@example.com, any name
   - **Card:** Use sandbox test card:
     - `4111 1111 1111 1111`
     - **Expiry:** 12/25 (any future)
     - **CVV:** 123
   - Click **Pagar** (Pay)
4. Should see **payment success**
5. Return to app

### Step 5: Verify webhook callback (Critical!)
1. Go to Asaas sandbox → **Webhooks** (Settings → Webhooks)
2. Look for recent logs — should see `POST /billing/webhook/asaas` called with:
   - Event: `PAYMENT_CONFIRMED`
   - `data.id` = payment ID
   - HTTP status: **200 OK**
3. If webhook **failed** (504/500):
   - Check Railway API logs: `railway logs --tail 50`
   - Likely causes:
     - `ASAAS_WEBHOOK_TOKEN` mismatch
     - RPC `billing_creditar_execucoes` fails
     - Database connection error

### Step 6: Verify assinatura ativa
1. Back in app, refresh `/gestao/plano`
2. Should show:
   - **Current plan:** Starter (300 execuções/mês)
   - **Next charge date:** 30 dias from now
   - **Usage:** 0/300 (não tem execuções feitas ainda)
3. Go to `/sistema/empresas` → empresa details
4. Tab "Pagamento" should show:
   - **Assinatura ativa:** Starter
   - **Próxima cobrança:** [data]
   - **Cobranças recentes:** 1 cobrança (valor do Starter)

**✅ Scenario 1 PASSED** if plan is "Starter" + webhook confirmed + usage counter works

---

## Test Scenario 2: Plan Switch (Billing Fase 2A)

### Step 1: Switch to Professional
1. Go to `/gestao/plano`
2. Click **"Trocar para Professional"**
3. Modal shows:
   - "Troca agendada para o fim do período"
   - Current prorated amount (if any)
   - Próxima data efetiva
4. Click **Confirmar**

### Step 2: Verify agendamento
1. Go to Supabase dashboard → `empresa_assinaturas`
2. Check row for empresa:
   - `plano_id` = Starter (atual)
   - `proximo_plano_id` = Professional (agendado)
   - `troca_efetiva_em` = 30 dias from agora

**✅ Scenario 2 PASSED** if plan switch is scheduled (not immediate)

---

## Test Scenario 3: Buy Additional Package

### Step 1: Purchase tokens
1. Go to `/gestao/plano` → "Pacotes adicionais"
2. See **"500 Tokens IA"** (exemplo de pacote)
3. Click **"Comprar 500 Tokens"**
4. Modal shows price + confirm
5. Click **Comprar**
   - Opens Asaas invoice page (similar to assinar)

### Step 2: Complete payment
1. Pay with sandbox card (como Scenario 1)
2. Webhook should arrive: `PAYMENT_CONFIRMED`

### Step 3: Verify crédito adicionado
1. Refresh `/gestao/plano`
2. Should show:
   - **Tokens IA:** `500` (extra, baseado no pacote comprado)

**✅ Scenario 3 PASSED** if tokens appear in usage

---

## Test Scenario 4: Billing Enforcement (Quota)

### Step 1: Execute checklists até atingir limite
1. Go to `/operacao` (operador account)
2. Execute checklists repeatedly
3. Monitor usage in `/gestao/plano` → "Execuções restantes: X"

### Step 2: Hit quota limit
1. When remaining = 0, try to execute
2. Should get **402 Payment Required** error
3. UI should show: "Limite de execuções atingido. Compre um pacote adicional."

**✅ Scenario 4 PASSED** if enforcement blocks at quota

---

## Test Scenario 5: Webhook Idempotency (Critical for safety)

### Step 1: Simulate duplicate webhook
1. Go to Asaas sandbox
2. Find a successful `PAYMENT_CONFIRMED` webhook
3. Click **"Reenviar"** (resend)
4. Observe: webhook is resent with same `event.id`

### Step 2: Verify no double-credit
1. Check database: `empresa_cobrancas` + `asaas_webhook_eventos`
2. Should see:
   - Same `evento_id` only once (table `asaas_webhook_eventos` is idempotent on `evento_id`)
   - Execuções creditadas = original amount (not 2x)
3. Check `/gestao/plano` usage counter — should be unchanged

**✅ Scenario 5 PASSED** if duplicate webhook doesn't double-credit

---

## Test Scenario 6: Error Handling

### Step 1: Payment failure
1. Go to `/gestao/plano`, try to assinar
2. In Asaas payment page, use **test declined card:**
   - `4000 0000 0000 0002`
3. Payment should fail (erro: "Cartão recusado")

### Step 2: Check UI feedback
1. Modal or toast should show error message
2. Plan should NOT change
3. Usage counter should NOT be affected

**✅ Scenario 6 PASSED** if failure is handled gracefully

---

## Cleanup (Sandbox)

- [ ] Delete test empresa (cascade deletes cobrancas)
- [ ] Delete test user
- [ ] In Asaas: review webhook logs (cleanup old tests if needed)

---

## Known Issues to Watch

| Issue | Symptom | Fix |
|-------|---------|-----|
| Popup-blocker | `window.open(invoiceUrl)` silently fails | Document fallback (copy URL from network tab) |
| Webhook timeout | 5xx error on webhook POST | Increase Railway timeout or batch webhook processing |
| CNPJ validation | "CNPJ inválido" in Asaas | Use valid sandbox CNPJ: `11222333000181` |
| Duplicate charges | Assinar charged twice | Check: RPC idempotency, webhook idempotency |

---

## Success Criteria (GO/NO-GO)

✅ **GO** if:
- [ ] Scenario 1: Assinar + webhook confirmation successful
- [ ] Scenario 2: Plan switch agendado corretamente
- [ ] Scenario 3: Pacote comprado + crédito adicional aparece
- [ ] Scenario 4: Quota enforcement bloqueia execução
- [ ] Scenario 5: Webhook duplicado NÃO duplica crédito
- [ ] Scenario 6: Erro tratado gracefully

❌ **NO-GO** if:
- [ ] Webhook fails to confirm
- [ ] Double-charge happens on duplicate webhook
- [ ] Quota enforcement não funciona
- [ ] Popup-blocker impede pagamento

---

## Reference

- **Billing Migrations:** `20260615140000_*`, `20260615160000_*`, `20260615180000_*`
- **Billing Routes:** `apps/api/src/routes/billing.ts`, `apps/web/app/api/...`
- **Asaas Sandbox:** https://sandbox.asaas.com
- **Invoice URL format:** `https://www.asaas.com/invoice/<invoiceId>`
