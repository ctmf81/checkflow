import { lookup } from 'node:dns/promises'
import net from 'node:net'

// Guarda contra SSRF: valida que uma URL vinda de dados (ex.: importacao_api_url
// configurada pela empresa) aponta para um host público — bloqueia loopback,
// redes privadas, link-local e o endpoint de metadata de nuvem (169.254.169.254),
// inclusive quando um domínio resolve para um IP interno (DNS rebinding).

/** True se o IP (v4/v6) está em faixa privada/loopback/link-local/reservada. */
export function ehIpPrivado(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0) return true                       // "this host"
    if (a === 10) return true                      // 10/8 privada
    if (a === 127) return true                     // loopback
    if (a === 169 && b === 254) return true        // link-local + metadata cloud
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12 privada
    if (a === 192 && b === 168) return true        // 192.168/16 privada
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 CGNAT
    if (a >= 224) return true                       // multicast/reservado
    return false
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase().replace(/^\[|\]$/g, '')
    if (low === '::1' || low === '::') return true // loopback / unspecified
    if (low.startsWith('fe80')) return true        // link-local
    if (low.startsWith('fc') || low.startsWith('fd')) return true // ULA (fc00::/7)
    const mapped = low.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/) // IPv4-mapped
    if (mapped) return ehIpPrivado(mapped[1])
    return false
  }
  return true // formato desconhecido = trata como inseguro
}

/**
 * Lança se `urlStr` não for uma URL https pública. Resolve o DNS e rejeita se
 * QUALQUER endereço resolvido for interno (anti-rebinding). Chame antes de todo
 * fetch de URL vinda de dados/config.
 */
export async function assertUrlPublica(urlStr: string | null | undefined): Promise<void> {
  if (!urlStr) throw new Error('URL ausente')
  let u: URL
  try { u = new URL(urlStr) } catch { throw new Error('URL inválida') }
  if (u.protocol !== 'https:') throw new Error('URL deve usar https')

  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && ehIpPrivado(host)) throw new Error('URL aponta para IP interno')

  let addrs: { address: string }[]
  try { addrs = await lookup(host, { all: true }) } catch { throw new Error('host não resolvível') }
  if (!addrs.length) throw new Error('host não resolvível')
  for (const { address } of addrs) {
    if (ehIpPrivado(address)) throw new Error('host resolve para IP interno')
  }
}
