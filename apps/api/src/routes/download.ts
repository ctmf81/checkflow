import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs'

export async function downloadRoutes(app: FastifyInstance) {
  app.get('/api/download-app', async (request, reply) => {
    try {
      const appPath = path.join(process.cwd(), 'public', 'checkgo.apk')

      if (!fs.existsSync(appPath)) {
        return reply.status(404).send({ error: 'APK not found' })
      }

      const stream = fs.createReadStream(appPath)
      reply.type('application/vnd.android.package-archive').send(stream)
    } catch (error) {
      reply.status(500).send({ error: 'Download failed' })
    }
  })
}
