// Regras PURAS de entitlement/visibilidade (plano + perfil). Centralizadas aqui
// para serem reutilizadas pelo menu (Sidebar), pelas telas e pelos testes — o
// que roda em produção é exatamente o que os testes cobrem.
//
// Regra opt-in (vale para todo o sistema): `recursosHabilitados`/`flagsHabilitadas`
// = null significa SEM restrição (trial, dev, ou plano sem serviços configurados).

// Recursos CORE de plataforma — NUNCA gateados por plano. São a gestão da
// própria empresa (unidades), perfis e usuários: não pertencem a nenhum serviço/
// módulo, então um plano configurado não os inclui em recursosHabilitados. Sem
// esta exceção, admin da empresa perderia esses menus num plano fechado.
export const RECURSOS_CORE = new Set(['unidades', 'perfis', 'usuarios'])

// O plano libera esse RECURSO de módulo? (ex.: 'checklists', 'tarefas')
// Recursos core passam sempre. `null` = sem restrição (trial/dev).
export function planoLiberaRecurso(recursosHabilitados: Set<string> | null, recurso?: string): boolean {
  if (!recurso) return true
  if (RECURSOS_CORE.has(recurso)) return true
  if (recursosHabilitados === null) return true
  return recursosHabilitados.has(recurso)
}

// O plano inclui essa CARACTERÍSTICA (flag)? (ex.: 'ia')
export function planoLiberaFlag(flagsHabilitadas: Set<string> | null, flag?: string): boolean {
  if (!flag) return true
  if (flagsHabilitadas === null) return true
  return flagsHabilitadas.has(flag)
}

export interface ContextoAcesso {
  isAdminSistema: boolean            // plataforma: ignora plano
  isAdminEmpresa: boolean            // vê tudo, mas limitado ao plano
  recursosHabilitados: Set<string> | null
  flagsHabilitadas: Set<string> | null
  recursos: Set<string>              // recursos liberados pelo PERFIL do usuário
  carregado: boolean                 // já carregou os recursos do perfil?
}

// Um item declara como é liberado: recurso-módulo (perm), característica (flag),
// ou só-admin (admin). Espelha NavItem/NavChild do Sidebar.
export interface ItemGate { perm?: string; admin?: boolean; flag?: string }

// Um item folha é visível no menu? (fonte única — o Sidebar delega aqui)
//   1. Admin de SISTEMA vê tudo (plataforma).
//   2. Gate de plano: por característica (flag) quando o item tem flag; senão por
//      recurso-módulo. Vale até para admin da empresa.
//   3. Admin da empresa vê tudo que o plano libera.
//   4. Item só-admin (sem ser admin) → escondido.
//   5. Usuário comum: precisa da permissão do recurso no perfil (após carregar).
export function itemVisivelNoMenu(it: ItemGate, ctx: ContextoAcesso): boolean {
  if (ctx.isAdminSistema) return true
  if (it.flag) { if (!planoLiberaFlag(ctx.flagsHabilitadas, it.flag)) return false }
  else if (!planoLiberaRecurso(ctx.recursosHabilitados, it.perm)) return false
  if (ctx.isAdminEmpresa) return true
  if (it.admin) return false
  if (it.perm) return ctx.carregado && ctx.recursos.has(it.perm)
  return true
}

// Um recurso deve aparecer no CONSTRUTOR DE PERFIL?
//   • plano não configurado (recursosHabilitados null) → mostra tudo (opt-in)
//   • recurso core (home/usuarios/perfis…) → sempre
//   • recurso do plano (módulo) → mostra
//   • recurso por característica (flag, ex.: ia) → mostra se o plano tem a flag
//   • senão → esconde
export function recursoVisivelNoPerfil(
  r: { key: string; flag?: string },
  recursosHabilitados: Set<string> | null,
  flagsHabilitadas: Set<string> | null,
  core: Set<string>,
): boolean {
  if (recursosHabilitados === null) return true
  if (core.has(r.key)) return true
  if (recursosHabilitados.has(r.key)) return true
  if (r.flag) return planoLiberaFlag(flagsHabilitadas, r.flag)
  return false
}

// ── Permissões por AÇÃO do recurso 'relatorios' ───────────────────────────────
export interface AcoesRelatorios { criar: boolean; editar: boolean; excluir: boolean; executar: boolean }

// Resolve as 4 ações a partir do papel + linhas de perfil_permissoes. Admin de
// sistema/empresa tem todas. Usa como fonte única na tela CRUD e na Home.
export function resolverAcoesRelatorios(opts: {
  isAdminSistema: boolean
  isAdminEmpresa: boolean
  permissoes: { recurso: string; acao: string }[]
}): AcoesRelatorios {
  if (opts.isAdminSistema || opts.isAdminEmpresa) {
    return { criar: true, editar: true, excluir: true, executar: true }
  }
  const acoes = new Set(opts.permissoes.filter(p => p.recurso === 'relatorios').map(p => p.acao))
  return {
    criar: acoes.has('criar'),
    editar: acoes.has('editar'),
    excluir: acoes.has('excluir'),
    executar: acoes.has('executar'),
  }
}
