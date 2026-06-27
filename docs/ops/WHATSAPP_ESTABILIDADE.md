# WhatsApp (Evolution/Baileys) — Estabilidade e Monitoramento

> O WhatsApp do CheckFlow usa a **Evolution API (Baileys, não oficial)**. É instável por
> natureza: a sessão pode "cair" (container reinicia, logout) ou ficar **zumbi**
> (mostra `open` mas mensagens travam em `PENDING`). Este runbook reduz o risco em camadas.

---

## 1. Detecção automática (healthcheck) — JÁ IMPLEMENTADO
Endpoint na API: `POST /cron/whatsapp/health` (protegido por `x-cron-secret`).
- Checa o estado da Evolution (`/instance/connectionState`).
- Na **mudança de estado** cria um alerta em `/sistema/alertas` **e** envia e-mail ao admin.
- Anti-spam: só avisa quando o estado muda (caiu / voltou), não a cada checagem.

**Configurar o gatilho (cron-job.org):**
1. Novo job: `POST https://api-production-5bce.up.railway.app/cron/whatsapp/health`
2. Header: `x-cron-secret: <CRON_SECRET>` (mesmo valor do Railway, serviço API)
3. Frequência: a cada **15 min**.

**Env nova (serviço API no Railway):**
- `ALERT_EMAIL` = e-mail que recebe os avisos de queda/retorno. Sem ele, o alerta só aparece no painel (sem e-mail).

⚠️ **Limitação:** o healthcheck detecta **desconexão** (estado != `open`), que cobre o caso mais comum (restart/logout). **Não** detecta a "sessão zumbi" (open mas sem entregar) — para isso, a longo prazo, a solução é a API oficial (item 4).

---

## 2. Estabilizar a sessão (Redis) — AÇÃO DE CONFIG NO RAILWAY
A causa mais comum do "zumbi após restart" é a sessão não persistir. Ativar Redis resolve a maior parte:
1. No projeto Railway: **Add Service → Database → Redis**.
2. No serviço **Evolution API**, adicionar variáveis de ambiente:
   - `CACHE_REDIS_ENABLED=true`
   - `CACHE_REDIS_URI` = a URL do Redis (use a interna do Railway: `${{Redis.REDIS_PRIVATE_URL}}` ou `${{Redis.REDIS_URL}}` — `redis.railway.internal:6379`)
   - `CACHE_REDIS_PREFIX_KEY=checkflow`
   - **`CACHE_REDIS_SAVE_INSTANCES=true`** ← essencial: é o que **persiste a sessão** no Redis (sem ela, Redis é só cache e a sessão ainda se perde no restart)
   - (opcional) `CACHE_LOCAL_ENABLED=false` — usa só o Redis, evita conflito de cache
3. **Redeploy** da Evolution e **reconecte o QR** uma vez (Sistema → WhatsApp).
4. Validar: na tela do Redis (Database → Data), devem aparecer **chaves com prefixo `checkflow`** após reconectar.

Também: manter o container **sempre ligado** (sem sleep) e a **imagem da Evolution atualizada**.

---

## 3. Fallback por e-mail — JÁ ATIVO
O envio de código (`/whatsapp/enviar-codigo`) dispara **WhatsApp e e-mail em paralelo**.
Quem tem e-mail cadastrado recebe o código por e-mail mesmo se o WhatsApp falhar.
- O pré-cadastro e a criação de usuário **recomendam** preencher o e-mail por isso.
- A flag `codigoEnviado` (retornada por `enviarCodigoUsuario`) considera sucesso se **WhatsApp OU e-mail** entregou — então um WhatsApp fora não gera falso alarme se o e-mail saiu.

⚠️ Para usuários **sem e-mail**, o WhatsApp é o único canal (sem fallback). Incentive o cadastro de e-mail.

---

## 4. Solução definitiva (quando o volume justificar)
Migrar do Baileys para a **WhatsApp Cloud API oficial** (Meta direto ou via BSP — Twilio/360dialog):
sessão gerenciada pela Meta (sem QR/sessão para babá), **confirmação de entrega**, sem risco de ban.
Custo por mensagem/conversa + verificação do negócio.

---

## Procedimento de reconexão (quando cair)
1. **Sistema → WhatsApp** → "Trocar número / Desconectar".
2. Escanear o **QR** novamente com o WhatsApp do número.
3. Validar: `POST /whatsapp/status` (body `{}`) deve retornar `conectado: true`.
4. Reenviar códigos pendentes pela tela de **Usuários → Resetar senha** (ícone de chave).
