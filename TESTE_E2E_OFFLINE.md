# Teste E2E Offline → Sincronização

**Objetivo:** Validar o fluxo completo de execução offline + sincronização

**Duração:** ~15 minutos  
**Dependências:** App rodando, backend online

---

## ✅ Checklist de Setup

- [ ] `npm install` em `apps/mobile`
- [ ] `npm start` ou `expo start`
- [ ] Emulador ou device conectado
- [ ] API backend (`apps/api`) rodando em `http://localhost:3001`
- [ ] Supabase local ou sandbox testado

---

## 📋 Passos do Teste

### Fase 1: Preparação Offline (Online)

**Tempo esperado:** 3-5 min

```
1. Abre app (Tab "Preparar Offline")
2. Clica "Preparar Checklist"
3. Seleciona 1 checklist simples (ex: "Segurança Básica")
4. Aguarda download
   ✓ Progressbar deve ir 0 → 100%
   ✓ Deve mostrar tamanho em MB (ex: "0.50 MB")
5. Checklist deve aparecer em "Preparados"
6. ✅ Status PASSA se arquivo salvou em SQLite
```

**Validações:**
- [ ] Progressbar atualiza em tempo real
- [ ] Tamanho em MB é razoável (<5 MB pra checklist simples)
- [ ] Sem erros de rede/timeout

**Debug se falhar:**
```bash
# Verificar storage
SELECT COUNT(*) FROM checklists; -- deve ter 1 registro

# Verificar catálogos (se houver)
SELECT COUNT(*) FROM catalogo_valores;
```

---

### Fase 2: Execução Offline (Offline)

**Tempo esperado:** 5-7 min

```
1. Ativa Airplane Mode (Settings → Connectivity)
2. Volta pro app
3. Tab "Executar" → clica no checklist preparado
4. Preenche TODAS as atividades obrigatórias
   - Sim/Não: clica em "Sim" ou "Não"
   - Número: digita valor dentro de min/max
   - Múltipla: marca 2+ opções
   - Foto: tira foto OU abre galeria
   - Video: grava <10s
   - GPS: clica em "Capturar GPS"
   - Catálogo: busca e seleciona 1 item
5. Observar validações:
   ✓ Conforme: tag verde "✓ Conforme"
   ✗ Não conforme: tag vermelha "✗ Não conforme"
   Indeterminado: sem tag
6. Clica "Finalizar Checklist"
7. Se tiver não-conformidade com gera_plano:
   - Abre seletor de "Causa Raiz"
   - Adiciona observação
   - Confirma (cria PlanoAcaoRascunho)
8. ✅ Status PASSA se salva em SQLite
```

**Validações:**
- [ ] Sem crashes ao preencher campos
- [ ] Foto/vídeo compressão funciona
- [ ] GPS captura (mesmo modo mock se necessário)
- [ ] Validações aparecem imediatamente ao sair do campo
- [ ] Barra de progresso atualiza
- [ ] Botão "Finalizar" habilitado só quando tudo respondido

**Debug se falhar:**
```bash
# Verificar execução
SELECT * FROM execucoes WHERE checklist_id = '...' ORDER BY data_inicio DESC LIMIT 1;

# Verificar planos
SELECT * FROM planos_rascunho WHERE sincronizado = 0;

# Verificar respostas
SELECT respostas FROM execucoes LIMIT 1; -- JSON com respostas
```

---

### Fase 3: Sincronização (Volta Online)

**Tempo esperado:** 2-3 min

```
1. Desativa Airplane Mode
2. Aguarda até 30s (monitor verifica conexão a cada 10s)
   - Ou força: Toast "Sincronizando..."
3. POST /api/checklist/sincronizar é enviado
4. Backend processa (insere em Supabase)
5. App marca como sincronizado
6. ✅ Status PASSA se execução aparece em /gestao/checklists
```

**Validações:**
- [ ] Toast notifica "X execuções sincronizadas"
- [ ] Execução desaparece de "Pendentes" no app
- [ ] Dados aparecem em Supabase (SQL):
  ```sql
  SELECT * FROM checklist_execucoes 
  WHERE checklist_id = '...' 
  ORDER BY data_conclusao DESC LIMIT 1;
  ```
- [ ] Resultado é "aprovado" ou "reprovado" (conforme validação)
- [ ] Planos de ação aparecem se foram abertos:
  ```sql
  SELECT * FROM planos_acao 
  WHERE checklist_execucao_id = '...';
  ```

**Debug se POST não é enviado:**
```javascript
// Em sincronizacao.ts
console.log('Verificando internet:', await temInternet())
console.log('Pendentes:', await storage.listarExecucoesPendentes())
```

---

## 📊 Matriz de Validação

| Etapa | Esperado | Falha? | Debug |
|-------|----------|--------|-------|
| Download | Progressbar 0→100 | ❌ | `SELECT * FROM checklists` |
| Execução | Validações em tempo real | ❌ | Console.log calcularValidacao() |
| Finalização | Status salvo em SQLite | ❌ | `SELECT status FROM execucoes` |
| Sincronização | POST enviado | ❌ | Network tab, console.log temInternet() |
| Dados no Backend | Aparece em Supabase | ❌ | SELECT em checklist_execucoes |

---

## 🎯 Casos de Teste Adicionais

### Teste 1: Sem Internet (Robustez)
```
1. Executa checklist
2. NÃO volta online
3. Reinicia app
4. Execução ainda está em "Pendentes"
5. Volta online agora → sincroniza
✓ PASSA se dados não são perdidos
```

### Teste 2: Validação Errada
```
1. Executa checklist
2. Preenche número com valor < min
3. Valida como ✗ Não conforme
4. Finaliza → resultado = "reprovado"
✓ PASSA se resultado correto em Supabase
```

### Teste 3: Plano de Ação Offline
```
1. Executa checklist com não-conformidade
2. gera_plano_acao = true (no montador)
3. Finaliza → abre seletor de Causa Raiz
4. Seleciona + confirma
5. Volta online → plano sincroniza
✓ PASSA se plano_acao criado em Supabase
```

### Teste 4: Múltiplos Checklists
```
1. Prepara 3 checklists offline
2. Executa todos sem internet
3. Volta online
4. Sincroniza
✓ PASSA se 3 execuções aparecem em /gestao
```

---

## 🔧 Troubleshooting

### App trava ao preencher foto
```
→ Problema: comprimirImagem() ou upload
→ Fix: `expo-image-manipulator` versão compatível
→ Teste: console.log na CampoFoto
```

### GPS não captura
```
→ Problema: permissions não concedidas
→ Fix: Settings → Permissions → Location → "Always"
→ Ou: usar mock location no emulador
```

### POST /api/checklist/sincronizar retorna 401
```
→ Problema: token expirado ou inválido
→ Fix: refreshToken ou logout + login novamente
```

### Dados em SQLite mas não sincronizam
```
→ Problema: temInternet() retorna false
→ Debug:
   ```javascript
   const internet = await temInternet()
   console.log('Internet:', internet) // deve ser true
   ```
→ Fix: Conferir URL da API, firewall, DNS
```

### Validação não aparece (sempre null)
```
→ Problema: tipo de atividade sem validação automática
→ Esperado: catalogo, texto, foto, video não validam
→ Apenas sim_nao, numero, multipla_escolha, padrao validam
```

---

## 📱 Cenários Real-World

### Cenário A: Operador em Campo (8h offline)
```
1. Manhã: Prepara 5 checklists (1h conexão)
2. Dia: Executa 3 checklist (7h offline, +500 fotos)
3. Volta: Sincroniza tudo (15 min)
✓ Teste: armazenamento não excede 100 MB
```

### Cenário B: Conexão Intermitente
```
1. Começa execução (online)
2. Ativo offline (executa)
3. Volta online → sync 50%
4. Desliga novamente (offline)
5. Volta online → completa sync
✓ Teste: sem data loss ou duplicação
```

### Cenário C: Múltiplos Usuários
```
1. Usuário A: Executa checklist-X
2. Usuário B: Executa checklist-X (mesmo)
3. Ambos sincronizam
✓ Teste: 2 execuções com IDs diferentes em Supabase
```

---

## ✅ Checklist Final

Antes de marcar como PRONTO:

- [ ] Fase 1 (Preparação) PASSOU
- [ ] Fase 2 (Execução Offline) PASSOU
- [ ] Fase 3 (Sincronização) PASSOU
- [ ] Nenhum crash durante teste
- [ ] Dados consistentes no Supabase
- [ ] 3+ casos adicionais testados
- [ ] Console sem errors/warnings
- [ ] Armazenamento em limites razoáveis

---

## 📝 Relatório de Teste

Ao terminar, preencha:

```markdown
## Teste E2E Offline → Sync

**Data:** 2026-06-25
**Testador:** [Seu Nome]
**Device:** [Emulador/Real] - [iOS/Android]
**Duração:** [tempo total]

### Resultados

| Fase | Status | Observações |
|------|--------|------------|
| Preparação | ✅ PASSOU / ❌ FALHOU | - |
| Execução | ✅ PASSOU / ❌ FALHOU | - |
| Sincronização | ✅ PASSOU / ❌ FALHOU | - |

### Issues Encontradas

1. [Descrição do problema]
   - Severidade: Alta/Média/Baixa
   - Reproduzir: [passos]
   - Fix: [se encontrado]

### Recomendações

- [ ] Aumentar limite de timeout
- [ ] Melhorar UX de erros
- [ ] Adicionar retry automático
```

---

**Status:** 🟢 Ready to Test  
**Próximo:** Rodar E2E, coletar findings, iterar

