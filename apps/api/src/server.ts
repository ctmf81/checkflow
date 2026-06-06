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
app.register(cors, {
  origin: true, // permite qualquer origem — restringir após confirmar funcionamento
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
