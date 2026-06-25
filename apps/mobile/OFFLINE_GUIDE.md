# CheckFlow Mobile — Execução Offline

## Arquitetura de Camadas

```
┌─────────────────────────────────────────────────────────────────┐
│                   UI (Tela de Execução)                         │
│              ChekclistExecucaoScreen.tsx                         │
└────────┬────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────┐
│         Validações & Engine (Lógica Pura)                      │
│  ✓ validacoes.ts (calcularValidacao, etc)                      │
│  ✓ checklistEngine.ts (dependências, progresso)                │
└────────┬────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────┐
│         Storage Local (SQLite)                                  │
│  ✓ storage.ts (salvar/carregar execuções, catálogos, etc)     │
└────────┬────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────┐
│      Sincronização (quando volta online)                        │
│  ✓ sincronizacao.ts (POST /api/checklist/sincronizar)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fluxo Offline → Online

### 1️⃣ Preparação (Online)

Operador acessa `/operacao/preparar` (tela web):
```
✓ Seleciona checklists
✓ Clica "Preparar para offline"
✓ Sistema baixa:
  - Checklist (estrutura JSON)
  - Catálogos (valores + imagens)
  - Padrões (variáveis + instâncias)
  - Motivos de não-execução
✓ App armazena em SQLite
```

**Dados baixados:**
```typescript
// Estrutura completa:
{
  id, nome, descricao, tempo_guarda_meses,
  secoes: [
    {
      id, nome,
      atividades: [
        {
          id, nome, tipo, config,
          valor_gatilho, dependentes,
          opcoesMC: [ { id, label, valor, e_valido } ]
        }
      ]
    }
  ]
}
```

### 2️⃣ Execução (Offline)

App carrega checklist de SQLite:

```typescript
// Abrir checklist
const checklist = await storage.obterChecklist(id)

// Operador preenche respostas
const respostas = {
  'atividade-1': 'sim',
  'atividade-2': 42,
  'atividade-3': ['opcao-a', 'opcao-b']
}

// Sistema calcula validações LOCALMENTE
const atividades = listarAtividadesVisiveis(checklist.secoes, respostas)
for (const a of atividades) {
  const valido = calcularValidacao(a) // true/false/null
  // UI mostra ✓ ou ✗
}

// Ao finalizar
const resultado = calcularResultadoGlobal(atividades)
// resultado = 'aprovado' ou 'reprovado'

// Se não conforme + gera_plano_acao:
// → Abre seletor de causa raiz (offline)
// → Cria PlanoAcaoRascunho em SQLite

// Salva execução
await storage.salvarExecucao({
  id: uuid(),
  checklist_id,
  usuario_id,
  data_inicio,
  data_conclusao,
  status: 'concluido',
  resultado,
  respostas,
  sincronizado: false // OFFLINE!
})
```

**Nada sai do device** até voltar online.

### 3️⃣ Sincronização (Volta Online)

Monitor detecta conexão:

```typescript
// Em background
const cleanup = iniciarMonitorConexao(token, async (status) => {
  console.log(`✓ Sincronizadas ${status.execucoesEnviadas} execuções`)
})
```

Quando volta online:

```typescript
// Busca pendentes
const execucoes = await storage.listarExecucoesPendentes()
const planos = await storage.listarPlanosPendentes()

// POST para servidor
const response = await axios.post(
  'https://api.checkflow.app/api/checklist/sincronizar',
  { execucoes, planos, timestamp },
  { headers: { Authorization: `Bearer ${token}` } }
)

// Servidor:
// 1. Valida RLS (usuário pertence à unidade?)
// 2. Insere/atualiza checklist_execucoes
// 3. Insere planos_acao
// 4. Retorna confirmação

// App marca como sincronizado
for (const exec of execucoes) {
  exec.sincronizado = true
  await storage.salvarExecucao(exec)
}

// ✓ Concluído
```

---

## Estrutura de Tipos

### ChecklistExecucao
```typescript
{
  id: string (UUID)
  checklist_id: string
  unidade_id: string
  usuario_id: string
  data_inicio: ISO string
  data_conclusao: ISO string
  status: 'em_andamento' | 'concluido' | 'nao_executado'
  resultado: 'aprovado' | 'reprovado'
  respostas: Record<string, any>
    // { 'atividade-1': 'sim', 'atividade-2': 42, ... }
  motivo_nao_execucao_id?: string (se não_executado)
  motivo_nao_execucao_obs?: string
  sincronizado: boolean (false até POST sucesso)
  sincronizado_em?: ISO string
}
```

### PlanoAcaoRascunho
```typescript
{
  id: string (UUID local)
  checklist_execucao_id: string
  atividade_id: string
  status: 'em_moderacao_n1'
  causa_raiz_id?: string (seleção do operador)
  observacao?: string
  sincronizado: boolean
  sincronizado_em?: ISO string
}
```

---

## Validações Locais (100% Offline)

### Sim/Não
```typescript
config: { esperado: 'sim' | 'nao' }
resposta: string
valido = resposta === config.esperado
```

### Número
```typescript
config: { min: 10, max: 50 }
resposta: number
valido = resposta >= min && resposta <= max
```

### Múltipla Escolha
```typescript
config: {} (vem com opcoesMC)
resposta: string[]
valido = !resposta.some(v => !opcao.e_valido)
```

### Padrão
```typescript
config: { padrao_id: '...' }
resposta: { numero, instancia_id, valor_min, valor_max }
valido = numero >= valor_min && numero <= valor_max
// instancia_id resolvido no CampoPadrao ao selecionar variáveis
```

### Sem Validação
- `catalogo` (só seleciona item)
- `texto` (sem validar)
- `foto` (obrigatoriedade checada no UI)
- `video` (obrigatoriedade)
- `assinatura` (obrigatoriedade)
- `data_hora` (sem validação)
- `localizacao` (só captura GPS)

---

## O Que Precisa no Backend

### 1. Registrar rota em `apps/api/src/index.ts`:
```typescript
import { sincronizacaoRoutes } from './routes/sincronizacao'
// ... no setup:
await sincronizacaoRoutes(app)
```

### 2. Migration (se houver coluna nova):
Checklist_execucoes já tem campos suficientes:
- `status` (enum)
- `resultado` (enum)
- `respostas_json` (jsonb)
- RLS já funciona por `unidade_id`

### 3. Notificação (futuro):
Quando plano é criado offline, enqueue para N1:
```typescript
// Em sincronizacao.ts, após inserir plano:
await notificarPlanoAberto(plano, subgrupo)
```

---

## Testes

### Unit Tests (validações)
```bash
cd apps/mobile
npm test -- src/lib/validacoes.test.ts
```

### E2E (offline → online)
```
1. Ligar app, habilitar airplane mode
2. Abrir checklist preparado, preencher
3. Finalizar execução → salva em SQLite
4. Desligar airplane, aguardar sync
5. Conferir POST sucesso + dados em Supabase
```

---

## Checklist de Deploy

- [ ] `apps/api/src/routes/sincronizacao.ts` criado e registrado
- [ ] Migration de `planos_acao` (se houver) aplicada
- [ ] RLS testado (usuário pode ler próprias execuções?)
- [ ] E-mail notificação N1 configurado (opcional)
- [ ] Teste E2E offline → online
- [ ] Documentação da API em `/docs/api/SINCRONIZACAO.md`

---

## Limitações Conhecidas

1. **Sem merge de conflitos**: Se mesmo checklist é executado 2x offline, viram 2 execuções (correto).
2. **Sem retry automático**: Se sincronização falha, fica pendente até nova tentativa. UI mostra erro.
3. **Sem compressão de respostas**: Fotos/vídeos salvos em cache local, não comprimidos no JSON.
4. **Sem quarentena de dados**: Se plano falha ao sincronizar, fica em SQLite (não descarta).

---

## Próximos Passos

1. **Tela de execução** (`ChecklistExecucaoScreen.tsx`) — usar tipos + validações
2. **Preparação offline** (`PreparoOfflineScreen.tsx`) — download de dados
3. **Monitor de conexão** — iniciar ao login
4. **Notificação de sync** — toast "X execuções sincronizadas"
5. **Testes E2E** — offline path completo
