import { lookup } from 'node:dns/promises'
import net from 'node:net'

// Guarda contra SSRF (espelha apps/api/src/lib/urlExterna.ts). Usado nas rotas
// de IA que fazem fetch de `ia_provedores.base_url` (provedores customizados
// OpenAI-compatible). Bloqueia loopback/redes privadas/link-local/metadata,
// inclusive quando um domínio resolve para IP interno (DNS rebinding).

/** True se o IP (v4/v6) está em faixa privada/loopback/link-local/reservada. */
export function ehIpPrivado(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0) return true
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
    return false
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase().replace(/^\[|\]$/g, '')
    if (low === '::1' || low === '::') return true
    if (low.startsWith('fe80')) return true
    if (low.startsWith('fc') || low.startsWith('fd')) return true
    const mapped = low.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return ehIpPrivado(mapped[1])
    return false
  }
  return true
}

/** Lança se a URL não for https pública (resolve DNS e valida todos os IPs). */
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
