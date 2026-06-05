FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Cache bust: 2026-06-05
RUN npm run build

EXPOSE 3000

CMD ["./node_modules/.bin/next", "start", "-p", "3000"]
