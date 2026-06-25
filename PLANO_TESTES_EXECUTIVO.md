# Plano Executivo de Testes E2E

**Data Início:** 2026-06-25  
**Objetivo:** Validar fluxo completo offline → sync  
**Tempo Estimado:** 30-45 min  
**Sucesso:** 0 blockers encontrados

---

## 🎬 Teste 1: Setup & Compilação (5 min)

```bash
✓ npm install --legacy-peer-deps
✓ npm start (Expo)
✓ npm run ios ou android
✓ App abre sem crash
```

**Validação:** App exibe Home tab com 0 pendentes

---

## 📥 Teste 2: Preparação Offline (5 min)

**Setup:** Internet ON

```
1. Home tab → clica "Preparar Checklist"
2. PreparoOfflineScreen abre
3. Seleciona 1 checklist ("Segurança Básica" ou similar)
4. Clica "Download"
5. Aguarda progressbar 0→100%
6. Checklist aparece em "Preparados"
```

**Validações:**
- [ ] Progressbar atualiza suavemente
- [ ] Tamanho mostrado (ex: "0.50 MB")
- [ ] Sem crashes/erros
- [ ] Checklist salvo em SQLite (verificar)

**Sucesso se:** Checklist aparece na lista com status "Preparado"

---

## ⚙️ Teste 3: Execução Offline (7 min)

**Setup:** Airplane Mode ON

```
1. Home tab → clica "Executar Checklist"
2. ExecucaoChecklistScreen abre
3. Preenche atividades (uma de cada tipo):
   - Sim/Não: clica "Sim"
   - Número: digita "50" (entre min/max)
   - Foto: tira foto (câmera) OU abre galeria
   - GPS: clica "Capturar GPS"
   - Catálogo: busca + seleciona item
   - Múltipla: marca 2 opções
   - Data/Hora: seleciona data (picker)
   - Vídeo: grava 3 segundos
   - Texto: digita algo
4. Observa validações em tempo real (✓/✗)
5. Clica "Finalizar Checklist"
```

**Validações:**
- [ ] Sem crashes ao preencher
- [ ] Validações aparecem imediatamente (0-500ms)
- [ ] Foto comprime (não pixel-perfeito)
- [ ] Vídeo limita 10s com auto-stop
- [ ] GPS captura (mesmo em mock/emulador)
- [ ] Barra de progresso atualiza
- [ ] Botão "Finalizar" só ativa quando tudo respondido

**Sucesso se:** Checklist finalizado, status "concluido" salvo em SQLite

---

## 📡 Teste 4: Sincronização Online (5 min)

**Setup:** Airplane Mode OFF

```
1. SincronizacaoScreen abre
2. Mostra "1 execução pendente"
3. Aguarda automático (máx 30s) OU clica "Sincronizar Agora"
4. Progressbar executa
5. Toast "✓ Sincronizada 1 execução"
6. Contador volta a "0 pendentes"
```

**Validações:**
- [ ] Internet detectada (mostra "Online")
- [ ] POST enviado (verificar em Backend logs)
- [ ] Sem erros 401/500
- [ ] Dados aparecem em Supabase

**Sucesso se:** Execução aparece em `/gestao/checklists` (web)

---

## 🔍 Teste 5: Validação em Supabase (5 min)

**Setup:** Acessar backend/Supabase

```sql
-- Verificar execução foi inserida
SELECT id, status, resultado, usuario_id, checklist_id
FROM checklist_execucoes
WHERE data_conclusao > NOW() - INTERVAL '1 minute'
LIMIT 1;

-- Esperado: 1 linha com status='concluido', resultado='aprovado'/'reprovado'
```

**Validações:**
- [ ] Execução existe com UUID correto
- [ ] Respostas JSON válidas (5+ campos)
- [ ] Data sincronização preenchida
- [ ] RLS não bloqueou (acesso correto)

**Sucesso se:** Dados idênticos aos salvos offline

---

## 🐛 Teste 6: Error Handling (opcional, 5 min)

```
1. Ligar Airplane Mode durante execução
2. Tentar sincronizar
3. Erro exibido claramente (toast)
4. Retry manual funciona depois

OU

5. Simular rede lenta (Chrome DevTools)
6. Sincronização ainda funciona (timeout adequado)
```

**Sucesso se:** App não trava, erro claro, retry funciona

---

## 📊 Matriz de Resultados

| Teste | Status | Blocker? | Nota |
|-------|--------|----------|------|
| Setup | 🟢 / 🔴 | - | - |
| Prep | 🟢 / 🔴 | Sim | SQLite write |
| Exec | 🟢 / 🔴 | Sim | Validações |
| Sync | 🟢 / 🔴 | Sim | POST |
| SB | 🟢 / 🔴 | Sim | RLS |
| Errors | 🟢 / 🔴 | Não | UX |

---

## 🎯 Success Criteria

✅ **PASSA se:**
- Todos os 5 testes principais virem ✓
- Zero crashes
- Dados em Supabase idênticos aos offline
- Validações funcionam em tempo real

❌ **FALHA se:**
- Qualquer crash
- Dados não sincronizam
- Validação errada (ex: aceita quando deveria rejeitar)
- RLS bloqueia incorretamente

---

## 📝 Notas

- Cada teste é **independente** (pode rodar qualquer ordem)
- Se **algum falhar**, parar e debugar antes de continuar
- **Documentar bugs** encontrados com:
  - Passos para reproduzir
  - Erro esperado vs real
  - Logs (console + Supabase)

---

**Tempo Total:** 30 min  
**Custo:** 0 (local testing)  
**Risk:** Baixo (testa isolado)

