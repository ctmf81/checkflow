// Descoberta ONVIF (WS-Discovery) — o agente encontra câmeras/DVR na rede SEM senha.
// 1º passo do fluxo: identificar os dispositivos antes de pedir credenciais.
const onvif = require('onvif')

const achados = []
onvif.Discovery.on('device', (cam, rinfo, xml) => {
  const ip = rinfo && rinfo.address ? rinfo.address : (cam && cam.hostname) || '?'
  // nome/modelo vem dos "scopes" da resposta de discovery
  let nome = ''
  const scopes = (cam && (cam.scopes || cam.profiles)) || []
  const txt = Array.isArray(scopes) ? scopes.join(' ') : String(xml || '')
  const mName = txt.match(/name\/([^\s<]+)/i); if (mName) nome = decodeURIComponent(mName[1])
  const mHw = txt.match(/hardware\/([^\s<]+)/i); const hw = mHw ? decodeURIComponent(mHw[1]) : ''
  const xaddr = (cam && (Array.isArray(cam.xaddrs) ? cam.xaddrs[0] : cam.xaddrs)) || ''
  achados.push({ ip, nome, hw, xaddr: String(xaddr) })
})

console.log('procurando dispositivos ONVIF na rede (6s)...')
onvif.Discovery.probe({ timeout: 6000, resolve: false }, () => {
  const uniq = {}; achados.forEach(a => { uniq[a.ip] = a })
  const arr = Object.values(uniq)
  console.log(`\n=== ONVIF encontrados: ${arr.length} ===`)
  arr.forEach(d => console.log(`  IP ${d.ip}  |  ${d.nome} ${d.hw}  |  ${d.xaddr}`))
  if (!arr.length) console.log('  (nenhum)')
  process.exit(0)
})
setTimeout(() => process.exit(0), 9000)
