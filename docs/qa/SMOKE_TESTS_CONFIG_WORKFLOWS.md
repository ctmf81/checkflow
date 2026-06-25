# Smoke Tests — Config & Workflows (Teste #8-9)

**Status:** 9/10 testes PASSED (2026-06-24). Faltam Config e Workflows.

---

## Teste #8: Configurações (em construção → ✅)

**Tela:** `/gestao/configuracoes` (Gestão → Configurações)

### Checklist
- [ ] **Menu "Configurações" acessível** — sidebar Gestão mostra item "Configurações"
- [ ] **Submenu carrega:**
  - [ ] Catálogos — lista com criar/editar/deletar
  - [ ] Documentos — lista com upload/editar/deletar
  - [ ] Não-execução — lista de motivos com criar/editar/deletar
  - [ ] Formatação — opções de data/hora/número com preview
  - [ ] Causa raiz — lista vinculada a atividades de checklist
  - [ ] Notificações — configuração de canais (email/WhatsApp)
  - [ ] Relatórios — (opcional, pode estar vazio)
  - [ ] Dashboards — (opcional, pode estar vazio)

### Testes Funcionais

1. **Catálogos:**
   - [ ] Criar catálogo novo (nome, descrição, campos)
   - [ ] Validar campo obrigatório (nome)
   - [ ] Editar catálogo existente
   - [ ] Deletar catálogo com confirmação
   - [ ] Usar catálogo em um checklist

2. **Documentos:**
   - [ ] Listar documentos
   - [ ] Upload de documento (PDF/imagem)
   - [ ] Validar tamanho máximo
   - [ ] Editar metadados (nome, descrição)
   - [ ] Deletar documento com confirmação

3. **Não-execução (Motivos):**
   - [ ] Criar motivo novo
   - [ ] Motivo aparece no checklist montador
   - [ ] Remover motivo (se não usado)
   - [ ] Garantia: cada tipo tem ≥1 motivo (trigger)

4. **Formatação:**
   - [ ] Data: mudar locale (dd/mm/yyyy vs outros)
   - [ ] Número: mudar separador (1.000,50 vs 1,000.50)
   - [ ] Hora: 24h vs 12h (AM/PM)
   - [ ] Preview mostra mudança em tempo real

5. **Causa Raiz:**
   - [ ] Listar causas por atividade
   - [ ] Criar causa raiz (selecionar checklist→atividade)
   - [ ] Editar causa
   - [ ] Deletar causa
   - [ ] Verificar recorrência de causas (count)

6. **Notificações:**
   - [ ] WhatsApp habilitado (ícone de conexão)
   - [ ] Email configurado (SMTP/Resend)
   - [ ] Teste enviar (mensagem chega)
   - [ ] Canais customizáveis por evento

### Resultado
- **PASS** se todos os items funcionam sem erro
- **FAIL** se algum item trava, retorna erro 5xx, ou exibe dados incorretos

**Expected result: ✅ PASS**

---

## Teste #9: Workflows (desabilitado → ⚠️ habilitar + testar)

**Tela:** `/gestao/workflows` (Gestão → Workflows — atualmente ⛔ OFF)

### Pre-requisites
1. Feature flag `WORKFLOWS_HABILITADO` = `true` em `apps/web/lib/features.ts`
2. Deploy para staging
3. Se `false`, workflows não aparecem no menu

### Checklist de Habilitação
- [ ] Feature flag setado para `true`
- [ ] Deploy da web para staging
- [ ] Menu "Workflows" aparece em Gestão
- [ ] Tela `/gestao/workflows` carrega sem erro

### Testes Funcionais

1. **Listagem:**
   - [ ] Listar workflows existentes (vazio se nenhum)
   - [ ] Filtro por subgrupo funciona
   - [ ] Status do workflow (rascunho/publicado/pausado)
   - [ ] Ação "Visualizar", "Editar", "Publicar", "Deletar"

2. **Criar Workflow:**
   - [ ] Modal/tela cria novo rascunho
   - [ ] Seleção de checklist obrigatória
   - [ ] Seleção de sequência (itens + condições)
   - [ ] Adicionar item ao workflow (checklist/tarefa/etc)
   - [ ] Editar condição de item:
     - [ ] "Sempre" (sequencial)
     - [ ] "Se resultado = SIM" (dependência)
     - [ ] "Se resultado = NÃO" (condicional)
   - [ ] Remover item do workflow
   - [ ] Salvar rascunho

3. **Publicar Workflow:**
   - [ ] Guard: checklist deve ter ≥1 item
   - [ ] Botão "Publicar" disponível
   - [ ] Confirmação: "Publicar workflow?"
   - [ ] Status muda para "publicado"
   - [ ] Workflow ativo na Operação

4. **Executar Workflow na Operação:**
   - [ ] Operador vê abinha "Workflows" em `/operacao`
   - [ ] Lista workflows publicados disponíveis
   - [ ] Iniciar workflow:
     - [ ] Carrega 1º checklist da sequência
     - [ ] Preenche campos
     - [ ] Finaliza
     - [ ] Resultado avaliado (SIM/NÃO)
   - [ ] Fluxo condicional: se resultado = SIM → próximo item
   - [ ] Fluxo condicional: se resultado = NÃO → item alternativo (ou fim)
   - [ ] Workflow finalizado marca como concluído

5. **Agendar Workflow:**
   - [ ] Botão "Agendar" em workflow editor
   - [ ] Seleciona data/hora de início
   - [ ] Seleciona recorrência (diária/semanal/mensal)
   - [ ] Agendamento aparece em `/operacao` como pendência

6. **Editar Workflow Publicado:**
   - [ ] Botão "Editar" desbloqueado se rascunho
   - [ ] Botão "Editar" bloqueado se publicado (aviso: "Liberar edição")
   - [ ] "Liberar edição" com confirmação
   - [ ] Edições não afetam execuções em andamento

7. **Deletar Workflow:**
   - [ ] Guard: não deletar se execuções em andamento
   - [ ] Confirmação com nome do workflow
   - [ ] Deletar desativa de `/operacao`

### Resultado
- **PASS** se todos os items funcionam (sequência, condições, agendamento)
- **FAIL** se algum condicional não executa, agendamento não funciona, ou tela trava
- **WARN** se interface confusa ou passos não intuitivos

**Expected result: ⚠️ TBD — dependente de habilitação + testes do usuário**

---

## Resumo: Smoke Tests 100%

| # | Teste | Status | Data | Bloqueadores |
|---|-------|--------|------|--------------|
| 1 | Execução de checklist | ✅ PASS | 2026-06-24 | — |
| 2 | Reset de senha | ✅ PASS | 2026-06-24 | — |
| 3 | Perfis (editar) | ✅ PASS | 2026-06-24 | — |
| 4 | Usuários (logar-como) | ✅ PASS | 2026-06-24 | — |
| 5 | Empresa (inativar unidade) | ✅ PASS | 2026-06-24 | — |
| 6 | Turnos (modo login) | ✅ PASS | 2026-06-24 | — |
| 7 | Causa raiz | ✅ PASS | 2026-06-24 | — |
| 8 | Configurações | ⏳ TODO | — | Feature completa? |
| 9 | Workflows | ❌ OFF | — | Feature flag = false |
| 10 | Plano & Assinatura | ✅ PASS | 2026-06-24 | — |

---

## Next Steps

1. **Config (Teste #8):**
   - Você valida se funciona em staging
   - Espera-se ✅ PASS (código completo)

2. **Workflows (Teste #9):**
   - Habilitar flag `WORKFLOWS_HABILITADO = true`
   - Deploy para staging
   - Testar sequência + condições + agendamento
   - Espera-se ⚠️ TBD (última tela da revisão, pode ter refinamentos)

**Goal:** 10/10 PASS → Ready para validação final em produção

---

## Command: Enable Workflows

```bash
# Edit file
vi apps/web/lib/features.ts

# Find:
export const WORKFLOWS_HABILITADO = false

# Change to:
export const WORKFLOWS_HABILITADO = true

# Deploy
git add apps/web/lib/features.ts
git commit -m "test(workflows): enable for smoke testing"
git push origin main
```

Deploy automático no Railway. Aguarde ~2-3 min.
