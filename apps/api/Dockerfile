FROM node:20-alpine

WORKDIR /app

# Copia apenas os arquivos do api (root directory = apps/api no Railway)
COPY package*.json ./

# Instala todas as dependências (incluindo devDependencies para o build)
RUN npm install

# Copia o código fonte
COPY . .

# Compila TypeScript
RUN npm run build

# Remove devDependencies após o build
RUN npm prune --production

EXPOSE 3001

CMD ["node", "dist/server.js"]
