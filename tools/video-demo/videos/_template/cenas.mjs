// Roteiro do vídeo: título (usado na cartela) + texto por cena + gap após a cena.
// Índice 0 = intro (só o título é falado, "TITULO."). Índices 1..N = cenas.
// GAP_AFTER (segundos) é o tempo de silêncio depois da cena — dá espaço pro setup
// da próxima cena (page.goto, cliques) rodar sem a narração seguinte "atropelar".
//   0.5 → mesma tela / mudança leve
//   1.5 → click/modal aberto
//   2.5 → page.goto + carregamento
export const TITULO = 'Título Aqui'

export const CENAS = [
  { texto: 'Título Aqui.', gap: 0.5 },                            // cena 0 = intro
  { texto: 'Narração da cena 1.', gap: 0.5 },                     // cena 1
  { texto: 'Narração da cena 2 — troca de tela leve.', gap: 2.5 },// cena 2 (gap maior porque próxima tela é goto)
  // …
]

// Ordem: cenas[0] é intro; cenas[1..N] são as cenas do vídeo principal.
export const DUR = []            // preenchido pelo record.mjs após gerar TTS
export const GAP_AFTER = CENAS.slice(1).map(c => c.gap)
export const TEXTOS = CENAS.map(c => c.texto)
