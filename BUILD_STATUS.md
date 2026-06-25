# CheckFlow Mobile — Status da Construção

**Data:** 2026-06-25  
**Status:** 🟡 Estrutura Completa, Implementação em Andamento

---

## ✅ Concluído

### Apps/Mobile - Camada de Dados & Lógica

| Arquivo | Descrição | Status |
|---------|-----------|--------|
| `package.json` | Dependências (Expo, SQLite, Axios, React Nav) | ✅ |
| `app.json` | Config Expo (permissions, plugins) | ✅ |
| `src/lib/tipos.ts` | 11 interfaces TypeScript (Atividade, Checklist, etc) | ✅ |
| `src/lib/validacoes.ts` | 4 funções puras (validação, progresso, visibilidade) | ✅ |
| `src/lib/checklistEngine.ts` | Dependências, gatilhos, resultado global | ✅ |
| `src/lib/storage.ts` | SQLite: 8 tabelas, CRUD completo | ✅ |
| `src/lib/sincronizacao.ts` | Monitor de conexão, POST de sync | ✅ |
| `OFFLINE_GUIDE.md` | Documentação completa (fluxo, tipos, testes) | ✅ |

### Apps/API - Backend de Sincronização

| Arquivo | Descrição | Status |
|---------|-----------|--------|
| `src/routes/sincronizacao.ts` | POST `/api/checklist/sincronizar` (RPC novo) | ✅ |

### Exemplo de Integração

| Arquivo | Descrição | Status |
|---------|-----------|--------|
| `src/screens/ExecucaoChecklist.tsx` | Tela de execução (exemplo) | ✅ Exemplo |

---

## ✅ Próximos Passos (Concluídos nesta Sessão)

### Mobile ✅

- [x] **Tela de Preparação Offline** (`PreparoOfflineScreen.tsx`) ✅
  - Seletor de checklists
  - Download de estrutura + catálogos + padrões
  - Progressbar com estimativa de tamanho

- [x] **Componentes por Tipo de Atividade** ✅
  - `CampoFoto.tsx` (câmera, compressão 1600px)
  - `CampoVideo.tsx` (gravação, limite 10s auto-stop)
  - `CampoLocalizacao.tsx` (GPS auto-capture)
  - `CampoCatalogo.tsx` (busca em SQLite)
  - `CampoPadrao.tsx` (seleção variáveis + faixa)
  - `CampoDataHora.tsx` (picker nativo iOS/Android)
  - `CampoFactory.tsx` (dispatcher de 11 tipos)

- [x] **Tela de Execução Completa** (`ExecucaoChecklistScreen.tsx`) ✅
  - Renderização com CampoFactory
  - Validações em tempo real
  - Barra de progresso
  - Finalizar + criar PlanoAcaoRascunho

## 🟡 Próximos Passos (Curto Prazo)

### Mobile

- [ ] **Testes E2E** (PRIORITY 1)
  - Rodar fluxo offline → sync completo
  - Validar dados em Supabase
  - Encontrar & corrigir bugs

- [ ] **Notificações**
  - Toast "X execuções sincronizadas"
  - Badge de pendentes
  - Status visual de sincronização

- [ ] **Telas Faltantes**
  - SincronizacaoScreen (logs, retry manual)
  - HomeScreen (dashboard)
  - SettingsScreen (config API)

### Backend (API)

- [ ] **Registrar rota em `apps/api/src/index.ts`**
  ```typescript
  import { sincronizacaoRoutes } from './routes/sincronizacao'
  await sincronizacaoRoutes(app)
  ```

- [ ] **Ajustes de RLS** (se necessário)
  - Validar que usuário pertence à unidade
  - Validar checklist existe e é publicado

- [ ] **Notificação N1**
  - Ao criar plano via sync, avisar N1 do subgrupo

- [ ] **Testes E2E**
  - Offline → Execução → Sync → Verificação em Supabase

### Documentação

- [ ] `/docs/api/SINCRONIZACAO.md` — Contrato da API
- [ ] `/docs/MOBILE_SETUP.md` — Setup local (Expo, emulador)
- [ ] `/docs/OFFLINE_WORKFLOW.md` — Passo a passo operador

---

## 🔧 Decisões Técnicas (Registradas)

| Decisão | Rationale | Alternativa |
|---------|-----------|-------------|
| **Expo** vs Bare RN | Prototipagem rápida, plugins prontos | Bare para mais controle |
| **SQLite** via expo-sqlite | Nativo, sem deps externas | WatermelonDB (mais peso) |
| **Sincronização POST** | Simples, idempotente | GraphQL subscription |
| **Sem merge de conflitos** | Mesma execução 2x = 2 registros | Versioning complexo |
| **Validações em TypeScript** | Reutilização com web, sem Postgres | Validações dinâmicas (custaria runtime) |
| **Monitor a cada 10s** | Trade-off bateria vs latência | Bluetooth beacon (overkill) |

---

## 📊 Tamanho Estimado (Download Offline)

| Item | Bytes | Exemplo |
|------|-------|---------|
| Checklist (estrutura) | ~50 KB | 10 seções × 50 atividades |
| Catálogos (1000 itens) | ~500 KB | Sem imagens |
| Padrões (100 combos) | ~100 KB | |
| **Total (sem mídia)** | **~700 KB** | Cabe fácil em SQLite |
| Imagens de catálogo | ~2-10 MB | Opcional (cache) |

**Total típico:** 1-2 MB por checklist preparado  
**Storage local:** 50+ MB disponível no mobile moderno

---

## 🧪 Roadmap de Testes

### Unit (Semana 1)
```
✓ validacoes (aprovado/reprovado)
✓ checklistEngine (dependências, gatilhos)
✓ storage (insert/select)
```

### E2E (Semana 2)
```
1. Ligar Airplane Mode
2. Abrir checklist preparado
3. Preencher (visivelmente valida)
4. Finalizar → SQLite
5. Desligar Airplane
6. Await sync automático
7. Verificar em Supabase ✓
8. Abrir em web → vê execução
```

### Performance (Semana 3)
```
✓ Abrir checklist 100 atividades (<1s)
✓ Salvar resposta (<100ms)
✓ Sincronizar 10 execuções (<5s)
✓ Bateria (1h execução ≈ 10% bateria)
```

---

## 📋 Registro de Mudanças

### Criado em 2026-06-25

**Apps/Mobile (novo)**
- `/package.json` — Expo + SQLite + Axios
- `/app.json` — Config Expo
- `/src/lib/tipos.ts` — 11 interfaces TypeScript
- `/src/lib/validacoes.ts` — Validação por tipo de atividade
- `/src/lib/checklistEngine.ts` — Dependências + progresso
- `/src/lib/storage.ts` — SQLite com 8 tabelas
- `/src/lib/sincronizacao.ts` — Monitor + POST sync
- `/src/screens/ExecucaoChecklist.tsx` — Exemplo de tela
- `/OFFLINE_GUIDE.md` — Documentação completa

**Apps/API**
- `/src/routes/sincronizacao.ts` — POST `/api/checklist/sincronizar`

**Documentação**
- `BUILD_STATUS.md` (este arquivo)

---

## 🎯 Success Criteria

- [ ] App abre checklist offline sem erro
- [ ] Validações rodam localmente (sem esperar rede)
- [ ] Planos de ação abrem offline (seleção causa raiz)
- [ ] Volta online → sincroniza automaticamente (no máximo 30s)
- [ ] Execuções aparecem em Supabase idênticas às do web
- [ ] 0 dados perdidos (nenhuma execução orfã)

---

## 🚀 Próximos Passos Imediatos (1 Semana)

1. **Desenvolver componentes** (CampoFoto, CampoVideo, etc)
2. **Tela de preparação offline** (download de dados)
3. **Testes unitários** (validações, storage)
4. **Registrar rota no backend**
5. **Teste E2E completo** (offline → sync)

---

## 💾 Arquivo de Contexto

Salvar em memory:
- [ ] Decisões técnicas (Expo vs Bare, SQLite, sync strategy)
- [ ] Próximas prioridades (componentes, testes, E2E)
- [ ] Links para documentação (OFFLINE_GUIDE.md)

