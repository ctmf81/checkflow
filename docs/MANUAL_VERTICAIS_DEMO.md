# Manual de Verticais — Gerador de Dados de Demonstração

Este manual descreve as **verticais** disponíveis no gerador de dados de
demonstração do CheckFlow e como usá-las. Uma vertical é um "molde" de negócio
que preenche uma empresa-demo com estrutura, checklists (com gabarito de
conformidade), usuários, catálogo, tickets e tarefas realistas.

> **Onde isto vive no código:** `apps/web/lib/demo/verticais/` (um arquivo por
> vertical) + `index.ts` (registro). A rota `POST /api/empresa/demo/gerar`
> consome os templates. Regras de negócio da feature: skill `/biz`.

---

## Como usar (fluxo do operador)

1. **Marcar a empresa como demo** — admin de sistema, em `sistema/empresas/[id]`
   → aba Configurações → liga "Empresa de demonstração" e escolhe a **vertical**.
2. **Gerar estrutura** (1×) — admin da empresa, em `gestao/acessos/empresa` →
   card "Empresa de demonstração" → botão **Gerar estrutura**. Cria unidade,
   grupos/subgrupos, catálogo, 4 usuários (perfis distintos), 5 checklists
   publicados, causas-raiz, tickets e tarefas. É **idempotente** (pode repetir;
   o link "Regerar estrutura" completa uma estrutura incompleta).
3. **Gerar dados dos últimos 30 dias** (repetível) — mesmo card → botão
   **Gerar dados**. Acrescenta **80 execuções** distribuídas em dias úteis dos
   últimos 30 dias, com respostas conformes/não-conformes e **planos de ação em
   todos os status** (moderação N1/N2, corrigido, não corrigido). Não apaga nada;
   pode repetir para deixar mais cheio.

**Usuários demo** (todas as verticais): login por CPF, senha `Demo@2026`, e-mail
`<cpf>@demo.checkflow.local`. 4 por vertical, um de cada perfil: Operação,
Coordenador, Gestão do Grupo, Admin da empresa.

**Blindagem:** o gerador **só roda em empresa marcada como demo** (`empresas.demo`)
e a empresa demo é isenta de billing (fase sempre `ativa`).

---

## Verticais disponíveis (8)

Cada vertical tem 5 checklists com gabarito, 1 catálogo, 4 usuários, ~2 tickets e
~2 listas de tarefas. Estrutura em dois níveis (Grupo › Subgrupo) com rótulos
próprios de cada negócio.

### 1. Fábrica de Alimentos — `fabrica_alimentos`
- **Rótulos:** Setor › Área — Unidade: *Planta Industrial*
- **Estrutura:** Recebimento (Matéria-prima, Insumos) · Produção (Envase, Câmara Fria) · Qualidade & Segurança de Alimentos (APPCC, Higienização)
- **Catálogo:** Câmaras Frias
- **Checklists:** Recebimento de Matéria-prima · Controle de Temperatura (Câmara Fria) · Inspeção de Linha de Envase · APPCC · Higienização

### 2. Gestão de Condomínios — `condominio`
- **Rótulos:** Bloco › Área — Unidade: *Condomínio Residencial*
- **Estrutura:** Torre A (Áreas Comuns, Garagem) · Torre B (Áreas Comuns) · Lazer & Manutenção (Piscina, Portaria & Segurança)
- **Catálogo:** Equipamentos Prediais
- **Checklists:** Ronda de Portaria · Inspeção de Piscina · Limpeza de Áreas Comuns · Vistoria de Garagem · Manutenção Predial Preventiva

### 3. Rede de Lojas — `rede_lojas`
- **Rótulos:** Região › Loja — Unidade: *Rede Varejo*
- **Estrutura:** Região Sul (Loja Centro, Loja Shopping) · Região Norte (Loja Praia) · Padrões & Prevenção (Prevenção de Perdas, Visual Merchandising)
- **Catálogo:** Lojas
- **Checklists:** Abertura de Loja · Ronda de Prevenção de Perdas · Padrão Visual (Merchandising) · Conferência de Estoque · Atendimento e Fila

### 4. Hospital — `hospital`
- **Rótulos:** Setor › Unidade — Unidade: *Hospital*
- **Estrutura:** Assistência (UTI, Enfermaria, Centro Cirúrgico) · Apoio (Farmácia, Higienização)
- **Catálogo:** Equipamentos Médicos
- **Checklists:** Segurança do Paciente · Segurança Cirúrgica · Controle de Medicamentos · Higienização Hospitalar · (leito/equipamento)

### 5. Agronegócio — `agronegocio`
- **Rótulos:** Unidade › Área — Unidade: *Complexo Agroindustrial*
- **Estrutura:** Recebimento & Classificação (Balança, Classificação) · Armazenagem (Silos, Secagem) · Expedição (Carregamento)
- **Catálogo:** Silos
- **Checklists:** Recebimento de Grãos · Inspeção de Silo · Secagem · Carregamento · Classificação

### 6. Fábrica de Transformação — `fabrica_transformacao`
- **Rótulos:** Setor › Linha — Unidade: *Planta de Transformação*
- **Estrutura:** Usinagem (Torno CNC, Fresa) · Injeção (Injetora 1, Injetora 2) · Qualidade & Manutenção (Metrologia, Manutenção)
- **Catálogo:** Máquinas
- **Checklists:** Setup de Máquina · Inspeção Dimensional · Injeção de Peças · Manutenção Preventiva · Metrologia

### 7. Agropecuária — `agropecuaria`
- **Rótulos:** Setor › Área — Unidade: *Fazenda*
- **Estrutura:** Pecuária (Curral, Ordenha) · Agricultura (Lavoura, Irrigação) · Suporte (Máquinas)
- **Catálogo:** Talhões
- **Checklists:** Ordenha (Qualidade do Leite) · Inspeção de Lavoura · Manejo do Curral · Irrigação · Manutenção de Máquinas

### 8. Hotelaria — `hotel`
- **Rótulos:** Departamento › Área — Unidade: *Hotel*
- **Estrutura:** Hospedagem (Recepção, Governança) · Alimentos & Bebidas (Restaurante, Cozinha) · Manutenção & Lazer (Piscina & Spa, Área Técnica)
- **Catálogo:** Unidades Habitacionais (quartos)
- **Checklists:** Abertura da Recepção · Limpeza de Apartamento (Governança) · Café da Manhã (Buffet) · Segurança Alimentar (Cozinha) · Inspeção de Piscina & Spa

---

## Como adicionar uma nova vertical (dev)

1. Crie `apps/web/lib/demo/verticais/<minhaVertical>.ts` exportando um
   `VerticalTemplate` (ver o tipo em `lib/demo/tipos.ts`). Use um arquivo
   existente como base (ex.: `hotel.ts`).
2. Registre no `index.ts`: importe e adicione ao mapa `VERTICAIS`.
3. Regras que o **validador** (`validarTemplate.ts`) exige — os 16 testes de
   `tests/unit/lib/demo/template.unit.test.ts` rodam sobre toda vertical
   registrada:
   - `id`, `nome` e `estrutura` presentes; ao menos 1 usuário com papel `operador`.
   - Todo checklist referencia um `grupo`/`subgrupo` que existe na `estrutura`.
   - O `tipo` de cada atividade combina com o gabarito (`sim_nao`+`simConforme`,
     `numero`+`faixa`, `multipla_escolha`+`opcoes`/`opcoesConformes`,
     `catalogo`+`catalogo` existente, `texto`+`valores`).
   - `pesos` de desfecho > 0; ao menos uma atividade que valida por checklist
     (para gerar não conformidade → plano de ação).
4. **CPFs únicos entre todas as verticais** — o e-mail do usuário é
   `<cpf>@demo.checkflow.local` e o CPF vira o telefone (ambos `UNIQUE`).
   Reusar um CPF de outra vertical colide no `auth`/`usuarios`.
5. Rode `npx vitest run tests/unit/lib/demo/template.unit.test.ts` e o typecheck.

### Detalhes de gabarito por tipo de atividade

| Tipo | Campo de gabarito | Conforme quando |
|------|-------------------|-----------------|
| `sim_nao` | `simConforme: 'sim' \| 'nao'` | resposta = valor conforme |
| `numero` | `faixa: {min, max, unidade?}` | valor dentro da faixa |
| `multipla_escolha` | `opcoes[]` + `opcoesConformes[]` | escolha ∈ conformes |
| `catalogo` | `catalogo: '<nome>'` | não valida (sempre neutra) |
| `texto` | `valores[]` (plausíveis) | não valida |

---

## Referências

- Feature completa e decisões: memória `feature-gerador-demo` e skill `/biz`.
- Fluxo dev→prod: `docs/ops/AMBIENTES.md`.
- Base de demo manual anterior (Amadê, produção): memória `dados-demo-amade`.
