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

## Apontar pra SUA câmera / sensor real

O agente aceita variáveis de ambiente:

```bash
# a URL de snapshot da sua câmera IP (varia por fabricante — procure "snapshot URL"
# ou "ISAPI/CGI snapshot" do seu modelo). O agente precisa rodar NA MESMA REDE dela.
SNAPSHOT_URL="http://usuario:senha@192.168.0.50/snapshot.jpg" node agente.mjs

# um sensor que exponha um número via HTTP local
SENSOR_URL="http://192.168.0.60/temp" node agente.mjs
```

Se a câmera só der **RTSP** (vídeo), o próximo passo é o agente tirar um frame com
`ffmpeg` — dá pra adicionar quando você testar com o equipamento real.

## Próximo passo
Validado o conceito aqui, a implementação de verdade entra no CheckFlow seguindo
`docs/features/CHECKLIST_IOT_IA.md` (endpoint `/iot/leitura`, execução automática,
montador, entitlement) — pelo processo normal (`feat/*` → dev → PR → quarta).
