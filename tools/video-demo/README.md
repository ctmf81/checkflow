# Video demo — pipeline

Ferramenta pra gravar vídeos curtos de demonstração das telas do CheckFlow: tela + narração feminina (edge-tts Thalita, sem chave/custo), montada com ffmpeg. Roda contra **prod** (`app.checkflow.digital`) na **Empresa Demo** — dev tem serviços desligados.

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
# 1) edita videos/meu-video/cenas.mjs — TITULO (aceita \n pra 2 linhas), CENAS[i] = {texto, gap}
# 2) edita videos/meu-video/record.mjs — só as cenas (setup de cena N+1 vai no `noFim` da cena N)
node videos/meu-video/record.mjs
# → gera output/meu-video.mp4
```

## Estrutura

```
tools/video-demo/
  lib/
    config.mjs          — BASE (prod), EMPRESA_DEMO (Vanessa), VOZ (Thalita), VIEWPORT, INTRO/OUTRO_DUR
    onboarding-ids.mjs  — pageIds pré-marcados no localStorage
    login.mjs           — novoContextGravando + loginEmpresaDemo(page, opts?) — opts pra override de cpf/senha/empresa
    tts.mjs             — gerarNarracoes(dir, textos, {voice, rate}?) → durações; ajustarFonetica com mapa (checklist→tchéc list, subgrupo→sub grupo)
    cartelas.mjs        — gerarCartelas(dir, {titulo}) — título com \n = multilinha
    montar.mjs          — montar({dir, offset, DUR, GAP_AFTER, output})
    record-helpers.mjs  — wait, tryDo, limparResiduos, criarPlayer(DUR, GAP_AFTER) com .encena(n, setupNext, duringCena) e .duracaoCenaMs(n)
    preflight.mjs       — acharGrupoComSubgrupoComChecklist, removerUsuarioDoPrimeiroGrupo, comecarSniffSupabase (creds via listener), seedEvidenciasDePlano
  assets/logo.png        — logo do CheckFlow (fonte das cartelas)
  videos/_template/      — ponto de partida
  videos/<nome>/         — 1 pasta por vídeo (audio/ video/ intro/outro.png ficam local; git-ignored)
  output/                — mp4 finais (git-ignored)
```

## Padrões aprendidos

### Alinhamento cena ↔ narração
Use o helper `noFim(player, n, tail, fn)` que espera até faltar `tail`ms pro fim da cena N e roda `fn` (setup pra cena N+1). Quando cena N+1 começar, o visual já está no lugar.

```js
await player.encena(3, null, noFim(player, 3, 1500, async () => {
  await scrollToBloco()
  await tryDo('click X', async () => { await page.locator('button:has-text("X")').click() })
}))
```

**Errado:** fazer o setup no `setupNext` (roda no GAP após a cena) — o setup começa DEPOIS que a próxima narração já está tocando, e o visual fica dessincronizado. Foi disso que o usuário reclamou "tá um tempão mostrando a tela antiga enquanto ele fala da nova".

### Pré-offset é invisível
Login, `Liberar edição`, seed de dados, sniff de creds, scroll pra área alvo — tudo ANTES de `player.iniciar()`. O `offset = (Date.now() - tGravacao) / 1000` corta essa parte no `main_cut.mp4` do ffmpeg.

### Onboardings nunca aparecem
`novoContextGravando(browser, dir)` já injeta todos os pageIds em `localStorage.checkflow_onboarding_visto`. `limparResiduos(page)` é fallback pros que escapam. Mantenha a lista de pageIds em sync com `apps/web/components/onboarding/registry.ts`.

### Terminologia da UI
A narração usa exatamente o que o botão/label mostra. Se o botão é "Marcar como corrigido", a fala é "Marcar como corrigido". Não invente sinônimo — o vídeo é tutorial.

### Pronúncia ruim → mapa fonético
`ajustarFonetica` em `lib/tts.mjs` reescreve o texto antes de mandar pra TTS. Já cobre `checklist→tchéc list` e `subgrupo→sub grupo`. Pra siglas, escrever com espaços no texto: `S L A`, `I A`, `I O T`.

### Preflight de dados
Se a cena depende de estado específico (plano em moderação, subgrupo com checklist, user candidato pra adicionar), valida antes com `throw new Error('PREFLIGHT: ...')` e uma mensagem clara — bloqueia a gravação em vez de gerar vídeo quebrado.

### Buffer no fim
`await wait(1500)` depois do último `player.encena(N)` — evita `-shortest` do ffmpeg cortar a última fala.

### GAP_AFTER variável
`GAP_AFTER[n]` = silêncio (s) após a cena N. Regra prática: 0.5s pra mudança leve, 1.5s pra abrir modal, 2.5s pra `page.goto` + carregamento. Fica no `cenas.mjs` como `gap` em cada item.

### Funções e permissões
Vanessa é `funcao='nivel_2'` em todos os subgrupos. Na tela do plano de ação, `isN1 = ehAdmin || funcao==='nivel_1' || funcao==='nivel_2'` — ou seja **nivel_2 também modera N1**. Não precisa logar como Beatriz (N1) pra moderar planos em N1.

Se precisar de outro papel (raro): `loginEmpresaDemo(page, { cpf: '416.529.783-01' })` — CPFs no `memory/feature-videos-demo.md`.

### Multi-vídeo por rota
Cadastrar em `/sistema/ajuda` múltiplos vídeos com a **mesma rota** + `ordem`. O modal do assistente vira carrossel de tabs (`Ver vídeos (N)`) — mostra só os do nível mais específico da rota, ancestrais só aparecem se não existir vídeo específico.

## Cartelas

`gerarCartelas` gera intro (logo + título) e outro (só logo) a 1280x720. Título com `\n` = duas linhas mesmo tamanho.

```js
await gerarCartelas(__dirname, { titulo: 'Checklist\nMontagem Parte 3' })
```

Se o usuário mandar uma imagem pronta como intro, salvar em `videos/<nome>/intro.png` e pular a chamada de `gerarCartelas` (o `record.mjs` já checa `fs.existsSync`). Manter `outro.png` como só a logo.
