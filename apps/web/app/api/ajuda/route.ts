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
- Criar do zero ("Novo checklist") ou **a partir de um modelo** pronto ("Usar um modelo" → escolher segmento → pré-visualizar → "Usar" → o modelo é copiado como rascunho na sua unidade para você ajustar e publicar).
- Estrutura: seções e atividades. Tipos de atividade: sim/não, número, texto, múltipla escolha, catálogo, foto, vídeo, assinatura, data/hora, localização.
- Cada atividade pode ser **obrigatória**, **crítica** (se reprovada, reprova o checklist) e **gerar plano de ação**. Atividades **dependentes** só aparecem quando a resposta da atividade "pai" é o valor configurado.
- **Tempo de guarda**: por quantos meses as execuções (e fotos/vídeos) ficam guardadas antes de poderem ser limpas. Padrão 12 meses; opções 1 a 64.
- **Modo de execução**: "Pode continuar depois" (pausável) ou "Executar de uma vez".
- Ciclo: **Rascunho** (editável, não aparece na Operação) → **Publicado** (aparece na Operação) → **Inativo** (some, sem apagar). Editar um checklist publicado exige clicar em "Liberar edição" e depois "Publicar" de novo (gera nova versão).

# EXECUÇÃO (Operação)
- O operador escolhe o checklist e responde as atividades. O resultado é **aprovado** (tudo conforme) ou **reprovado** (qualquer atividade não conforme). Ao concluir, gera um **PDF**.
- Se o checklist permite, há "Continuar depois" (salva o progresso parcial; aparece em "Não finalizados" no topo, com "Continuar"). Não há descarte livre: para abandonar, usa-se "Não executar" e escolhe-se um **motivo** (cadastrado no checklist) — fica registrado como "não executado".
- Execuções são isoladas por unidade.

# AGENDAMENTOS (Gestão → Agendamentos) — como agendar um checklist
- É aqui que se **agenda a liberação automática e recorrente** de um checklist (ou workflow).
- Passo a passo: vá em Gestão → Agendamentos → criar um novo agendamento → escolha o checklist (ou workflow) → defina a **recorrência** (a cada X horas/dias/meses) a partir de uma **data/hora de referência** → salve. O sistema dispara automaticamente nas datas previstas; o item aparece como pendência da unidade na Operação.
- Dá para ativar/pausar e excluir agendamentos na própria tela.

# WORKFLOWS (Gestão → Workflows)
- Encadeiam checklists em **estágios sequenciais** (com execução paralela dentro de cada estágio). A condição para avançar um estágio pode ser: todos aprovados, todos concluídos, ou qualquer um aprovado. Itens de workflow liberados aparecem em "Workflows em andamento" na Operação.

# TICKETS / CHAMADOS (Operação: "Abrir Ticket"; Gestão → Tickets)
- Qualquer usuário pode abrir um ticket. Grupo + setor de destino são obrigatórios; categoria é opcional.
- Fluxo: aberto → (alguém do grupo/setor **assume** = em tratamento) → pode pedir informação ao abridor (aguardando informação) → propõe conclusão (aguardando validação) → o abridor valida (corrigido / não corrigido / parcial) ou reabre. Cancelar/improcedente a qualquer momento. Cada passo exige observação.
- **Visibilidade**: enquanto sem responsável, todos da unidade veem; ao ser assumido, fica visível só para quem assumiu, quem abriu e o admin (some para os demais).
- **Transferir**: quem está tratando pode transferir o ticket para outro grupo/setor da mesma unidade — ele volta a "aberto" sem responsável, para alguém do novo destino assumir.
- **SLA**: prazos por categoria + prioridade; semáforo verde/amarelo/vermelho. Pausa enquanto aguarda informação.

# PLANOS DE AÇÃO E MODERAÇÃO N1/N2 (Gestão → Planos de Ação)
- Um plano de ação é aberto automaticamente quando uma execução tem uma atividade **não conforme** que está marcada para "gerar plano de ação". Ele nasce no estado **Moderação N1**.
- **N1 e N2 são níveis (camadas) de moderação**, não pessoas fixas. Quem moderara depende da função do usuário: Operação, **Nível 1 (N1)** ou **Nível 2 (N2)**. O administrador equivale a N2.
- Estados do plano: **Moderação N1** → **Moderação N2** (se escalado) → **Corrigido** ou **Não corrigido** (terminais).
- O que cada um faz:
  1. **Moderação N1** (o moderador N1, ou N2/admin): pode "Marcar como corrigido", "Marcar como não corrigido" ou **"Enviar para N2"** (escalar quando precisa de uma instância superior).
  2. **Moderação N2** (só N2/admin): pode "Marcar como corrigido", "Marcar como não corrigido" ou **"Devolver para N1"**.
  3. Quando o plano está **Corrigido** ou **Não corrigido** (terminal), o N1 pode **"Reabrir"** (volta para Moderação N1).
- Cada ação exige **observação obrigatória** e aceita **evidências** (fotos/vídeos).
- Notificações: ao abrir o plano, avisa os moderadores **N1** do setor; ao enviar para N2, avisa os **N2** (por WhatsApp, respeitando o turno do usuário).
- Acompanhamento de prazo (SLA) e semáforo na lista de planos de ação.

# GRUPOS E SUBGRUPOS (Gestão → Grupos)
- Representam as áreas/setores da unidade (ex: Manutenção, Limpeza, Produção) e seus subgrupos. Servem para direcionar checklists, tickets e planos de ação ao time certo. Os nomes dos níveis ("Grupo"/"Setor" etc.) podem ser personalizados em Formatação.

# INDICADORES (Gestão → Indicadores)
- Painel com gráficos e métricas consolidadas: execuções, índice de conformidade, planos de ação e tickets por período. Use os filtros (unidade, grupo, período) para analisar.

# CATÁLOGOS (Gestão → Configurações → Catálogos)
- Listas de itens reutilizáveis (equipamentos, produtos, locais) usadas em atividades do tipo "catálogo". Cada item pode ter atributos e imagem.

# PADRÕES DE VALIDAÇÃO (Gestão → Padrão)
- Permitem validar respostas numéricas conforme combinações de variáveis. Fluxo: primeiro cadastre as **Variáveis** (ex: tipo de caminhão, tipo de container) em Padrão → Variáveis; depois crie um **Padrão** em Padrão → Padrões combinando essas variáveis com os valores numéricos esperados. Usado para validação automática em atividades.

# DOCUMENTOS E CONSULTA INTELIGENTE (Gestão → Configurações → Documentos)
- Biblioteca de documentos da unidade. Tipos: **POP**, **IT** (referência/consulta) e **Consulta Inteligente**.
- **Consulta Inteligente**: você anexa um documento (ex: PDF de norma/procedimento) e pode **fazer perguntas em linguagem natural sobre ele** — a IA responde com base no conteúdo do arquivo. (Esse recurso de IA consome tokens do plano; o assistente de ajuda aqui não.)

# CAUSA RAIZ (Gestão → Configurações → Causa raiz)
- Cadastro das causas raiz padrão usadas ao tratar planos de ação, ajudando a identificar problemas recorrentes nos indicadores.

# FORMATAÇÃO (Gestão → Configurações → Formatação)
- Personaliza a identidade visual: nomes dos níveis (Grupo/Setor), logo, cores e o layout dos relatórios em PDF.

# NOTIFICAÇÕES (Gestão → Configurações → Notificações)
- Edita os textos das mensagens enviadas por WhatsApp e e-mail para cada evento (tickets, planos de ação, reset de senha). Usa variáveis {{...}} para dados dinâmicos; cada canal pode ser ativado/desativado por tipo.

# TURNOS E PERFIS (Gestão → Acessos)
- **Turnos**: administrativo (horário fixo por dia da semana) ou escala (ciclo trabalho/folga, ex: 12x36). Efeito único: fora do turno, o usuário não recebe notificação de moderação por **WhatsApp** (e-mail continua; o acesso e a moderação seguem normais a qualquer hora). Sem turno = recebe sempre.
- **Perfis**: definem o que cada usuário vê/faz. Perfil "não público" só o Admin da empresa atribui; "público" pode ser atribuído por quem gerencia usuários do grupo. Não é possível remover o perfil de Admin do **último** administrador da empresa.

# USUÁRIOS E LOGIN
- Não há autocadastro: usuários são criados por admin/gestor (individual, em lote por CSV ou via API). **Login é por CPF**; CPF e telefone são obrigatórios. Recuperação/primeiro acesso por **código (OTP)** enviado por WhatsApp (e e-mail se houver).

# PLANO & ASSINATURA (Gestão → Plano — só o administrador da empresa)
- Mostra o **uso do período**: execuções/mês, tokens de IA/mês e armazenamento total, cada um com seu limite.
- Execuções e tokens **resetam a cada período mensal** (não acumulam — "use ou perde"). Armazenamento é **total** (não mensal); o tempo de guarda dos checklists é a alavanca de espaço.
- Ao **atingir um limite**, a ação é **bloqueada** (nova execução, Consulta IA ou upload) até fazer upgrade de plano ou **comprar um pacote adicional** (execuções, tokens ou armazenamento).
- **Assinar / trocar de plano**: a 1ª contratação de um plano pago é imediata (gera a fatura). Já a **troca entre planos pagos vale só no fim do período vigente** (sem cobrança proporcional) — até lá segue o plano atual.
- **Trial**: empresa nova começa em teste; quando o teste expira sem assinar um plano pago, cai automaticamente no **plano gratuito** (não bloqueia o acesso).
- Pagamento (PIX, boleto ou cartão) é concluído na fatura do gateway.

# PRIMEIROS PASSOS
- Empresa nova vê o card "Primeiros passos" na Home da gestão: configurar unidade, criar o 1º checklist (por um modelo), executar na Operação e convidar a equipe.

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
