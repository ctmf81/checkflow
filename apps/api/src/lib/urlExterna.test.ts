import { describe, it, expect } from 'vitest'
import { ehIpPrivado } from './urlExterna'

describe('ehIpPrivado()', () => {
  it('IPv4 públicos → false', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '52.10.20.30', '200.147.0.1']) {
      expect(ehIpPrivado(ip)).toBe(false)
    }
  })
  it('IPv4 privados/loopback/link-local/metadata → true', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.255.255',
      '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
      expect(ehIpPrivado(ip)).toBe(true)
    }
  })
  it('172.15 e 172.32 são públicos (fora da faixa 16-31)', () => {
    expect(ehIpPrivado('172.15.0.1')).toBe(false)
    expect(ehIpPrivado('172.32.0.1')).toBe(false)
  })
  it('IPv6 loopback/link-local/ULA → true', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1']) {
      expect(ehIpPrivado(ip)).toBe(true)
    }
  })
  it('IPv6 público → false', () => {
    expect(ehIpPrivado('2606:4700:4700::1111')).toBe(false)
  })
  it('IPv4-mapped em IPv6 herda a classificação do IPv4', () => {
    expect(ehIpPrivado('::ffff:127.0.0.1')).toBe(true)
    expect(ehIpPrivado('::ffff:8.8.8.8')).toBe(false)
  })
  it('formato desconhecido → true (inseguro por padrão)', () => {
    expect(ehIpPrivado('nao-e-ip')).toBe(true)
  })
})
