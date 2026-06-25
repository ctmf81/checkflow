# CheckFlow Customer Onboarding Guide

**Status:** 🚀 Production Live (2026-06-25)  
**For:** First customers + sales team  
**Time:** ~30 min per customer

---

## Phase 1: Account Setup (5 min)

### 1.1 Create Admin Account
```
1. User receives email with magic link
2. Click link → First Access page (/primeiro-acesso)
3. Set password
4. Redirected to /gestao (authenticated)
```

### 1.2 Create Company
```
1. Go to /sistema/empresas (Admin only)
2. Click "+ Nova empresa"
3. Fill:
   • Nome: Customer company name
   • CNPJ: Valid Brazilian CNPJ
   • Plano: "Gratuito" (default 30-day trial)
4. Save
5. Select company in header dropdown
```

### 1.3 Create First Unit (Unidade)
```
1. Go to /gestao/empresa
2. Click "+ Nova unidade"
3. Name: "Matriz" or unit name
4. Save
5. Auto-selected in header
```

---

## Phase 2: Team Setup (10 min)

### 2.1 Invite Users
```
1. Go to /gestao/acessos/usuarios
2. Click "+ Novo usuário"
3. Fill:
   • Name
   • CPF
   • Phone (WhatsApp for reset codes)
   • Perfil: Select role
   • Unidades: Check units user accesses
4. Send password reset link (auto-created)
   User receives code via WhatsApp
```

### 2.2 Create Groups & Assign Permissions
```
1. Go to /gestao/grupos
2. Click "+ Novo grupo"
3. Add users → assign funções (Operação/N1/N2)
4. Save
5. Permissions auto-applied per role
```

### 2.3 Assign Groups to Checklists
```
1. Go to /gestao/checklists
2. Edit checklist
3. Set "Subgrupo responsável"
4. Save
5. Only that group can execute
```

---

## Phase 3: Configure Operations (15 min)

### 3.1 Create First Checklist
```
Option A: Use template gallery
  1. Go to /gestao/checklists/modelos
  2. Browse by segment
  3. Click "Usar"
  4. Customize
  5. Publish

Option B: Create from scratch
  1. Go to /gestao/checklists
  2. Click "+ Novo checklist"
  3. Add sections + activities
  4. Set "Modo de execução" (one-time or pausable)
  5. Publish
```

### 3.2 Test Execution
```
1. Operator logs in
2. Go to /operacao
3. Click checklist
4. Fill activities (text, photo, video, checkbox, etc.)
5. Finalize
6. Check execution in history
```

### 3.3 Review & Approve
```
1. N1/N2 goes to /gestao/planos-acao
2. Opens execution's action plan
3. Marks "Aprovado" or "Reprovado"
4. Operator receives notification (WhatsApp/email)
```

---

## Phase 4: Enable Features (5 min)

### 4.1 Configure Notifications
```
1. Go to /gestao/configuracoes/notificacoes
2. Test WhatsApp (must be connected)
3. Test Email
4. Enable by event
5. Save
```

### 4.2 Set Up Billing (Optional - Day 1 or later)
```
1. Go to /gestao/plano
2. View current plan (Gratuito: 100 executions/month)
3. When ready to upgrade:
   • Click plan name
   • Choose: Starter/Professional/Enterprise
   • Payment via Asaas (PIX/Boleto/Credit card)
   • Confirmation via email
   • Automatic upgrade
```

### 4.3 Enable Workflows (Optional - Advanced)
```
1. Go to /gestao/workflows
2. Create workflow:
   • Add checklist sequence
   • Set conditions (IF result = SIM, then next step)
3. Publish
4. Operator sees in /operacao → Workflows tab
```

---

## Post-Launch Validation

### ✅ Checklist for Success

After onboarding, confirm:

- [ ] Admin can log in and access dashboard
- [ ] Company created and selected
- [ ] At least 2 users created (operator + reviewer)
- [ ] Group created with at least 1 checklist
- [ ] WhatsApp connected (test notification sent)
- [ ] First execution completed end-to-end
- [ ] N1/N2 approval flow works
- [ ] Operator received notification

### 🔗 Key URLs for Customer

| Feature | URL |
|---------|-----|
| Dashboard | https://web-production-36880.up.railway.app/gestao |
| Execute Checklist | /operacao |
| Manage Team | /gestao/acessos/usuarios |
| Create Checklist | /gestao/checklists |
| Approve Plans | /gestao/planos-acao |
| Upgrade Plan | /gestao/plano |
| Central de Ajuda | /gestao/ajuda |

### 📞 Support Contacts

- **Email:** support@checkflow.digital
- **WhatsApp:** Via notification system
- **Docs:** https://checkflow.digital/docs

---

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "WhatsApp não conectado" | Go to /sistema/whatsapp, click "Conectar", scan QR code |
| "Usuário não recebe código" | Check phone number format (85 + 9 + 8 digits), try resend |
| "Checklist não aparece para operador" | Check: group assigned? subgrupo_responsavel set? user in that group? |
| "Execução trava em 'Carregando'" | Refresh page (F5), check network tab for errors |
| "Notificação não chega" | Check notification settings enabled, WhatsApp connected |

---

## Success Metrics (30 days)

- [ ] ≥5 active operators
- [ ] ≥50 executions completed
- [ ] ≥10 approvals in action plans
- [ ] ≥1 workflow running
- [ ] NPS > 7 (in-app survey)

---

## Next: Premium Features Upsell

After 7 days of active use, mention:

1. **Workflows** — automate multi-step processes
2. **Cause Root Analysis** — track problem patterns
3. **Integrations** — connect external data
4. **Team Expansion** — add more users/units
5. **Premium Plans** — unlock higher limits

---

**Onboarding done!** 🎉 Customer is live and operational.

Questions? See `/gestao/ajuda` (in-app help).
