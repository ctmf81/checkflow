FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* é "assada" no bundle durante `next build` — setar a variável só
# no runtime do Railway NÃO tem efeito. O Railway injeta as variáveis do serviço
# nos ARGs declarados abaixo (só existem no build). Assim cada ambiente assa os
# próprios valores; sem isso, o web-dev falaria com o banco de PRODUÇÃO.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY

# Antes do build, REMOVE do ambiente as NEXT_PUBLIC_* vazias (ARG não passado
# vira string vazia). Sem isso, `process.env.X === ""` e o `??` do código NÃO
# cairia no fallback — quebrando a build de PRODUÇÃO (que não seta esses ARGs).
# Removidas, ficam `undefined` → o fallback hardcoded de lib/supabase.ts vale,
# igual a hoje. As preenchidas (DEV) permanecem e são assadas.
# Cache bust: 2026-06-05
RUN for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_API_URL NEXT_PUBLIC_VAPID_PUBLIC_KEY; do \
      eval "val=\${$v}"; \
      if [ -z "$val" ]; then unset "$v"; fi; \
    done; \
    npm run build

EXPOSE 3000

CMD ["./node_modules/.bin/next", "start", "-p", "3000"]
