// PAINEL do agente (protótipo) — tela local que descobre dispositivos ONVIF,
// mostra o STATUS de cada um e PEDE o que falta (credenciais). Ao validar,
// tenta pegar um snapshot real e mostra a foto.
// Rodar: node painel.cjs  → abrir http://localhost:4100
const http = require('http')
const onvif = require('onvif')
const { execFileSync } = require('child_process')
const fs = require('fs'); const os = require('os'); const path = require('path')

const PORT = 4100
const snaps = path.join(__dirname, 'snaps'); fs.mkdirSync(snaps, { recursive: true })
const arq = ip => path.join(snaps, ip.replace(/[.:]/g, '_') + '.jpg')

function descobrir() {
  return new Promise(resolve => {
    const found = new Set()
    const h = (cam, rinfo) => { if (rinfo && rinfo.address) found.add(rinfo.address) }
    onvif.Discovery.on('device', h)
    try {
      onvif.Discovery.probe({ timeout: 5000, resolve: false }, () => {
        onvif.Discovery.removeListener('device', h); resolve([...found])
      })
    } catch (e) { onvif.Discovery.removeListener('device', h); resolve([...found]) }
  })
}

function validar(ip, user, senha, porta) {
  return new Promise(resolve => {
    const g = setTimeout(() => resolve({ ok: false, erro: 'tempo esgotado' }), 20000)
    try {
      new onvif.Cam({ hostname: ip, username: user, password: senha, port: porta || 80, timeout: 15000 }, function (err) {
        if (err) { clearTimeout(g); return resolve({ ok: false, erro: traduz(err.message) }) }
        const info = this.deviceInformation || {}
        this.getSnapshotUri({}, (err, res) => {
          if (err) { clearTimeout(g); return resolve({ ok: false, erro: traduz(err.message) }) }
          clearTimeout(g)
          try {
            execFileSync('curl.exe', ['-s', '--max-time', '12', '--digest', '-u', `${user}:${senha}`, res.uri, '-o', arq(ip)], { stdio: 'ignore' })
            const b = fs.readFileSync(arq(ip))
            if (b[0] === 0xFF && b[1] === 0xD8) resolve({ ok: true, modelo: `${info.manufacturer || ''} ${info.model || ''}`.trim() })
            else resolve({ ok: false, erro: 'snapshot inválido' })
          } catch (e) { resolve({ ok: false, erro: 'falha ao baixar a imagem' }) }
        })
      })
    } catch (e) { clearTimeout(g); resolve({ ok: false, erro: e.message }) }
  })
}
function traduz(m) {
  if (/not authorized|authorization/i.test(m)) return 'credencial não autorizada'
  if (/timeout|ETIMEDOUT|EHOSTUNREACH/i.test(m)) return 'sem resposta (timeout)'
  return m
}

function corpo(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)) }) }

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`)
  if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(HTML) }
  if (u.pathname === '/descobrir') { const d = await descobrir(); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(d)) }
  if (u.pathname === '/validar' && req.method === 'POST') {
    const { ip, user, senha, porta } = JSON.parse(await corpo(req) || '{}')
    const r = await validar(ip, user, senha, porta)
    res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(r))
  }
  if (u.pathname === '/foto') { const f = arq(u.searchParams.get('ip') || ''); if (fs.existsSync(f)) { res.setHeader('Content-Type', 'image/jpeg'); return res.end(fs.readFileSync(f)) } res.statusCode = 404; return res.end() }
  res.statusCode = 404; res.end()
}).listen(PORT, () => console.log(`Painel do agente: http://localhost:${PORT}`))

const HTML = `<!doctype html><html lang=pt><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Agente — Dispositivos</title><style>
*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Arial;margin:0;background:#0f172a;color:#e2e8f0}
header{padding:20px 24px;background:#1e293b;display:flex;align-items:center;gap:16px}
h1{font-size:18px;margin:0}button{cursor:pointer;border:0;border-radius:8px;padding:9px 14px;font-weight:600}
.primario{background:#f97316;color:#fff}.sec{background:#334155;color:#e2e8f0}
main{padding:24px;max-width:900px;margin:0 auto}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:12px;display:flex;gap:16px;align-items:center}
.ip{font-weight:700;font-size:15px}.badge{font-size:12px;padding:3px 8px;border-radius:999px;font-weight:600}
.b-desc{background:#334155;color:#cbd5e1}.b-val{background:#166534;color:#dcfce7}.b-erro{background:#7f1d1d;color:#fee2e2}.b-load{background:#78350f;color:#fed7aa}
input{background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:7px;padding:7px 9px;width:110px}
.thumb{width:96px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #334155}
.msg{color:#94a3b8;font-size:13px}.grow{flex:1}.linha{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
</style></head><body>
<header><h1>🎥 Agente — Dispositivos na rede</h1><button class=primario onclick=descobrir()>Procurar dispositivos</button><span id=st class=msg></span></header>
<main id=lista><p class=msg>Clique em "Procurar dispositivos" para o agente varrer a rede.</p></main>
<script>
const lista=document.getElementById('lista'), st=document.getElementById('st')
async function descobrir(){
  st.textContent='procurando...'; lista.innerHTML=''
  const ips=await (await fetch('/descobrir')).json()
  st.textContent=ips.length+' dispositivo(s) encontrado(s)'
  if(!ips.length){lista.innerHTML='<p class=msg>Nenhum dispositivo ONVIF respondeu.</p>';return}
  lista.innerHTML=ips.map(ip=>card(ip)).join('')
}
function card(ip){return \`<div class=card id="c-\${ip.replace(/\\./g,'_')}">
  <div class=grow><div class=ip>\${ip} <span class="badge b-desc">descoberto</span></div>
  <div class=linha style="margin-top:8px">
    <input placeholder=usuário value=admin id="u-\${ip}"><input placeholder=senha type=password id="s-\${ip}">
    <button class=sec onclick="validar('\${ip}')">Validar</button>
    <span class=msg id="m-\${ip}"></span></div></div>
  <img class=thumb id="f-\${ip}" style="display:none"></div>\`}
async function validar(ip){
  const el=id=>document.getElementById(id.replace(/\\./g,'_')||id)
  const c=document.getElementById('c-'+ip.replace(/\\./g,'_'))
  const badge=c.querySelector('.badge'); badge.className='badge b-load'; badge.textContent='validando...'
  document.getElementById('m-'+ip).textContent=''
  const body=JSON.stringify({ip,user:document.getElementById('u-'+ip).value,senha:document.getElementById('s-'+ip).value})
  const r=await (await fetch('/validar',{method:'POST',headers:{'Content-Type':'application/json'},body})).json()
  if(r.ok){badge.className='badge b-val';badge.textContent='✅ ativo';document.getElementById('m-'+ip).textContent=r.modelo||'';
    const img=document.getElementById('f-'+ip);img.src='/foto?ip='+ip+'&t='+Date.now();img.style.display='block'}
  else{badge.className='badge b-erro';badge.textContent='❌ falhou';document.getElementById('m-'+ip).textContent=r.erro||''}
}
</script></body></html>`
