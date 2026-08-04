export const TITULO = 'Plano de Ação'

export const CENAS = [
  { texto: 'Plano de Ação.', gap: 0.5 },                                                                                                                                                                    // 0 intro
  { texto: 'Aqui vive tudo que precisa de atenção: cada não conformidade encontrada durante um checklist vira um plano de ação — na hora que acontece.', gap: 0.5 },                                        // 1
  { texto: 'Assim que o plano é aberto, todo mundo que tem função N1 naquele sub grupo é notificado na hora — WhatsApp, e-mail e Telegram, ao mesmo tempo. E o alerta respeita o turno e o período de férias: quem não está trabalhando não é incomodado.', gap: 0.5 }, // 2
  { texto: 'Cada plano mostra o essencial: o status atual, o sub grupo, a atividade em que a não conformidade apareceu, o checklist de origem e quem abriu.', gap: 1.0 },                                    // 3
  { texto: 'Filtre por Abertos, Moderação N1, N2, Corrigidos ou Não corrigidos — pra focar no que exige ação agora.', gap: 0.5 },                                                                            // 4
  { texto: 'Todo plano começa em Moderação N1 — quem tem essa função no sub grupo modera primeiro. Se o caso precisa subir, escala pra N2, e quem tem essa função decide.', gap: 2.5 },                       // 5
  { texto: 'Um clique abre a moderação — pela notificação ou por esta tela. Aqui você vê a evidência, corrige, e pode registrar a causa raiz do problema, ou consultar as últimas causas raízes daquela atividade — pra enxergar padrão e atacar a origem, não só o sintoma.', gap: 2.5 }, // 6
  { texto: 'É por aqui que a operação fecha o ciclo: encontrou, tratou, e virou melhoria contínua.', gap: 0.5 },                                                                                              // 7
]

export const TEXTOS = CENAS.map(c => c.texto)
export const GAP_AFTER = CENAS.slice(1).map(c => c.gap)
