// ONVIF real: conecta, descobre a URL de snapshot (GetSnapshotUri) e baixa a foto.
// É assim que o produto vai capturar de câmera/DVR ONVIF — sem adivinhar caminho.
// uso: node onvif-snap.cjs <ip> <user> <senha> [porta]
const onvif = require('onvif')
const { execFileSync } = require('child_process')
const { existsSync, statSync, readFileSync } = require('fs')
const { join } = require('path')
const os = require('os')

const [ip, user, pass, portaArg] = process.argv.slice(2)
const porta = portaArg ? Number(portaArg) : 80
const out = join(os.homedir(), 'Desktop', 'FOTO-iM3.jpg')

const guarda = setTimeout(() => { console.log('TIMEOUT: ONVIF não respondeu em 25s'); process.exit(1) }, 25000)

new onvif.Cam({ hostname: ip, username: user, password: pass, port: porta, timeout: 20000 }, function (err) {
  if (err) { clearTimeout(guarda); console.log('ERRO ao conectar ONVIF:', err.message); process.exit(1) }
  const info = this.deviceInformation || {}
  console.log(`conectado ONVIF → ${info.manufacturer || '?'} ${info.model || ''}`)
  this.getSnapshotUri({}, (err, res) => {
    if (err) { clearTimeout(guarda); console.log('ERRO getSnapshotUri:', err.message); process.exit(1) }
    console.log('URL de snapshot:', res.uri)
    clearTimeout(guarda)
    try {
      // baixa com autenticação digest (curl do Windows)
      execFileSync('curl.exe', ['-s', '--max-time', '12', '--digest', '-u', `${user}:${pass}`, res.uri, '-o', out], { stdio: 'ignore' })
      if (existsSync(out) && statSync(out).size > 500) {
        const b = readFileSync(out)
        const jpg = b[0] === 0xFF && b[1] === 0xD8
        console.log(`baixado: ${b.length} bytes ${jpg ? '(JPEG válido ✅)' : '(não-JPEG)'} → ${out}`)
        process.exit(jpg ? 0 : 2)
      } else { console.log('baixou vazio/erro'); process.exit(2) }
    } catch (e) { console.log('ERRO ao baixar:', e.message); process.exit(2) }
  })
})
