/**
 * Testes unitários das regras de negócio de Tickets (lib/tickets.ts).
 *
 * Cobre as três regras puras que governam o fluxo de tickets:
 *   1) ticketVisivel()    — visibilidade na listagem (subgrupo + abridor + admin)
 *   2) acoesDisponiveis() — quais ações cada usuário pode executar por status/papel
 *   3) slaStatus()        — semáforo de SLA na listagem
 *
 * MANTENHA EM SINCRONIA com gestao/tickets/page.tsx e gestao/tickets/[id]/page.tsx,
 * que importam estas mesmas funções (fonte única de verdade).
 */

import { describe, it, expect } from 'vitest'
import {
  ticketVisivel,
  acoesDisponiveis,
  slaStatus,
  STATUS_ABERTOS,
  STATUS_FECHADOS,
  type AcoesCtx,
  type TicketStatus,
} from '../../../lib/tickets'

// ─── 1) Visibilidade na listagem ───────────────────────────────────────────────

describe('ticketVisivel() — quem vê o ticket na listagem', () => {
  const ticket = { subgrupo_id: 'sg-1', aberto_por_id: 'u-abridor' }

  it('admin vê qualquer ticket, mesmo sem subgrupo nem ter aberto', () => {
    expect(ticketVisivel(ticket, {
      userId: 'u-outro', isAdmin: true, meusSubgrupos: new Set(),
    })).toBe(true)
  })

  it('membro do subgrupo de destino vê o ticket', () => {
    expect(ticketVisivel(ticket, {
      userId: 'u-outro', isAdmin: false, meusSubgrupos: new Set(['sg-1']),
    })).toBe(true)
  })

  it('abridor vê o próprio ticket mesmo sem ser do subgrupo', () => {
    expect(ticketVisivel(ticket, {
      userId: 'u-abridor', isAdmin: false, meusSubgrupos: new Set(['sg-99']),
    })).toBe(true)
  })

  it('usuário sem relação (outro subgrupo, não abriu) NÃO vê', () => {
    expect(ticketVisivel(ticket, {
      userId: 'u-estranho', isAdmin: false, meusSubgrupos: new Set(['sg-99']),
    })).toBe(false)
  })

  it('usuário sem subgrupos e sem ter aberto NÃO vê', () => {
    expect(ticketVisivel(ticket, {
      userId: 'u-estranho', isAdmin: false, meusSubgrupos: new Set(),
    })).toBe(false)
  })

  it('userId null (não autenticado) só vê por subgrupo', () => {
    expect(ticketVisivel(ticket, {
      userId: null, isAdmin: false, meusSubgrupos: new Set(['sg-1']),
    })).toBe(true)
    expect(ticketVisivel({ subgrupo_id: 'sg-2', aberto_por_id: '' }, {
      userId: null, isAdmin: false, meusSubgrupos: new Set(['sg-1']),
    })).toBe(false)
  })
})

// ─── 2) Ações disponíveis ──────────────────────────────────────────────────────

/** Contexto base: ninguém é nada (papéis ligados conforme cada teste). */
function ctx(over: Partial<AcoesCtx>): AcoesCtx {
  return {
    status: 'aberto',
    ehDoSubgrupo: false,
    ehAssignee: false,
    ehAbridor: false,
    podeCancelar: false,
    grupoLabel: 'Grupo',
    subgrupoLabel: 'Subgrupo',
    ...over,
  }
}

const tipos = (cs: AcoesCtx) => acoesDisponiveis(cs).map(a => a.tipo)

describe('acoesDisponiveis() — status ABERTO', () => {
  it('membro do subgrupo pode assumir, comentar e (sendo abridor) cancelar', () => {
    const t = tipos(ctx({ status: 'aberto', ehDoSubgrupo: true }))
    expect(t).toContain('aceite')
    expect(t).toContain('comentario')
  })

  it('quem NÃO é do subgrupo não pode assumir', () => {
    const t = tipos(ctx({ status: 'aberto', ehDoSubgrupo: false }))
    expect(t).not.toContain('aceite')
  })

  it('abridor (mesmo fora do subgrupo) pode cancelar e comentar, mas não assumir', () => {
    const t = tipos(ctx({ status: 'aberto', ehAbridor: true, ehDoSubgrupo: false }))
    expect(t).toContain('cancelamento')
    expect(t).toContain('comentario')
    expect(t).not.toContain('aceite')
  })

  it('gestor com permissão cancelar pode cancelar mesmo sem ser abridor', () => {
    const t = tipos(ctx({ status: 'aberto', podeCancelar: true }))
    expect(t).toContain('cancelamento')
  })

  it('estranho sem papel só pode comentar (não cancela, não assume)', () => {
    const t = tipos(ctx({ status: 'aberto' }))
    expect(t).toEqual(['comentario'])
  })
})

describe('acoesDisponiveis() — status EM_TRATAMENTO', () => {
  it('responsável conclui direto (3 conclusões), solicita info e transfere', () => {
    const acoes = acoesDisponiveis(ctx({ status: 'em_tratamento', ehAssignee: true }))
    const conclusoes = acoes.filter(a => a.tipo === 'conclusao').map(a => a.novoStatus)
    expect(conclusoes).toEqual(['corrigido', 'corrigido_parcialmente', 'nao_corrigido'])
    const t = acoes.map(a => a.tipo)
    expect(t).toContain('devolucao')
    expect(t).toContain('transferencia')
  })

  it('não há mais "conclusao_proposta"/aguardando_validacao no fluxo novo', () => {
    const t = tipos(ctx({ status: 'em_tratamento', ehAssignee: true }))
    expect(t).not.toContain('conclusao_proposta')
    expect(acoesDisponiveis(ctx({ status: 'em_tratamento', ehAssignee: true }))
      .some(a => a.novoStatus === 'aguardando_validacao')).toBe(false)
  })

  it('quem não é o responsável não movimenta (nem sendo do subgrupo)', () => {
    const t = tipos(ctx({ status: 'em_tratamento', ehAssignee: false, ehDoSubgrupo: true }))
    expect(t).not.toContain('conclusao')
    expect(t).not.toContain('devolucao')
    expect(t).not.toContain('transferencia')
  })

  it('improcedência só aparece para responsável COM permissão cancelar', () => {
    expect(tipos(ctx({ status: 'em_tratamento', ehAssignee: true, podeCancelar: true })))
      .toContain('improcedencia')
    expect(tipos(ctx({ status: 'em_tratamento', ehAssignee: true, podeCancelar: false })))
      .not.toContain('improcedencia')
  })

  it('label de transferência usa os rótulos da empresa em minúsculas', () => {
    const acoes = acoesDisponiveis(ctx({
      status: 'em_tratamento', ehAssignee: true, grupoLabel: 'Setor', subgrupoLabel: 'Equipe',
    }))
    const transf = acoes.find(a => a.tipo === 'transferencia')!
    expect(transf.label).toBe('Transferir para outro setor/equipe')
  })

  it('responsável também pode comentar e cancelar (se abridor)', () => {
    const t = tipos(ctx({ status: 'em_tratamento', ehAssignee: true, ehAbridor: true }))
    expect(t).toContain('comentario')
    expect(t).toContain('cancelamento')
  })
})

describe('acoesDisponiveis() — status AGUARDANDO_INFORMACAO', () => {
  it('abridor responde e retoma', () => {
    const t = tipos(ctx({ status: 'aguardando_informacao', ehAbridor: true }))
    expect(t).toContain('resposta_devolucao')
  })

  it('quem não é abridor não responde', () => {
    const t = tipos(ctx({ status: 'aguardando_informacao', ehAssignee: true }))
    expect(t).not.toContain('resposta_devolucao')
  })

  it('ainda permite comentar enquanto aguarda informação', () => {
    expect(tipos(ctx({ status: 'aguardando_informacao', ehAbridor: true }))).toContain('comentario')
  })
})

describe('acoesDisponiveis() — status AGUARDANDO_VALIDACAO (desativado)', () => {
  // O fluxo atual não produz mais este status. Mantemos o teste para garantir
  // que ele NÃO oferece a antiga ação de validação (código removido).
  it('não oferece mais a ação "validacao" para ninguém', () => {
    expect(tipos(ctx({ status: 'aguardando_validacao', ehAbridor: true })))
      .not.toContain('validacao')
    expect(tipos(ctx({ status: 'aguardando_validacao', ehAssignee: true })))
      .not.toContain('validacao')
  })
})

describe('acoesDisponiveis() — status de CONCLUSÃO (reabertura)', () => {
  for (const s of ['corrigido', 'corrigido_parcialmente', 'nao_corrigido'] as TicketStatus[]) {
    it(`abridor pode reabrir ticket "${s}"`, () => {
      expect(tipos(ctx({ status: s, ehAbridor: true }))).toContain('reabertura')
    })
    it(`não-abridor NÃO pode reabrir ticket "${s}"`, () => {
      expect(tipos(ctx({ status: s, ehAssignee: true, ehDoSubgrupo: true })))
        .not.toContain('reabertura')
    })
  }

  it('ticket concluído não aceita mais comentário nem cancelamento', () => {
    const t = tipos(ctx({ status: 'corrigido', ehAbridor: true }))
    expect(t).not.toContain('comentario')
    expect(t).not.toContain('cancelamento')
    expect(t).toEqual(['reabertura'])
  })
})

describe('acoesDisponiveis() — status TERMINAIS (cancelado/improcedente)', () => {
  for (const s of ['cancelado', 'improcedente'] as TicketStatus[]) {
    it(`"${s}" não oferece nenhuma ação (nem ao abridor/admin)`, () => {
      expect(acoesDisponiveis(ctx({
        status: s, ehAbridor: true, ehAssignee: true, ehDoSubgrupo: true, podeCancelar: true,
      }))).toEqual([])
    })
  }
})

describe('acoesDisponiveis() — invariantes de cancelamento', () => {
  it('cancelamento disponível em todos os status abertos para o abridor', () => {
    for (const s of STATUS_ABERTOS) {
      expect(tipos(ctx({ status: s, ehAbridor: true }))).toContain('cancelamento')
    }
  })

  it('nenhuma ação em status fechado, exceto reabertura nos reabríveis', () => {
    for (const s of STATUS_FECHADOS) {
      const t = tipos(ctx({ status: s, ehAbridor: true }))
      expect(t).not.toContain('cancelamento')
      expect(t).not.toContain('comentario')
    }
  })
})

// ─── 3) Semáforo de SLA ────────────────────────────────────────────────────────

describe('slaStatus() — semáforo de prazo', () => {
  const T0 = new Date('2026-01-01T08:00:00Z')
  const base = {
    status: 'aberto',
    criado_em: T0.toISOString(),
    sla_segundos_pausados: 0,
    sla_pausado_em: null as string | null,
  }

  it('sem deadline → null (não exibe indicador)', () => {
    expect(slaStatus({ ...base, sla_deadline_at: null }, T0.getTime())).toBeNull()
  })

  it('ticket fechado → null mesmo com deadline', () => {
    const deadline = new Date(T0.getTime() + 60 * 60_000).toISOString()
    expect(slaStatus({ ...base, status: 'corrigido', sla_deadline_at: deadline }, T0.getTime())).toBeNull()
  })

  it('início do prazo (0% consumido) → verde', () => {
    const deadline = new Date(T0.getTime() + 100 * 60_000).toISOString()
    expect(slaStatus({ ...base, sla_deadline_at: deadline }, T0.getTime())).toBe('verde')
  })

  it('70% consumido → ainda verde (limite amarelo é 80%)', () => {
    const deadline = new Date(T0.getTime() + 100 * 60_000).toISOString()
    const agora = T0.getTime() + 70 * 60_000
    expect(slaStatus({ ...base, sla_deadline_at: deadline }, agora)).toBe('verde')
  })

  it('80% consumido → amarelo (limite inclusivo)', () => {
    const deadline = new Date(T0.getTime() + 100 * 60_000).toISOString()
    const agora = T0.getTime() + 80 * 60_000
    expect(slaStatus({ ...base, sla_deadline_at: deadline }, agora)).toBe('amarelo')
  })

  it('100% consumido (no limite) → vermelho', () => {
    const deadline = new Date(T0.getTime() + 100 * 60_000).toISOString()
    const agora = T0.getTime() + 100 * 60_000
    expect(slaStatus({ ...base, sla_deadline_at: deadline }, agora)).toBe('vermelho')
  })

  it('vencido (passou do deadline) → vermelho', () => {
    const deadline = new Date(T0.getTime() + 60 * 60_000).toISOString()
    const agora = T0.getTime() + 120 * 60_000
    expect(slaStatus({ ...base, sla_deadline_at: deadline }, agora)).toBe('vermelho')
  })

  it('pausa ativa estende o prazo → volta a verde', () => {
    // deadline em 100 min; agora 90 min (90% → seria amarelo),
    // mas pausado há 60 min estende o deadline → consumido cai.
    const deadline = new Date(T0.getTime() + 100 * 60_000).toISOString()
    const agora = T0.getTime() + 90 * 60_000
    const pausadoEm = new Date(T0.getTime() + 30 * 60_000).toISOString() // pausado há 60 min
    const r = slaStatus({ ...base, sla_deadline_at: deadline, sla_pausado_em: pausadoEm }, agora)
    expect(r).toBe('verde')
  })

  it('segundos pausados acumulados estendem o prazo', () => {
    const deadline = new Date(T0.getTime() + 100 * 60_000).toISOString()
    const agora = T0.getTime() + 90 * 60_000 // 90% sem pausa → amarelo
    // 30 min acumulados de pausa → total vira 130 min, consumido 90/130 ≈ 69% → verde
    const r = slaStatus({ ...base, sla_deadline_at: deadline, sla_segundos_pausados: 30 * 60 }, agora)
    expect(r).toBe('verde')
  })
})
