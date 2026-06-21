/**
 * Testes do helper de detecção de admin (lib/admin.ts).
 *
 * Regra: admin de sistema vê tudo; admin da empresa (perfil ...002) tem as
 * mesmas funções porém restritas à sua empresa — então, dentro da empresa
 * ativa, também conta como "admin" para o bypass de visibilidade.
 */

import { describe, it, expect } from 'vitest'
import { ehAdminSistema, ehAdminDaEmpresa, PERFIL_ADMIN_EMPRESA } from '../../../lib/admin'

describe('ehAdminSistema()', () => {
  it('true quando role = admin_sistema', () => {
    expect(ehAdminSistema({ user_metadata: { role: 'admin_sistema' } })).toBe(true)
  })
  it('false para outros papéis / ausência', () => {
    expect(ehAdminSistema({ user_metadata: { role: 'operacao' } })).toBe(false)
    expect(ehAdminSistema(null)).toBe(false)
    expect(ehAdminSistema(undefined)).toBe(false)
    expect(ehAdminSistema({})).toBe(false)
  })
})

// Mock mínimo de SupabaseClient para ehAdminDaEmpresa
function mockSb(opts: {
  role?: string
  perfilId?: string | null
}): any {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.role !== undefined || opts.perfilId !== undefined
        ? { id: 'u1', user_metadata: { role: opts.role } }
        : null } }),
    },
    from() {
      return {
        select() { return this },
        eq() { return this },
        async maybeSingle() { return { data: opts.perfilId ? { perfil_id: opts.perfilId } : null } },
      }
    },
  }
}

describe('ehAdminDaEmpresa()', () => {
  it('admin de sistema → true independente da empresa', async () => {
    const sb = mockSb({ role: 'admin_sistema' })
    expect(await ehAdminDaEmpresa(sb, 'emp-1')).toBe(true)
    expect(await ehAdminDaEmpresa(sb, null)).toBe(true)
  })

  it('admin da empresa (perfil ...002) → true para a empresa', async () => {
    const sb = mockSb({ role: 'operacao', perfilId: PERFIL_ADMIN_EMPRESA })
    expect(await ehAdminDaEmpresa(sb, 'emp-1')).toBe(true)
  })

  it('membro comum (outro perfil) → false', async () => {
    const sb = mockSb({ role: 'operacao', perfilId: '00000000-0000-0000-0000-000000000003' })
    expect(await ehAdminDaEmpresa(sb, 'emp-1')).toBe(false)
  })

  it('sem empresaId e não-admin-sistema → false', async () => {
    const sb = mockSb({ role: 'operacao', perfilId: PERFIL_ADMIN_EMPRESA })
    expect(await ehAdminDaEmpresa(sb, null)).toBe(false)
  })

  it('sem usuário logado → false', async () => {
    const sb = mockSb({})
    expect(await ehAdminDaEmpresa(sb, 'emp-1')).toBe(false)
  })
})
