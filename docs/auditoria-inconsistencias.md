# Auditoria de Inconsistências — CheckFlow
Data: 2026-06-06

---

## 🔴 CRÍTICO — Bloqueadores de produção

### 1. Tipo `video` sem migration no banco
**Onde:** `checklist_atividades.tipo` tem um CHECK CONSTRAINT que não inclui `'video'`
**Impacto:** Ao tentar salvar uma atividade do tipo vídeo, o Postgres retorna erro de constraint — o checklist não salva.
**Arquivo afetado:** `supabase/migrations/20260603000017_checklists.sql` (linha 47-57)
**Correção criada:** `supabase/migrations/20260606000003_add_tipo_video.sql`
**Ação:** Aplicar a migration no Supabase (dashboard → SQL Editor ou `supabase db push`)

---

### 2. Execução não salva respostas individualmente
**Onde:** `operacao/[id]/page.tsx` → função `finalizar()`
**Impacto:** A tabela `checklist_execucoes` registra APENAS o header da execução (data, status, unidade). As respostas de cada atividade **não são salvas em nenhuma tabela**. Dados de campo são perdidos.
**Análise:** Não existe tabela `checklist_execucao_respostas` no schema atual.
**Risco de negócio:** ALTO — inviabiliza relatórios, rastreabilidade e auditoria.
**Correção sugerida:**
```sql
create table checklist_execucao_respostas (
  id            uuid primary key default gen_random_uuid(),
  execucao_id   uuid not null references checklist_execucoes(id) on delete cascade,
  atividade_id  uuid not null references checklist_atividades(id),
  resposta      jsonb,        -- valor da resposta (string, número, objeto)
  conforme      boolean,      -- resultado da validação (null se sem validação)
  criado_em     timestamptz not null default now()
);
```

---

### 3. Foto e Vídeo não são enviados para o Storage
**Onde:** `CampoFoto` e `CampoVideo` usam `URL.createObjectURL(file)` — URL temporária local
**Impacto:** O arquivo existe apenas na memória do browser. Ao fechar a aba, a URL expira. Mesmo que as respostas fossem salvas, a referência seria inválida.
**Correção sugerida:** No `finalizar()`, antes de salvar, fazer upload dos arquivos de foto/vídeo para o Supabase Storage e substituir a URL local pelo path permanente.

---

## 🟠 IMPORTANTE — Bugs de comportamento

### 4. Botão "Finalizar checklist" não valida campos obrigatórios
**Onde:** `finalizar()` em `operacao/[id]/page.tsx`
**Impacto:** O executor pode finalizar um checklist sem responder nenhuma atividade obrigatória (`obrigatoria = true`).
**Correção sugerida:** Antes de inserir em `checklist_execucoes`, verificar se todas as atividades com `obrigatoria = true` têm resposta. Exibir toast/alerta indicando quais estão pendentes.

---

### 5. `SessionContext` expõe `user` via cast `as any`
**Onde:** `operacao/[id]/page.tsx` linha 517:
```tsx
const { unidadeAtiva, user } = useSession() as any
```
**Impacto:** `user` não existe na interface `SessionState` — é `undefined` em runtime. O `executado_por` no insert fica `undefined` (Postgres aceita como NULL, mas o campo deveria ser preenchido corretamente).
**Correção sugerida:** Adicionar `user: User | null` ao `SessionContext` ou buscar o usuário diretamente com `supabase.auth.getUser()` dentro do `finalizar()`.

---

### 6. Atividades dependentes não contam no progresso quando inativas
**Onde:** `calcularProgresso()` em `operacao/[id]/page.tsx`
**Impacto:** Atividades dependentes com `valor_gatilho` são sempre contadas no total, mesmo quando o gatilho não foi atingido e elas estão invisíveis. O progresso mostra `8/15` quando só 12 atividades estão visíveis para o executor.
**Análise:** A lógica tenta compensar (`if (gatilhoAtivo) contar(a.dependentes)`), mas tem bug: verifica `a.dependentes.some(d => ...)` antes de qualquer resposta existir, causando contagem errada no início.

---

### 7. QR scanner (BarcodeDetector) falha silenciosamente em iOS
**Onde:** `lerCodigoDeCamera()` em `operacao/[id]/page.tsx`
**Impacto:** BarcodeDetector não existe em nenhuma versão do Safari/iOS. A mensagem de erro aparece, mas o campo de texto fica bloqueado para o executor que não sabe digitar manualmente.
**Situação atual:** O campo de texto ainda funciona normalmente (é só o botão QR que não funciona).
**Melhoria sugerida:** Avaliar biblioteca `html5-qrcode` para cobertura cross-browser via WebRTC.

---

### 8. Layout da Operação não redireciona usuário não autenticado
**Onde:** `operacao/layout.tsx`
**Impacto:** Se o token Supabase expirar, `SessionContext` retorna `unidadeAtiva = null` e a página mostra "Nenhuma unidade selecionada" sem redirecionar para o login.
**Correção sugerida:** No `useEffect` do `OperacaoHeader`, verificar `supabase.auth.getSession()` e redirecionar para `/login` se não autenticado.

---

## 🟡 ATENÇÃO — Inconsistências de negócio

### 9. WhatsApp: config armazenada em localStorage (não no banco)
**Onde:** `sistema/whatsapp/page.tsx` — `CONFIG_KEY = 'checkflow_evo_config'`
**Risco:** Se o admin trocar de navegador/dispositivo, perde a configuração. Não há backup.
**Risco adicional:** `apiKey` da Evolution API visível no localStorage (plain text).
**Melhoria sugerida:** Salvar URL e nome da instância em uma tabela `configuracoes_sistema`, mantendo a API key apenas como variável de ambiente no Railway.

---

### 10. Checklist publicado pode ter suas atividades editadas pelo montador
**Onde:** `ChecklistMontador.tsx` — salva atividades diretamente, independente do status do checklist
**Risco:** A regra de negócio diz "nunca mutar um checklist publicado". O montador não verifica `status === 'publicado'` antes de salvar.
**Correção sugerida:** Bloquear edição de atividades quando `checklist.status === 'publicado'`, exibindo banner "Para editar, crie uma nova versão".

---

### 11. `tempo_guarda_meses = 64` não está na documentação — provavelmente deveria ser 60 (5 anos)
**Onde:** `ChecklistMontador.tsx` — botões `[1, 3, 6, 12, 24, 36, 48, 64]`
**Análise:** 48 meses = 4 anos, 64 meses ≈ 5 anos e 4 meses. Legislações de guarda de documentos geralmente usam 5 anos (60 meses). Verificar se 64 é intencional ou erro tipográfico de 60.

---

### 12. Catálogo: busca não é case-insensitive para acentos
**Onde:** `CampoCatalogo` — `i.valor_chave?.toLowerCase().includes(busca.toLowerCase())`
**Impacto:** Buscar "maquina" não encontra "máquina" com acento.
**Correção sugerida:** Normalizar com `normalize('NFD').replace(/[̀-ͯ]/g, '')` antes de comparar.

---

### 13. Operação: sem indicação visual de atividades críticas
**Onde:** `AtividadeItem` em `operacao/[id]/page.tsx`
**Análise:** O campo `critica` existe em `checklist_atividades` e é exibido no montador, mas na execução não há nenhuma marcação visual distinguindo atividades críticas das normais.
**Risco de negócio:** Executor não sabe quais atividades, se reprovadas, reprovam o checklist inteiro.

---

## ✅ FUNCIONANDO CORRETAMENTE

- Validação de Sim/Não, Número e Múltipla escolha
- Máscara de texto com formatos 9/A/*
- GPS com reverse geocoding via Nominatim
- Agrupamento de checklists por grupo/subgrupo na Operação
- Atividades dependentes com gatilho condicional (exibição correta)
- Catálogo com busca, expansão de atributos e imagem
- Tempo de guarda configurável (botões de seleção)
- Tipo Vídeo: câmera vs galeria + alerta de arquivo antigo
- RLS isolando execuções por unidade

---

## Próximas ações recomendadas (por prioridade)

| # | Ação | Esforço | Impacto |
|---|------|---------|---------|
| 1 | Aplicar migration `20260606000003_add_tipo_video.sql` no Supabase | 5 min | Crítico |
| 2 | Criar tabela `checklist_execucao_respostas` + salvar no finalizar() | 2h | Crítico |
| 3 | Upload de foto/vídeo para Supabase Storage no finalizar() | 2h | Crítico |
| 4 | Validar campos obrigatórios antes de finalizar | 1h | Alto |
| 5 | Corrigir `user` no SessionContext (remover cast `as any`) | 30 min | Médio |
| 6 | Bloquear edição de checklist publicado | 1h | Médio |
| 7 | Redirect para login quando sessão expirar na Operação | 30 min | Médio |
| 8 | Normalizar busca de catálogo para acentos | 15 min | Baixo |
| 9 | Marcar atividades críticas visualmente na execução | 1h | Baixo |
| 10 | Persistir config WhatsApp no banco (exceto API key) | 2h | Baixo |
