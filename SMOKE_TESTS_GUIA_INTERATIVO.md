# Smoke Tests — Guia Interativo (Testes #8-9)

**Data:** 2026-06-24  
**Status:** Workflows habilitado (commit 9770d49)  
**Objetivo:** Validar Config e Workflows para completar 10/10 smoke tests ✅

---

## ⚡ Quick Start

### Pré-requisitos
1. App em staging (local ou Railway)
2. Usuário admin_sistema logado
3. Empresa ativa selecionada

### URLs
- **Local:** `http://localhost:3000`
- **Staging:** `https://web-production-36880.up.railway.app`

---

# 🧪 TESTE #8: Configurações

**Tempo estimado:** 15 min  
**Acesso:** `/gestao/configuracoes`

## Teste 8.1: Catálogos

**Click Path:** Gestão (menu) → Configurações → Catálogos

```
[ ] Menu "Configurações" existe?
[ ] Submenu "Catálogos" abre?
[ ] Lista de catálogos carrega?

[ ] Botão "+ Novo catálogo" visível?
[ ] Clicar: Modal abre
[ ] Preencher:
    • Nome: "Teste Catálogo"
    • Descrição: "Catálogo de teste"
[ ] Clicar "Salvar"
[ ] Toast "Catálogo criado com sucesso"?
[ ] Novo catálogo aparece na lista?

[ ] Clicar no catálogo (editar): Modal abre
[ ] Mudar nome para "Teste Catálogo V2"
[ ] Clicar "Salvar"
[ ] Lista atualiza com novo nome?

[ ] Botão deletar (lixeira) no catálogo?
[ ] Clicar: Confirmação modal?
[ ] Confirmar delete
[ ] Catálogo desaparece da lista?
```

**Expected:** ✅ PASS (CRUD completo)  
**If FAIL:** Anotar erro: ____________

---

## Teste 8.2: Documentos

**Click Path:** Gestão → Configurações → Documentos

```
[ ] Submenu "Documentos" abre?
[ ] Lista de documentos carrega?

[ ] Botão "+ Novo documento" ou "Upload"?
[ ] Clicar: File picker abre?
[ ] Fazer upload de um arquivo (PDF/imagem pequena)
[ ] Toast "Documento enviado"?
[ ] Documento aparece na lista?

[ ] Clicar em documento: Detalhes modal?
[ ] Editar nome/descrição?
[ ] Salvar?
[ ] Lista atualiza?

[ ] Deletar documento (lixeira)?
[ ] Confirmação?
[ ] Desaparece?
```

**Expected:** ✅ PASS (Upload + CRUD)  
**If FAIL:** Anotar erro: ____________

---

## Teste 8.3: Motivos de Não-execução

**Click Path:** Gestão → Configurações → Não-execução

```
[ ] Submenu "Não-execução" abre?
[ ] Lista de motivos carrega?
[ ] Motivos agrupados por tipo? (ex: "Equipamento quebrado", "Indisponibilidade")

[ ] Botão "+ Novo motivo"?
[ ] Modal: Selecionar tipo (dropdown)?
[ ] Preencher nome do motivo: "Teste motivo"
[ ] Salvar?
[ ] Motivo aparece na lista?

[ ] Botão deletar (lixeira)?
[ ] Confirmação?
[ ] Guard: Não permite deletar se ≥1 por tipo?
[ ] Feedback claro se tentar deletar último motivo?
```

**Expected:** ✅ PASS (CRUD + validação)  
**If FAIL:** Anotar erro: ____________

---

## Teste 8.4: Formatação (Data/Hora/Número)

**Click Path:** Gestão → Configurações → Formatação

```
[ ] Submenu "Formatação" abre?
[ ] Seção "Data" visível?
[ ] Opções de locale (dd/mm/yyyy, mm/dd/yyyy)?
[ ] Clicar mudar formato: Troca imediatamente (visual preview)?

[ ] Seção "Número" visível?
[ ] Opção separador decimal (. vs ,)?
[ ] Opção separador milhar (. vs ,)?
[ ] Clicar: Preview mostra "1.000,00" vs "1,000.00"?

[ ] Seção "Hora" visível?
[ ] Opção 24h vs 12h (AM/PM)?
[ ] Preview mostra mudança?

[ ] Mudar várias opções, salvar?
[ ] Toast "Formatação salva"?
[ ] Ir para outra tela e voltar: Mudanças persistem?
```

**Expected:** ✅ PASS (Localização funcionando)  
**If FAIL:** Anotar erro: ____________

---

## Teste 8.5: Causa Raiz

**Click Path:** Gestão → Configurações → Causa Raiz

```
[ ] Submenu "Causa raiz" abre?
[ ] Lista de causas carrega (ou vazia)?

[ ] Botão "+ Nova causa raiz"?
[ ] Modal:
    [ ] Selecionar checklist (dropdown)?
    [ ] Selecionar subgrupo (dropdown)?
    [ ] Selecionar atividade (dropdown)?
    [ ] Preencher nome: "Teste causa"
    [ ] Salvar?
[ ] Causa aparece na lista?

[ ] Clicar em causa: Editar?
[ ] Mudar nome → Salvar → Atualiza lista?

[ ] Deletar causa (lixeira)?
[ ] Confirmação?
[ ] Desaparece?
```

**Expected:** ✅ PASS (Causa raiz + cascata checklist→atividade)  
**If FAIL:** Anotar erro: ____________

---

## Teste 8.6: Notificações

**Click Path:** Gestão → Configurações → Notificações

```
[ ] Submenu "Notificações" abre?
[ ] Status de conectividade:
    [ ] Email (Resend) → status "Conectado"?
    [ ] WhatsApp (Evolution) → status "Conectado"?
    [ ] Ou "Desconectado"?

[ ] Botão "Testar WhatsApp" (se conectado)?
[ ] Clicar: "Enviando..."?
[ ] Toast sucesso/erro?

[ ] Botão "Testar Email"?
[ ] Clicar: Confirmar email de teste?
[ ] Toast sucesso/erro?

[ ] Configurações por evento (Checklist executado, Plano assinado)?
[ ] Toggle WhatsApp/Email por evento?
[ ] Salvar?
```

**Expected:** ✅ PASS (Conexões vivas, testes funcionam)  
**If FAIL:** Anotar erro: ____________

---

## ✅ Resumo Teste #8: Configurações

**Total de checks:** ~35  
**Resultado final:**

- [ ] **PASS** — Todos funcionando, sem erros
- [ ] **FAIL** — Erros encontrados:

  ```
  1. ___________________________________
  2. ___________________________________
  3. ___________________________________
  ```

---

---

# 🔄 TESTE #9: Workflows

**Tempo estimado:** 20 min  
**Acesso:** `/gestao/workflows`  
**Status:** 🆕 Recém-habilitado (commit 9770d49)

## Pre-flight: Menu visível?

**Click Path:** Gestão → Ver sidebar

```
[ ] Item "Workflows" aparece no menu Gestão?
[ ] Clicar em "Workflows": Tela `/gestao/workflows` abre?
[ ] Página carrega sem erro?
[ ] Mensagem vazia ou lista de workflows?
```

**If NOT:** Workflows ainda OFF. Verificar commit 9770d49 foi deployado.

---

## Teste 9.1: Criar Workflow

**Click Path:** Gestão → Workflows → "+ Novo workflow"

```
[ ] Botão "+ Novo" visível?
[ ] Clicar: Modal/tela cria novo rascunho?

[ ] Seleção de checklist:
    [ ] Dropdown carrega checklists da unidade?
    [ ] Selecionar um checklist (ex: "Checklist de teste")
[ ] Nome do workflow: "Teste Workflow"
[ ] Descrição: "Workflow de teste"

[ ] Clicar "Salvar rascunho"
[ ] Toast "Rascunho criado"?
[ ] Workflow aparece na lista com status "Rascunho"?
```

**Expected:** ✅ PASS (Rascunho criado)  
**If FAIL:** Anotar erro: ____________

---

## Teste 9.2: Adicionar Itens ao Workflow

**Click Path:** Editar workflow (rascunho) → Editor

```
[ ] Tela editor abre?
[ ] Checklist selecionado aparece no topo?

[ ] Botão "+ Adicionar item" (ou "Adicionar etapa")?
[ ] Clicar: Modal para escolher tipo de item:
    [ ] Checklist (sequencial)
    [ ] Checklist (condicional)
    [ ] Tarefa
    [ ] Outro?

[ ] Selecionar: "Checklist (sequencial)"
[ ] Escolher checklist: "Checklist pré-auditoria"
[ ] Clicar "Adicionar"

[ ] Item aparece no diagrama/lista?
[ ] Botão "+ Adicionar item" novamente?
[ ] Selecionar: "Checklist (condicional)"
[ ] Escolher checklist: "Checklist pós-auditoria"
[ ] Condition: "Se resultado = SIM" (dropdown)
[ ] Adicionar?

[ ] Agora há 2 items no workflow:
    - Item 1 (pré) → Item 2 (pós) se SIM
[ ] Diagrama mostra conexão?

[ ] Salvar workflow: Toast "Salvo"?
```

**Expected:** ✅ PASS (Items adicionados + sequência visível)  
**If FAIL:** Anotar erro: ____________

---

## Teste 9.3: Publicar Workflow

**Click Path:** Botão "Publicar" no editor

```
[ ] Botão "Publicar" visível (status = "Rascunho")?
[ ] Clicar: Modal confirmação?
    [ ] "Publicar workflow 'Teste Workflow'?"
    [ ] Botão "Confirmar"?

[ ] Clicar "Confirmar"
[ ] Toast "Workflow publicado"?
[ ] Status muda de "Rascunho" → "Publicado"?
[ ] Voltar à lista: Status mostra "Publicado"?

[ ] Tentar editar novamente:
    [ ] Botão "Editar" desabilitado?
    [ ] Aviso: "Liberar edição para modificar"?
```

**Expected:** ✅ PASS (Publicação bem-sucedida, edição bloqueada)  
**If FAIL:** Anotar erro: ____________

---

## Teste 9.4: Executar Workflow na Operação

**Click Path:** Operação → Abinha "Workflows"

```
[ ] Ir para `/operacao`
[ ] Abinha "Workflows" visível? (ao lado de "Não finalizados", "Histórico")

[ ] Clicar na abinha
[ ] Lista de workflows publicados aparece?
[ ] Workflow "Teste Workflow" na lista?

[ ] Clicar "Iniciar workflow"
[ ] Carrega 1º checklist da sequência (pré-auditoria)?
[ ] Tela de execução normal aparece?

[ ] Preencher campos da atividade (como normal)
[ ] Finalizar checklist:
    [ ] Marcar como "Aprovado" (resultado = SIM)
    [ ] Clicar "Finalizar"

[ ] Toast sucesso?
[ ] Página atualiza?
[ ] Próximo item da sequência carrega:
    [ ] Checklist pós-auditoria (porque resultado = SIM)
    [ ] Não salta para item alternativo (porque não há "se NÃO")

[ ] Preencher pós-auditoria → Finalizar?
[ ] Workflow marca como "Concluído"?
[ ] Abinha mostra "Workflows concluídos" (ou move para histórico)?
```

**Expected:** ✅ PASS (Sequência → condicional → conclusão)  
**If FAIL:** Anotar erro: ____________

---

## Teste 9.5: Testar Condicional "Não"

**Click Path:** Criar novo workflow com condicional inverso

```
[ ] Ir para Gestão → Workflows
[ ] Criar novo workflow (similar a Teste 9.1)

[ ] Adicionar 2 items:
    - Item 1: "Checklist diagnóstico"
    - Item 2 (condicional): "Checklist ação corretiva" SE RESULTADO = NÃO

[ ] Publicar

[ ] Executar na Operação:
    [ ] Fazer diagnóstico
    [ ] Resultado = NÃO (reprovar)
    [ ] Finalizar

[ ] Próximo item carrega:
    [ ] "Ação corretiva" (porque resultado = NÃO)
    [ ] Não salta (porque condição foi atendida)

[ ] Finalizar ação corretiva?
[ ] Workflow concluído?
```

**Expected:** ✅ PASS (Branching SIM/NÃO funciona)  
**If FAIL:** Anotar erro: ____________

---

## Teste 9.6: Agendar Workflow (Extra)

**Click Path:** Operação → Abinha "Agendamentos"

```
[ ] Ir para Operação → Abinha "Agendamentos" (ou "Pendências")
[ ] Filtro ou botão para agendar workflow?

[ ] Se não tiver: Editar workflow → botão "Agendar"?
    [ ] Clicar "Agendar"
    [ ] Modal:
        [ ] Data/hora início
        [ ] Recorrência (diária/semanal/mensal)
        [ ] Salvar?

[ ] Agendamento aparece em "Agendamentos da unidade"?
[ ] Operador vê workflow como "Pendente de execução"?

[ ] Executar agendamento normal?
```

**Expected:** ⚠️ TBD (Pode estar OK ou precisar refinamentos)  
**If FAIL:** Anotar erro: ____________

---

## ✅ Resumo Teste #9: Workflows

**Total de checks:** ~40  
**Resultado final:**

- [ ] **PASS** — Tudo funcionando (criar, publicar, sequência, condicional)
- [ ] **WARN** — Alguns refinamentos necessários
- [ ] **FAIL** — Erros críticos encontrados:

  ```
  1. ___________________________________
  2. ___________________________________
  3. ___________________________________
  ```

---

---

# 📊 RESUMO FINAL: 10/10 SMOKE TESTS

| # | Teste | Data | Status | Observações |
|---|-------|------|--------|-------------|
| 1 | Execução de checklist | 2026-06-24 | ✅ PASS | — |
| 2 | Reset de senha | 2026-06-24 | ✅ PASS | — |
| 3 | Perfis (editar) | 2026-06-24 | ✅ PASS | — |
| 4 | Usuários (logar-como) | 2026-06-24 | ✅ PASS | — |
| 5 | Empresa (inativar) | 2026-06-24 | ✅ PASS | — |
| 6 | Turnos (modo login) | 2026-06-24 | ✅ PASS | — |
| 7 | Causa raiz | 2026-06-24 | ✅ PASS | — |
| 8 | **Configurações** | **TODAY** | **⏳ TODO** | **Seu teste ↑** |
| 9 | **Workflows** | **TODAY** | **⏳ TODO** | **Seu teste ↑** |
| 10 | Plano & Assinatura | 2026-06-24 | ✅ PASS | — |

---

## 🎯 Próximo Passo

1. **Execute Teste #8** (Configurações) — ~15 min
2. **Execute Teste #9** (Workflows) — ~20 min
3. **Reporte aqui:**
   - Resultado (PASS/FAIL/WARN)
   - Erros encontrados (se houver)

**Se 10/10 PASS → Sistema PRONTO PARA PRODUÇÃO com 100+ empresas ✅**

---

## 📞 Dúvidas Durante Teste?

Se algo não aparecer ou der erro:
1. Anote exatamente o que viu (screenshot é ótimo)
2. Anotar qual era o passo
3. Railway logs: `railway logs --tail 50` (se erro 5xx)
4. Browser console: F12 → Console (se erro JS)

---

**Boa sorte! 🚀 Estamos perto do finish line! 💪**
