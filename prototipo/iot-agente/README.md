# Protótipo — Agente IoT/IA (spike)

Prova de conceito do **agente** que faz a ponte entre os dispositivos na rede do
cliente (câmera IP, sensor) e a nuvem, no modelo **pedido→resposta com janela**.

⚠️ **Isto NÃO é a funcionalidade** — é um spike isolado pra validar o conceito
**antes** de construir em cima do CheckFlow. Ver o desenho completo em
`docs/features/CHECKLIST_IOT_IA.md`.

## O que ele prova
- O agente **só faz conexões de saída** (pergunta pra nuvem) → atravessa firewall
  sem abrir porta nem expor a câmera.
- A leitura é **do momento**: só vale amarrada à solicitação criada pelo disparo;
  foto/valor anterior é ignorado.
- **Tempo máximo de resposta**: o que não chega na janela vira `sem_resposta`
  (gera alerta, **não** plano de ação).
- Um **mesmo agente** atende câmera e sensor.

## Rodar a demo (2 terminais)

```bash
# terminal 1 — a "nuvem" faz-de-conta
node receptor.mjs

# terminal 2 — simula o agendamento disparando + roda o agente
curl -s -X POST localhost:4000/disparar -d '{"tipo":"camera","janela_seg":30}'
curl -s -X POST localhost:4000/disparar -d '{"tipo":"sensor","janela_seg":30}'
node agente.mjs          # fica em loop (poll a cada 5s); Ctrl+C pra parar

# ver o que chegou
curl -s localhost:4000/status
```

Sem câmera/sensor real, o agente **sintetiza** uma foto (com o horário) e um valor
fake — suficiente pra ver o ciclo. As imagens recebidas caem em `recebidas/`.

## Capturar de uma CÂMERA REAL (drivers via ffmpeg)

Requer o **ffmpeg** instalado (`winget install Gyan.FFmpeg`). O agente escolhe o
driver por variável de ambiente. `FFMPEG` aponta pro executável (se não estiver no
PATH).

```powershell
# --- WEBCAM local (testado ✅: capturou 1280x720 real) ---
$env:FFMPEG="C:\...\ffmpeg.exe"; $env:WEBCAM_NAME="Integrated Webcam"; node agente.mjs
#   (o nome exato vem de: ffmpeg -list_devices true -f dshow -i dummy)

# --- CÂMERA IP por RTSP (ex.: Intelbras iC5/Mibo) ---
$env:RTSP_URL="rtsp://usuario:senha@192.168.100.50:554/..."; node agente.mjs
#   o agente tira 1 frame do stream no momento. Requisitos p/ a iC5:
#   estar LIGADA + na MESMA rede do PC + RTSP habilitado (app Mibo) + IP/credenciais.

# --- câmera com snapshot HTTP (.jpg direto) ---
$env:SNAPSHOT_URL="http://usuario:senha@192.168.0.50/snapshot.jpg"; node agente.mjs

# --- sensor HTTP que devolve um número ---
$env:SENSOR_URL="http://192.168.0.60/temp"; node agente.mjs
```

> Prova de conceito rodada com a **webcam integrada** (câmera real): o agente
> capturou um JPEG 1280x720 no momento do disparo e subiu pelo ciclo. Trocar
> `WEBCAM_NAME` por `RTSP_URL` faz o mesmo com uma câmera IP — é a única diferença.

## Próximo passo
Validado o conceito aqui, a implementação de verdade entra no CheckFlow seguindo
`docs/features/CHECKLIST_IOT_IA.md` (endpoint `/iot/leitura`, execução automática,
montador, entitlement) — pelo processo normal (`feat/*` → dev → PR → quarta).
