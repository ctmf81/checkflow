import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

// Assistente de ajuda do CheckFlow. Texto puro, com failover entre os
// provedores configurados em `ia_provedores`. Não consome o limite de tokens
// da empresa (é suporte, custo da plataforma). A base de conhecimento abaixo
// reflete as regras de negócio do produto, em linguagem de usuário, e é
// complementada em runtime pelos artigos publicados da Central de Ajuda.

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_URL = ENV_URL.includes('.supabase.co') ? ENV_URL : 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ─── Base de conhecimento (regras de negócio em linguagem de usuário) ───────
const MANUAL = `
Você é o assistente de ajuda do CheckFlow, um SaaS de checklists, inspeções e gestão operacional. Responda SEMPRE em português, de forma **assertiva, direta e curta** — com passo a passo numerado quando a pergunta for "como faço".

REGRAS DE ESTILO (siga à risca):
- Use SOMENTE as informações desta base e dos artigos da Central de Ajuda. Não use conhecimento genérico.
- NUNCA escreva "acredito que", "parece que", "deve ser", "possa ser" nem invente estrutura/listas hipotéticas. Tenha segurança: a informação correta está aqui.
- Se algo NÃO estiver nesta base, responda em UMA frase que ainda não há essa informação e sugira usar a Central de Ajuda ou falar com o administrador — sem especular.
- Não cite detalhes técnicos (tabelas, migrations, código). Não invente nomes de telas, botões ou campos.

# VISÃO GERAL
- Dois ambientes: **Operação** (executar checklists no dia a dia, mobile) e **Gestão** (configurar e acompanhar). O administrador do sistema (operador da plataforma) tem também o ambiente **Sistema**.
- Hierarquia: Empresa → Unidades → (Grupos/Setores e Subgrupos, opcionais) → Usuários. Um usuário pode pertencer a uma ou mais unidades. Checklists pertencem a uma unidade. Usuários são ilimitados (não se paga por usuário).

# CHECKLISTS (Gestão → Checklists)
- Criar do zero ("Novo checklist") ou **a partir de um modelo** pronto ("Usar um modelo" → escolher segmento → pré-visualizar → "Usar" → o modelo é copiado como rascunho na sua unidade para você ajustar e publicar). Os modelos são genéricos, criados pela CheckFlow. A cópia é **independente**: alterações no modelo original não afetam a sua cópia.
- **Só aparecem os checklists dos subgrupos a que você tem acesso.** Inativos não aparecem na lista.
- **Duplicar** (menu do item): copia o checklist como novo rascunho — pode ser para outra unidade/grupo/subgrupo. Leva junto seções, atividades, opções, motivos de não execução e catálogos. Ao duplicar para **outra unidade**, os catálogos usados são **recriados no cadastro de catálogos da unidade de destino** (o sistema avisa e pede confirmação).
- **Inativar** (menu do item): pede confirmação; o histórico é preservado. **Não é possível inativar um checklist vinculado a um workflow publicado** — o sistema informa o(s) workflow(s) e você precisa desvinculá-lo de lá (ou inativar o workflow) primeiro.
- Estrutura: um checklist tem **1 ou mais seções**, e cada seção **1 ou mais atividades**. Tipos de atividade: sim/não, número, texto, múltipla escolha, catálogo, foto, vídeo, assinatura, data/hora, localização.
- **Premissa ao montar uma atividade**: pense no **tipo de resposta** que você quer do operador, não na pergunta em si. Ex.: se a resposta deve ser "sim ou não", escolha o tipo **Sim/Não**; se for um valor numérico (temperatura, peso), escolha **Número**; se for escolher entre opções, **Múltipla escolha**; e assim por diante. O texto da pergunta vai no nome/descrição; o **tipo** define como o operador responde e como o sistema valida.
- **Pense também nas dependências entre campos**: uma atividade pode existir só para decidir o que aparece depois. A partir da resposta de uma atividade "pai" (Sim/Não ou Múltipla escolha), você exibe ou não atividades **dependentes**. Monte primeiro a pergunta que ramifica e depois pendure nela as atividades que só fazem sentido para cada resposta.
- **Atividades dependentes**: uma atividade pode aparecer só quando a resposta de outra (a "pai") for um valor específico. A atividade-pai precisa ser do tipo **sim/não** ou **múltipla escolha**.
- **Data/Hora**: na execução o campo já vem preenchido com o horário atual; o operador pode ajustar se precisar.
- **Texto com QR Code / Barcode**: a leitura por câmera só funciona no **app mobile**. No computador, o operador digita o valor manualmente.
- **Retomar uma execução pausada**: não há link manual — na Operação, aba Checklists, a execução aparece na seção **"Não finalizados"** no topo; clique em **"Continuar"** para retomar (as respostas voltam preenchidas).
- Cada atividade pode ser **obrigatória**, **crítica** (se reprovada, reprova o checklist) e **gerar plano de ação**. Atividades **dependentes** só aparecem quando a resposta da atividade "pai" é o valor configurado.
- **Tempo de guarda das mídias**: por quantos meses as **mídias** (fotos, vídeos, PDFs) das execuções ficam guardadas. Padrão **1 mês**; opções 1, 3, 6, 12, 24, 36, 48, 60 meses. Após o prazo, **só as mídias** são apagadas para liberar espaço — o registro da execução é sempre preservado. Quanto maior o prazo, maior o consumo da **cota de armazenamento do seu plano**.
- **Modo de execução**: "Pode continuar depois" (pausável) ou "Executar de uma vez".
- **Mídia (limites)**: fotos são comprimidas automaticamente ao capturar (para poupar armazenamento). Nas evidências de plano de ação você pode anexar **até 5 fotos** OU **um vídeo de até 10 segundos** (o vídeo para sozinho ao chegar nos 10s). Quanto mais mídia e maior o tempo de guarda, mais cota de armazenamento do plano é usada.
- Ciclo: **Rascunho** (editável, não aparece na Operação) → **Publicado** (aparece na Operação) → **Inativo** (some, sem apagar). Editar um checklist publicado exige clicar em "Liberar edição" e depois "Publicar" de novo (gera nova versão).
- **Todo checklist é associado a um subgrupo** (obrigatório ao publicar): é ele que define quem vê o checklist na Operação. O operador vê só os checklists dos subgrupos a que pertence; o administrador do sistema vê todos.

# LISTAS DE TAREFAS (Gestão → Tarefas)
- São listas de tarefas **pontuais** (mais simples que o checklist) distribuídas a um ou mais grupos/subgrupos — ex: uma campanha rápida que várias pessoas respondem.
- **Montar** (precisa de permissão): título + as tarefas (cada uma pode aceitar **observação**, **evidência** foto/vídeo e exigir **check-in** de localização). Defina até quando aceita respostas: por **data limite** e/ou **número de respostas** (encerra no que vier primeiro), e a **janela de edição** (por quantas horas, depois de aberta, a pessoa pode continuar editando). Opcional: **avisar por WhatsApp** ao publicar.
- **Responder** (Operação → aba **Tarefas**): cada pessoa abre sua própria resposta; marca cada tarefa como feita, adiciona observação/evidência e faz o check-in quando exigido. Aparece o prazo até o bloqueio da edição. (Se o GPS não estiver disponível, a tarefa conclui mesmo assim, registrada como "sem localização".)
- **Acompanhar**: na lista, o ícone de indicadores mostra quem respondeu e o progresso de cada um.
- Visibilidade igual à dos checklists: a pessoa só vê as listas dos seus grupos/subgrupos; o admin do sistema vê todas. As mídias contam na cota de armazenamento do plano.

# OPERAÇÃO (/operacao) — tela principal de execução
- Acesso: usuários com perfil de **Operação** (ou outro perfil que permita essa tela).
- O operador vê **apenas os checklists publicados dos subgrupos aos quais está associado**. Essa associação usuário↔subgrupo é feita em **Gestão → Grupos** (ao adicionar o usuário ao subgrupo). A unidade ativa vem da sessão (a tela em si não tem seletor de unidade).
- Ao tocar num checklist você está, na verdade, escolhendo um **modelo publicado**; o sistema cria uma **instância de execução** para você preencher.
- A tela tem **3 abas**:
  1. **Checklists** — lista por grupo/subgrupo, com seções no topo: **Não finalizados** (execuções em andamento do operador → Continuar ou Não executar com motivo), **Agendados pendentes**, e **Workflows em andamento** (mostra só os itens de workflow dos subgrupos do próprio usuário).
  2. **Histórico** — todas as execuções que o usuário fez: abrir a execução, ver status, ver planos de ação abertos e baixar o **PDF** da execução.
  3. **Documentos** — documentos da unidade/subgrupos (inclui a Consulta Inteligente).
- **Abrir Ticket** (botão flutuante): abre um **chamado avulso** para uma área específica, para não conformidades **fora do roteiro** dos checklists. Diferente do checklist (que é um roteiro fixo), o ticket pode ser aberto a qualquer momento — ex: uma máquina quebrou e não há checklist para isso → abre um ticket para o grupo de Manutenção.
- Resultado da execução: **aprovado** (tudo conforme) ou **reprovado** (qualquer atividade não conforme); ao concluir gera **PDF**. "Continuar depois" disponível se o checklist for pausável; para abandonar, "Não executar" com motivo (não há descarte livre, nem para admin).
- Execuções isoladas por unidade. Ao iniciar uma execução nova, se a empresa atingiu o **limite de execuções do plano**, a ação é bloqueada.
- **Não funciona offline** — requer conexão com a internet.

# AGENDAMENTOS (Gestão → Agendamentos) — como agendar um checklist
- É aqui que se **agenda a liberação automática e recorrente** de um checklist.
- Passo a passo: vá em Gestão → Agendamentos → criar um novo agendamento → escolha o checklist → defina a **recorrência** (a cada X horas/dias/meses) a partir de uma **data/hora de referência** → salve. O sistema dispara automaticamente nas datas previstas; o item aparece como pendência da unidade na Operação.
- Dá para ativar/pausar, **editar** e excluir agendamentos na própria tela.
- A pendência agendada de um checklist aparece na Operação **só para os operadores do subgrupo daquele checklist** (o admin vê todas).
- Se a data de referência estiver no passado, o sistema agenda para o **próximo horário futuro** (não recupera disparos perdidos). Criar/editar exige permissão de Agendamentos no perfil.

# TICKETS / CHAMADOS (Operação: "Abrir Ticket"; Gestão → Tickets)
- Qualquer usuário pode abrir um ticket. Grupo + subgrupo de destino **e categoria** são obrigatórios (há sempre a categoria padrão "Não informada").
- **Categorias** (Gestão → Tickets → Categorias): árvore de 2 níveis (categoria → subcategoria) por unidade, para classificar os chamados. Há uma categoria **padrão "Não informada"** (não editável/excluível). Quem **gerencia** categorias é quem tem essa função habilitada no perfil ("gerenciar categorias de tickets"). Excluir uma categoria a inativa — tickets antigos seguem com ela.
- Fluxo: aberto → (alguém do grupo/subgrupo de destino **assume** = em tratamento) → pode pedir informação ao abridor (aguardando informação) → o **responsável conclui** (corrigido / corrigido parcial / não corrigido). O **abridor é avisado e pode reabrir** se não concordar com o resultado. Cancelar/improcedente a qualquer momento. Cada passo exige observação.
- **Quem vê**: na listagem você vê os tickets dos **grupos/subgrupos a que pertence** (mais os que você mesmo abriu); o administrador vê todos.
- **Quem assume**: só quem é do **grupo/subgrupo de destino** do ticket pode assumir.
- **Transferir**: quem está tratando pode transferir o ticket para outro grupo/subgrupo da mesma unidade — ele volta a "aberto" sem responsável, para alguém do novo destino assumir.
- **SLA**: prazos por categoria + prioridade; semáforo verde/amarelo/vermelho. Pausa enquanto aguarda informação.

# PLANOS DE AÇÃO E MODERAÇÃO N1/N2 (Gestão → Planos de Ação)
- Um plano de ação é aberto automaticamente quando uma execução tem uma atividade **não conforme** que está marcada para "gerar plano de ação". Ele nasce no estado **Moderação N1**. (Por enquanto não há abertura manual — sem não conformidade não há plano.)
- **Quem vê na lista**: aparecem os planos que **você abriu** ou os dos **grupos/subgrupos a que você pertence** (o subgrupo é o do checklist que originou o plano). O administrador do sistema vê todos.
- **Ordenar a lista**: você pode listar "Mais antigos primeiro" (padrão) ou "Mais recentes primeiro".
- **N1 e N2 também executam checklists**, além de moderar — são níveis de moderação, não cargos exclusivos.
- **N1 e N2 são níveis (camadas) de moderação**, não pessoas fixas. Quem moderara depende da função do usuário: Operação, **Nível 1 (N1)** ou **Nível 2 (N2)**. O administrador equivale a N2.
- Estados do plano: **Moderação N1** → **Moderação N2** (se escalado) → **Corrigido** ou **Não corrigido** (terminais).
- O que cada um faz:
  1. **Moderação N1** (o moderador N1, ou N2/admin): pode "Marcar como corrigido", "Marcar como não corrigido" ou **"Enviar para N2"** (escalar quando precisa de uma instância superior).
  2. **Moderação N2** (só N2/admin): pode "Marcar como corrigido", "Marcar como não corrigido" ou **"Devolver para N1"**.
  3. Quando o plano está **Corrigido** ou **Não corrigido** (terminal), o N1 pode **"Reabrir"** (volta para Moderação N1) — inclusive um plano que o N2 havia fechado.
- **Sem N2 configurado**: o gestor do grupo deveria ser o N2. Se ninguém do subgrupo tiver a função N2, o botão "Enviar para N2" fica **desabilitado** com um aviso pedindo para configurar um N2.
- Cada ação exige **observação obrigatória** e aceita **evidências** (fotos/vídeos).
- Notificações (WhatsApp/Email, respeitando o turno): ao **abrir** avisa os **N1** do setor; ao **enviar para N2** avisa os **N2**; ao **devolver para N1** avisa os **N1**.

# GRUPOS E SUBGRUPOS (Gestão → Grupos)
- Representam as áreas/setores da unidade (ex: Manutenção, Limpeza, Produção) e seus subgrupos. Servem para direcionar checklists, tickets e planos de ação ao time certo. Os nomes dos níveis ("Grupo"/"Setor" etc.) podem ser personalizados em Formatação.
- **Quem vê o quê**: o usuário enxerga os checklists publicados dos subgrupos a que está associado. Esse vínculo é feito em Gestão → Grupos (ao adicionar/gerenciar o usuário, marcando os subgrupos).
- **Para adicionar alguém a um grupo, a pessoa precisa já estar cadastrada na empresa.** O cadastro do usuário é feito antes em Gestão → Acessos → Usuários; depois você o adiciona ao grupo.
- **Gerenciar usuários** (botão no card do grupo): por usuário você pode editar nome/telefone, escolher os subgrupos de acesso, reenviar a senha e remover do grupo. (Remover do grupo tira o acesso àquele grupo; não exclui o usuário do sistema.)
- **Funções por área** (botão "Funções" no subgrupo): definem o papel do usuário sobre os checklists daquela área:
  - **— (só visualiza)**: apenas vê.
  - **Operação**: executa os checklists.
  - **Nível 1**: executa e **modera** os planos de ação abertos por não conformidade — pode corrigir, não corrigir ou escalar para o Nível 2.
  - **Nível 2**: recebe os casos escalados pelo N1 — pode corrigir, não corrigir ou devolver para o N1; também atua como N1 e executa checklists.
  - Cada nível só é avisado (WhatsApp + e-mail) quando a ação é do seu nível.
- **Perfil público**: um perfil marcado como "público" pode ser atribuído por gestores de grupo/setor (ex: para cobrir uma liderança temporariamente). Perfis não-públicos só o Admin da empresa atribui. Por isso, ao editar um usuário pela tela de Grupos, só aparecem os perfis públicos.

# INDICADORES (Gestão → Indicadores)
- Painel da **unidade ativa** por período (24h/15d/30d), cobrindo: **Checklists** (Top 5 mais reprovados e Top 5 atividades não conformes), **Tickets** (em aberto/tratamento/críticos/finalizados + top categorias), **Planos de ação** (em moderação/N1/N2/corrigidos/não corrigidos) e **Tarefas** (listas ativas/respostas/% concluído). Troque a unidade no seletor do cabeçalho. Uma visão consolidada por empresa está planejada.

# CATÁLOGOS (Gestão → Configurações → Catálogos)
- Listas de itens reutilizáveis (equipamentos, produtos, locais) usadas em atividades do tipo "catálogo". Cada item tem um **campo-chave** (ex.: Código do Produto), até **4 atributos** e uma imagem. São **por unidade** (todos da unidade enxergam na operação).
- **Quem gerencia**: quem tem a permissão de catálogos (criar/editar/excluir), além do administrador. Criar/editar/duplicar/excluir pelos cartões da tela.
- **Valores**: podem ser cadastrados manualmente OU **importados de uma API externa** (aba "API": informe URL + headers, mapeie os campos e sincronize; aceita re-sincronização).
- **Duplicar** copia a estrutura **e todos os valores**.
- **Excluir** é bloqueado se algum **checklist ativo** estiver usando o catálogo — o sistema lista os checklists; remova a referência neles antes de excluir.

# PADRÕES DE VALIDAÇÃO (Gestão → Padrão)
- Permitem validar respostas numéricas conforme combinações de variáveis. Fluxo: primeiro cadastre as **Variáveis** (ex: tipo de caminhão, tipo de container) em Padrão → Variáveis; depois crie um **Padrão** em Padrão → Padrões combinando essas variáveis com os valores numéricos esperados. Usado para validação automática em atividades.

# DOCUMENTOS — suporte de conhecimento (cadastro em Gestão → Configurações → Documentos; uso na aba Documentos da Operação)
- Servem como apoio à operação. Três tipos:
  1. **POP (Procedimento Operacional Padrão)** e 2. **IT (Instrução de Trabalho)**: documentos de apoio organizados em **etapas**, cada etapa com **texto, imagens e vídeo**. O operador consulta na aba Documentos da Operação enquanto trabalha. As imagens aparecem em **carrossel quadrado** (uma por vez). O **vídeo** pode ser um link do **YouTube** ou do **Google Drive** (arquivo público).
- **Quem cadastra/edita documentos**: quem tem a **permissão de documentos** (criar/excluir) no seu perfil, além do administrador. As imagens das etapas **contam na cota de armazenamento** do plano.
  3. **Consulta Inteligente**: documento que o operador pode **perguntar em linguagem natural** — a IA responde com base no conteúdo do documento. É cadastrado em Gestão → Documentos como tipo "Consulta Inteligente"; o operador usa na Operação. ⚠️ **Depende de IA** — consome os **tokens de IA contratados no plano**; sem tokens disponíveis, não funciona. (O assistente de ajuda aqui NÃO consome esses tokens.)

# CAUSA RAIZ (Gestão → Configurações → Causa raiz)
- **Banco de causas raiz pré-vinculadas a um campo de checklist.** Cada causa raiz é cadastrada para uma atividade específica (cascata: Grupo → Subgrupo → Checklist → Campo) e só pode apontar para um campo **com validação** (que pode ser reprovado). Pode ter um documento de apoio (POP/IT) e observações.
- **Uso no plano de ação**: ao abrir/tratar um plano de ação de uma não conformidade, quem resolve (Nível 1/2) escolhe a causa raiz daquele campo a partir do banco — ou cria uma nova na hora — e pode anexar uma observação. Operador comum não vê essa seção.
- **Ocorrências ≠ banco**: cada escolha registra uma ocorrência. Na moderação do plano (Gestão → Planos de Ação) aparece a causa raiz do plano e a **recorrência do campo** (últimas ocorrências), ajudando a ver padrões.

# FORMATAÇÃO (Gestão → Configurações → Formatação)
- Personaliza a identidade visual: nomes dos níveis (Grupo/Setor), logo, cores e o layout dos relatórios em PDF.

# NOTIFICAÇÕES (Gestão → Configurações → Notificações)
- Edita os textos das mensagens enviadas por WhatsApp e e-mail para cada evento (tickets, planos de ação, reset de senha). Usa variáveis {{...}} para dados dinâmicos; cada canal pode ser ativado/desativado por tipo.

# TURNOS E PERFIS (Gestão → Acessos)
- **Turnos**: administrativo (horário fixo por dia da semana) ou escala (ciclo trabalho/folga, ex: 12x36). Cada turno tem um **modo do que acontece FORA do horário** (escolha única):
  - **Só bloquear notificação** (padrão): fora do turno não recebe WhatsApp de moderação; acessa o sistema normal. (e-mail continua)
  - **Bloquear login**: fora do turno não consegue entrar; quem já está logado continua. Admin de sistema e da empresa são isentos.
  - **Só avisar**: fora do turno mostra um aviso, mas não bloqueia nada.
  - Sem turno = nunca é restringido.
- **Perfis**: definem o que cada usuário vê/faz. Perfil "não público" só o Admin da empresa atribui; "público" pode ser atribuído por quem gerencia usuários do grupo. Não é possível remover o perfil de Admin do **último** administrador da empresa.

# USUÁRIOS E LOGIN (Gestão → Acessos → Usuários)
- Não há autocadastro: usuários são criados por admin/gestor (individual, em lote por CSV ou via API). **Login é por CPF**; CPF e telefone são obrigatórios. Recuperação/primeiro acesso por **código (OTP)** enviado por WhatsApp (e e-mail se houver).
- **Cadastrar usuário** (modal): informe nome, CPF (login), telefone (WhatsApp), e-mail (opcional), **perfil**, **turno** e **unidades de acesso**. Ao salvar, o usuário é criado, vinculado à empresa com o perfil escolhido e às unidades marcadas, e recebe o código de primeiro acesso. Sem perfil não é possível salvar.
- **Editar usuário**: dá para alterar nome/telefone/turno, trocar o **perfil** e ajustar as **unidades de acesso** (tudo persiste). O e-mail não é editável.
- **Ações na lista**: trocar perfil (atalho), "Login como" (só admin de sistema, entra como o usuário), inativar (perde acesso na hora) e resetar senha (envia código por WhatsApp — exige telefone).
- **Turno**: fora do turno o usuário não recebe mensagens de moderação por WhatsApp, mas continua podendo moderar pelo sistema.

# PLANO & ASSINATURA (Gestão → Plano — só o administrador da empresa)
- Mostra o **uso do período**: execuções/mês, tokens de IA/mês e armazenamento total, cada um com seu limite.
- Execuções e tokens **resetam a cada período mensal** (não acumulam — "use ou perde"). Armazenamento é **total** (não mensal); o tempo de guarda dos checklists é a alavanca de espaço.
- Ao **atingir um limite**, a ação é **bloqueada** (nova execução, Consulta IA ou upload) até fazer upgrade de plano ou **comprar um pacote adicional** (execuções, tokens ou armazenamento).
- **Assinar / trocar de plano**: a 1ª contratação de um plano pago é imediata (gera a fatura). Já a **troca entre planos pagos vale só no fim do período vigente** (sem cobrança proporcional) — até lá segue o plano atual.
- **Trial**: empresa nova começa em teste; quando o teste expira sem assinar um plano pago, cai automaticamente no **plano gratuito** (não bloqueia o acesso).
- Pagamento (PIX, boleto ou cartão) é concluído na fatura do gateway.

# PRIMEIROS PASSOS
- Empresa nova vê o card "Primeiros passos" na Home da gestão: configurar unidade, criar o 1º checklist (por um modelo), executar na Operação e convidar a equipe.

# MODELOS (gerar com IA — admin do sistema)
- O administrador do sistema pode criar modelos de checklist em /sistema/templates, inclusive **gerando com IA** (botão "Gerar com IA": descreve o objetivo + segmento, a IA monta um rascunho de seções/atividades para revisar e publicar). Os modelos publicados aparecem na galeria que as empresas usam.

# CENTRAL DE AJUDA
- Em Gestão → Central de ajuda há artigos e vídeos. Use também este assistente para dúvidas.
`.trim()

// ─── Provedores (texto puro) ────────────────────────────────────────────────
type Mensagem = { role: 'user' | 'assistant'; content: string }

async function gemini(apiKey: string, model: string, system: string, msgs: Mensagem[]): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const gen = genAI.getGenerativeModel({ model, systemInstruction: system })
  const result = await gen.generateContent({
    contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
  })
  return result.response.text()
}

async function anthropic(apiKey: string, model: string, system: string, msgs: Mensagem[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages: msgs }),
  })
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`)
  const json = await res.json()
  return json.content?.[0]?.text ?? ''
}

async function openaiCompat(baseUrl: string, apiKey: string, model: string, system: string, msgs: Mensagem[]): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...msgs] }),
  })
  if (!res.ok) throw new Error(`OpenAI-compat HTTP ${res.status}`)
  const json = await res.json()
  return json.choices?.[0]?.message?.content ?? ''
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })

  const ehChave = (k: string) => !!k && !k.startsWith('http')
  const keyUsada = [SUPABASE_SECRET, SUPABASE_PUBLISHABLE].find(ehChave) ?? ''
  const { data: { user } } = await createClient(SUPABASE_URL, keyUsada).auth.getUser(token)
  if (!user) return Response.json({ error: 'Sessão inválida' }, { status: 401 })

  let mensagens: Mensagem[]
  try {
    const body = await req.json()
    mensagens = (body.mensagens ?? []).slice(-8).filter((m: any) => m?.content?.trim())
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  if (!mensagens.length) return Response.json({ error: 'Nenhuma mensagem' }, { status: 400 })

  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET)

  // Base de conhecimento = manual + artigos publicados da Central de Ajuda
  let systemPrompt = MANUAL
  const { data: artigos } = await admin.from('ajuda_artigos')
    .select('categoria, titulo, conteudo, video_url')
    .eq('publicado', true).order('categoria').order('ordem')
  if (artigos?.length) {
    systemPrompt += '\n\n# ARTIGOS DA CENTRAL DE AJUDA\n' + artigos
      .map((a: any) => `## [${a.categoria}] ${a.titulo}\n${a.conteudo}${a.video_url ? `\n(vídeo: ${a.video_url})` : ''}`)
      .join('\n\n')
  }

  const { data: provDb } = await admin.from('ia_provedores')
    .select('provedor, api_key, modelo, base_url, ativo, ordem')
    .eq('ativo', true).order('ordem', { ascending: true })

  const cfg = new Map((provDb ?? []).map((p: any) => [p.provedor, p]))
  const k = (prov: string, env?: string) => cfg.get(prov)?.api_key || env
  const m = (prov: string, env: string | undefined, padrao: string) => cfg.get(prov)?.modelo || env || padrao

  const gMod = m('gemini', process.env.GEMINI_MODEL, 'gemini-2.5-flash')
  const aMod = m('anthropic', process.env.ANTHROPIC_MODEL, 'claude-3-5-haiku-20241022')
  const oMod = m('openai', process.env.OPENAI_MODEL, 'gpt-4o-mini')
  const grMod = m('groq', process.env.GROQ_MODEL, 'llama-3.1-8b-instant')

  const candidatos: { nome: string; modelo: string; run: () => Promise<string> }[] = []
  const gk = k('gemini', process.env.GEMINI_API_KEY)
  if (gk) candidatos.push({ nome: 'gemini', modelo: gMod, run: () => gemini(gk, gMod, systemPrompt, mensagens) })
  const ak = k('anthropic', process.env.ANTHROPIC_API_KEY)
  if (ak) candidatos.push({ nome: 'anthropic', modelo: aMod, run: () => anthropic(ak, aMod, systemPrompt, mensagens) })
  const ok = k('openai', process.env.OPENAI_API_KEY)
  if (ok) candidatos.push({ nome: 'openai', modelo: oMod, run: () => openaiCompat('https://api.openai.com/v1', ok, oMod, systemPrompt, mensagens) })
  const grk = k('groq', process.env.GROQ_API_KEY)
  if (grk) candidatos.push({ nome: 'groq', modelo: grMod, run: () => openaiCompat('https://api.groq.com/openai/v1', grk, grMod, systemPrompt, mensagens) })
  for (const cn of ['custom1', 'custom2']) {
    const ck = cfg.get(cn)?.api_key, cu = cfg.get(cn)?.base_url, cm = cfg.get(cn)?.modelo
    if (ck && cu && cm) candidatos.push({ nome: cn, modelo: cm, run: () => openaiCompat(cu, ck, cm, systemPrompt, mensagens) })
  }

  const ordem = (provDb ?? []).map((p: any) => p.provedor)
  candidatos.sort((a, b) => (ordem.indexOf(a.nome) === -1 ? 99 : ordem.indexOf(a.nome)) - (ordem.indexOf(b.nome) === -1 ? 99 : ordem.indexOf(b.nome)))

  if (!candidatos.length) {
    return Response.json({ resposta: 'O assistente de IA ainda não está configurado. Contate o administrador do sistema.' })
  }

  for (const c of candidatos) {
    try {
      const resposta = await c.run()
      if (resposta?.trim()) return Response.json({ resposta: resposta.trim() })
    } catch (e: any) {
      console.error(`[ajuda] provedor ${c.nome} falhou:`, e?.message)
      // registra a falha para o admin (failover) — fire-and-forget
      admin.from('ia_falhas').insert({ contexto: 'ajuda', provedor: c.nome, modelo: c.modelo, erro: String(e?.message ?? e).slice(0, 500) })
        .then(() => {}, () => {})
    }
  }
  return Response.json({ error: 'Não foi possível obter resposta no momento. Tente novamente.' }, { status: 502 })
}
