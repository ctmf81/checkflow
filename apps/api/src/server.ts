import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { healthRoutes } from './routes/health'
import { catalogoRoutes } from './routes/catalogos'
import { usuarioRoutes } from './routes/usuarios'
import { whatsappRoutes } from './routes/whatsapp'
import { planosAcaoRoutes } from './routes/planos-acao'

const app = Fastify({ logger: true })

app.register(helmet)
// Allowlist de origens — pentest (2026-06-08) detectou `origin: true`
// refletindo qualquer Origin (incluindo domínios arbitrários/maliciosos).
// Restrito às origens conhecidas do CheckFlow + dev local.
const allowedOrigins = [
  'https://web-production-36880.up.railway.app',
  'http://localhost:3000',
  ...(process.env.CORS_EXTRA_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? []),
]
app.register(cors, {
  origin(origin, cb) {
    // requests sem Origin (curl, server-to-server, health checks) são permitidas
    if (!origin || allowedOrigins.includes(origin)) cb(null, true)
    else cb(new Error('Origin não permitida pelo CORS'), false)
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})

app.register(healthRoutes)
app.register(catalogoRoutes)
app.register(usuarioRoutes)
app.register(whatsappRoutes)
app.register(planosAcaoRoutes)

const port = Number(process.env.PORT) || 3001

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
