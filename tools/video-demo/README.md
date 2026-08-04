# Video demo — pipeline

Ferramenta pra gravar vídeos curtos de demonstração das telas do CheckFlow: tela + narração feminina (edge-tts Francisca, sem chave/custo), montada com ffmpeg. Roda na **Empresa Demo do web-dev** (branch `develop` já subiu no Railway).

## Setup (uma vez)

```bash
cd tools/video-demo
npm install
npx playwright install chromium
python -m pip install edge-tts
```

## Fazer um vídeo novo

```bash
cp -r videos/_template videos/meu-video
# 1) edita videos/meu-video/cenas.mjs (TITULO + textos + gaps)
# 2) edita videos/meu-video/record.mjs (só as cenas específicas — cada encena() faz o setup da PRÓXIMA)
node videos/meu-video/record.mjs
# → gera output/meu-video.mp4
```

## Estrutura

```
tools/video-demo/
  lib/
    config.mjs          — BASE, EMPRESA_DEMO, VOZ, VIEWPORT, INTRO_DUR/OUTRO_DUR
    onboarding-ids.mjs  — pageIds pré-marcados no localStorage (nenhum onboarding no vídeo)
    login.mjs           — novoContextGravando + loginEmpresaDemo
    tts.mjs             — gerarNarracoes(dir, textos) → durações
    cartelas.mjs        — gerarCartelas(dir, {titulo}) — intro/outro PNG 1280x720
    montar.mjs          — montar({dir, offset, DUR, GAP_AFTER, output})
    record-helpers.mjs  — wait, tryDo, limparResiduos, criarPlayer
    preflight.mjs       — helpers que validam a demo ANTES de gravar
  assets/
    logo.png            — logo do CheckFlow (fonte das cartelas)
  videos/
    _template/          — ponto de partida pra vídeos novos
    <nome>/             — 1 pasta por vídeo (cenas.mjs + record.mjs + audio/ + video/ + intro/outro.png)
  output/               — mp4 finais (git-ignored)
```

## Regras aprendidas

- **Onboardings NÃO devem aparecer no vídeo** — `novoContextGravando` já pré-marca todos como vistos via localStorage.
- **Nunca fazer setup dentro do wait de uma cena** — a narração da próxima cena começa e não bate com o que tá na tela. Use `criarPlayer(DUR, GAP_AFTER)` e faça o setup da cena N+1 no callback `encena(n, setupNext)`; o player espera o restante do gap antes de iniciar a próxima.
- **Gap `GAP_AFTER[n]` por cena** — 0.5s pra transições leves, 1.5s pra abrir modal, 2.5s pra `page.goto` + carregamento.
- **Preflight antes de gravar** — usa os helpers de `lib/preflight.mjs` pra validar que os dados de que a cena precisa existem (subgrupo com checklist, user candidato pra adicionar, …). Se falhar, o script para ANTES de gravar cena vazia.
- **Termo do produto:** se a UI mostra "checklist", a narração fala "checklist" (consistência). Erro de pronúncia se resolve com grafia fonética (`sub grupo` em vez de `subgrupo`, etc.), nunca inventando sinônimo.
- **Empresa Demo é a única base de gravação** — Vanessa `046.813.259-77` / `Demo@2026` (a memória `feature-videos-demo` guarda tudo sobre ela).
