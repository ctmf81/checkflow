// Espelho em TypeScript da função SQL `usuario_esta_no_turno()`
// (supabase/migrations/20260607000002_turnos.sql).
//
// Por que existe: a função real roda no Postgres (usada via RPC pela
// API ao decidir se envia WhatsApp de moderação). Este espelho permite
// testar a matemática do turno (administrativo e escala) sem precisar
// de um banco — e pode ser reaproveitado no futuro para exibir no
// front "você está fora do turno agora" sem round-trip ao servidor.
//
// ⚠️ IMPORTANTE: se a função SQL mudar, atualize este arquivo (e os
// testes em tests/unit/lib/turnos.unit.test.ts) na mesma migration/PR.

export type ModoForaTurno = 'notificacao' | 'login' | 'aviso'
export interface DiaConfig { dia: number; inicio: string; fim: string } // dia: 0=domingo .. 6=sábado
export interface TurnoAdministrativo {
  tipo: 'administrativo'
  ativo: boolean
  modo_fora_turno?: ModoForaTurno
  config: { dias?: DiaConfig[] }
}
export interface TurnoEscala {
  tipo: 'escala'
  ativo: boolean
  modo_fora_turno?: ModoForaTurno
  config: {
    data_referencia?: string   // 'YYYY-MM-DD'
    hora_inicio?: string       // 'HH:MM'
    horas_trabalho?: number
    horas_folga?: number
  }
}
export type Turno = TurnoAdministrativo | TurnoEscala

function horaParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * @param turno  turno do usuário, ou null/undefined se não tiver nenhum
 * @param momento Date a avaliar (default: agora)
 */
export function estaNoTurno(turno: Turno | null | undefined, momento: Date = new Date()): boolean {
  // Sem turno cadastrado, ou turno inativo → nunca restringe
  if (!turno || !turno.ativo) return true

  if (turno.tipo === 'administrativo') {
    const dia = momento.getDay() // 0=domingo
    const minutosAgora = momento.getHours() * 60 + momento.getMinutes()
    const diaCfg = (turno.config.dias ?? []).find(d => d.dia === dia)
    if (!diaCfg) return false

    const inicio = horaParaMinutos(diaCfg.inicio)
    const fim = horaParaMinutos(diaCfg.fim)

    if (inicio <= fim) {
      return minutosAgora >= inicio && minutosAgora < fim
    } else {
      // janela cruza a meia-noite (ex: 22:00–06:00)
      return minutosAgora >= inicio || minutosAgora < fim
    }
  }

  if (turno.tipo === 'escala') {
    const { data_referencia, hora_inicio = '00:00', horas_trabalho = 12, horas_folga = 36 } = turno.config
    if (!data_referencia) return true

    const [ano, mes, dia] = data_referencia.split('-').map(Number)
    const [hIni, mIni] = hora_inicio.split(':').map(Number)
    const inicioTs = new Date(ano, mes - 1, dia, hIni, mIni || 0).getTime()

    const cicloHoras = horas_trabalho + horas_folga
    if (cicloHoras <= 0) return true

    const minutosDesde = (momento.getTime() - inicioTs) / 60000
    if (minutosDesde < 0) return false

    const horasDesde = minutosDesde / 60
    const posNoCiclo = ((horasDesde % cicloHoras) + cicloHoras) % cicloHoras

    return posNoCiclo < horas_trabalho
  }

  return true
}

// Modo de comportamento fora do turno (default 'notificacao' quando ausente).
function modo(turno: Turno): ModoForaTurno {
  return turno.modo_fora_turno ?? 'notificacao'
}

/**
 * Espelho de `usuario_recebe_notificacao()` (SQL). Só NÃO recebe quando há
 * turno ativo no modo 'notificacao' e o usuário está fora dele agora.
 */
export function recebeNotificacao(turno: Turno | null | undefined, momento: Date = new Date()): boolean {
  if (!turno || !turno.ativo) return true
  return !(modo(turno) === 'notificacao' && !estaNoTurno(turno, momento))
}

/**
 * Está de férias no momento? Espelho da parte de férias de
 * `usuario_recebe_notificacao()` (SQL). Datas 'YYYY-MM-DD' inclusivas, comparadas
 * pela data UTC do momento (igual ao SQL). Sem período completo → false.
 */
export function estaDeFerias(
  inicio: string | null | undefined,
  fim: string | null | undefined,
  momento: Date = new Date(),
): boolean {
  if (!inicio || !fim) return false
  const hoje = momento.toISOString().slice(0, 10)
  return inicio <= hoje && hoje <= fim
}

/**
 * Espelho COMPLETO de `usuario_recebe_notificacao()` (SQL): NÃO recebe se está
 * de férias OU (turno modo 'notificacao' e fora do turno). Mantenha em sincronia
 * com a função SQL (migration 20260715130000).
 */
export function usuarioRecebeNotificacao(
  args: { turno?: Turno | null; feriasInicio?: string | null; feriasFim?: string | null },
  momento: Date = new Date(),
): boolean {
  if (estaDeFerias(args.feriasInicio, args.feriasFim, momento)) return false
  return recebeNotificacao(args.turno, momento)
}

/**
 * Espelho de `usuario_pode_acessar()` (SQL). Só NÃO pode quando há turno ativo
 * no modo 'login', fora do horário agora, e o usuário NÃO é admin (sistema ou
 * empresa). Admins nunca são bloqueados.
 */
export function podeAcessar(turno: Turno | null | undefined, momento: Date = new Date(), isAdmin = false): boolean {
  if (!turno || !turno.ativo || isAdmin) return true
  return !(modo(turno) === 'login' && !estaNoTurno(turno, momento))
}

/**
 * Espelho de `usuario_deve_avisar_turno()` (SQL). Mostra aviso quando há turno
 * ativo no modo 'aviso' e o usuário está fora dele agora.
 */
export function deveAvisar(turno: Turno | null | undefined, momento: Date = new Date()): boolean {
  if (!turno || !turno.ativo) return false
  return modo(turno) === 'aviso' && !estaNoTurno(turno, momento)
}
