import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { healthRoutes } from './routes/health'
import { catalogoRoutes } from './routes/catalogos'
import { usuarioRoutes } from './routes/usuarios'
import { whatsappRoutes } from './routes/whatsapp'
import { planosAcaoRoutes } from './routes/planos-acao'
import { ticketsRoutes } from './routes/tickets'
import { parceiroRoutes } from './routes/parceiros'
import { avisosTrialRoutes } from './routes/avisos-trial'
import { avisosUsoRoutes } from './routes/avisos-uso'
import { agendamentosRoutes } from './routes/agendamentos'
import { limpezaRoutes } from './routes/limpeza'
import { billingRoutes } from './routes/billing'
import { tarefasRoutes } from './routes/tarefas'
import { pushRoutes } from './routes/push'
import { alertsRoutes } from './routes/alerts'
import { downloadRoutes } from './routes/download'
// import { sincronizacaoRoutes } from './routes/sincronizacao'

const app = Fastify({ logger: true })

// Serviços de cron (ex.: cron-job.org) batem em endpoints POST sem corpo, às
// vezes com um Content-Type que o Fastify não conhece → 415 Unsupported Media
// Type. Esses endpoints não leem o corpo, então aceitamos qualquer content-type
// não registrado ignorando o body. application/json segue com o parser padrão
// (webhook Asaas etc. não são afetados).
app.addContentTypeParser('*', (_req, _payload, done) => done(null, undefined))

app.register(helmet)
// Allowlist de origens — pentest (2026-06-08) detectou `origin: true`
// refletindo qualquer Origin (incluindo domínios arbitrários/maliciosos).
// Restrito às origens conhecidas do CheckFlow + dev local.
const allowedOrigins = [
  'https://app.checkflow.digital',                 // domínio de produção (PWA)
  'https://web-production-36880.up.railway.app',   // URL interna do Railway
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
app.register(ticketsRoutes)
app.register(parceiroRoutes)
app.register(avisosTrialRoutes)
app.register(avisosUsoRoutes)
app.register(agendamentosRoutes)
app.register(limpezaRoutes)
app.register(billingRoutes)
app.register(tarefasRoutes)
app.register(pushRoutes)
app.register(alertsRoutes)
app.register(downloadRoutes)
// app.register(sincronizacaoRoutes) // TODO: Fix TypeScript errors

const port = Number(process.env.PORT) || 3001

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
