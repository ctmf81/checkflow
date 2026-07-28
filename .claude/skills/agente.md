---
name: agente
description: Livro-mestre do AGENTE IoT/IA e dos DRIVERS por tipo de dispositivo (câmera, sensor, IoT de nuvem). Consulte/atualize sempre que for integrar um dispositivo novo — como alcançar, autenticar, ler/capturar, e as pegadinhas de cada tipo. Trigger em "agente", "IoT", "dispositivo", "driver", "câmera", "sensor", "RTSP", "ONVIF", "Modbus", "MQTT", "Tuya", "Sonoff".
---

# Agente IoT/IA — livro-mestre de dispositivos

Referência viva de **como o agente conversa com cada tipo de dispositivo**. Planejamento
da feature: `docs/features/CHECKLIST_IOT_IA.md`. Protótipo funcional (testado com câmera
real): `prototipo/iot-agente/`.

> **Esta skill é viva.** Ao integrar um tipo de dispositivo novo, adicione um driver na
> tabela abaixo com: como alcançar, como autenticar, como ler/capturar e as pegadinhas.

## O que é o agente (fundamentos)
- Roda **na rede local do cliente** (alcança dispositivos atrás do firewall). **Só faz
  conexões de SAÍDA** (pergunta pra nuvem) → atravessa qualquer roteador sem abrir porta.
- **1 software, N instâncias** — uma por local do cliente, com token próprio. NÃO se cria
  um agente por cliente; instala-se o mesmo.
- **Drivers plugáveis por tipo de dispositivo.** Esforço amortiza **por tipo**, não por
  cliente: um driver feito 1× serve todos os clientes com aquele tipo.
- **Config vem da nuvem** (CheckFlow) — o agente é "burro", só obedece. **Não tem tela de
  gestão própria**; o cadastro de dispositivos/tokens/faixas fica no CheckFlow.
- **Modelo pedido→resposta com janela**: o disparo do agendamento cria uma solicitação;
  o agente coleta **no momento** e responde amarrado a ela (retrato do momento). O que
  não chega na janela vira **"sem resposta"** (alerta, sem plano de ação).

## Os dois mundos de dispositivo (decisão de qual driver)
| Mundo | Exemplos | Como o agente lê |
|---|---|---|
| **Acesso local** | câmera RTSP/ONVIF, sensor Modbus/HTTP | agente lê **direto na rede local** |
| **Preso na nuvem** | **Tuya, Sonoff, ar IoT**, maioria dos "smart" | via **API do fabricante** ou **hub local** (Home Assistant) — não tem acesso local por padrão |

## ⚠️ IP dinâmico (DHCP) — dispositivo muda de endereço
Não perseguir IP fixo. Estratégias: **reserva de DHCP** no roteador (IP fixo por MAC),
**descoberta ONVIF** (câmeras se anunciam), ou o agente **varre a rede e casa pelo MAC**.
Guardar o **MAC** como identidade estável do dispositivo, não o IP.

## Catálogo de drivers

### Câmeras
| Driver | Como capturar 1 frame (no momento) | Auth / caminho | Status |
|---|---|---|---|
| **Intelbras Mibo** (iC3/iC5/iM3) | RTSP + ffmpeg (`-frames:v 1`) | user `admin`, senha = **CHAVE ACESSO da etiqueta** (ex.: iM3 = `RF6X3Q82`, 8 chars; varia por câmera). Path `rtsp://admin:CHAVE@IP:554/live/mpeg4` | ⚠️ ver gotchas Mibo abaixo |
| **Intelbras/Dahua PRO** (VIP) | RTSP + ffmpeg | `rtsp://user:senha@IP:554/cam/realmonitor?channel=1&subtype=0` (porta privada 37777 costuma estar aberta) | driver = mesmo RTSP, path diferente |
| **ONVIF genérica** | ONVIF `GetSnapshotUri`/`GetStreamUri` → snapshot/RTSP | credenciais ONVIF; descoberta automática na rede | planejado (ajuda no IP dinâmico) |
| **Snapshot HTTP** | `GET http://user:senha@IP/snapshot.jpg` | varia por fabricante | ✅ no protótipo |
| **Webcam local (dshow)** — só teste | ffmpeg `-f dshow -i video=<Nome>` | nome via `ffmpeg -list_devices true -f dshow -i dummy` | ✅ testado (JPEG 1280×720 real) |

> RTSP (puxar) — **não** RTMP (empurrar). Requer **ffmpeg** no host do agente
> (`winget install Gyan.FFmpeg`). Captura: `ffmpeg -rtsp_transport tcp -rw_timeout 8000000 -i "<url>" -frames:v 1 out.jpg` (o `-rw_timeout` evita travar; **não** usar `-timeout`, que é listen-timeout e pendura).

**⚠️ Gotchas Mibo (aprendidos na marra 2026-07-24):**
- A **CHAVE ACESSO da etiqueta** é **por câmera** — 3 iC3 têm 3 chaves diferentes; a chave da iM3 (`RF6X3Q82`) **não** abre as iC3 (dá 401).
- **RTSP pode precisar ser habilitado** no app Mibo; e a Mibo é historicamente **finicky** com RTSP (fóruns Intelbras "Senha inválida via RTSP").
- **Bloqueio por tentativas**: após várias falhas de auth, a câmera **bloqueia a origem** — o 401 vira **timeout**. Se começar a dar timeout depois de vários 401, **PARE**, espere alguns minutos ou **reinicie a câmera**, e faça **uma** tentativa limpa com a chave certa.
- Identidade estável = **MAC** (o IP muda por DHCP; a iM3/iC3 só têm porta 554; a VIP/pro tem 37777 também).

### Sensores (acesso local)
| Driver | Como ler | Notas |
|---|---|---|
| **HTTP/JSON** | `GET` num endpoint local que devolve o número | mais simples; muitos gateways expõem assim |
| **Modbus TCP** | ler registrador | temp/umidade industrial (cadeia de frio); precisa do **mapa de registrador** |
| **MQTT** | assinar tópico / ler último valor | ⚠️ pub/sub → o valor pode ser velho; checar frescor ou pedir leitura no momento |

### IoT de nuvem (Tuya, Sonoff, ar IoT)
Não têm acesso local por padrão. Três caminhos:
1. **Driver de nuvem** — o CheckFlow (ou o agente) chama a **API do fabricante**: *Tuya IoT
   Cloud API*, *Sonoff/eWeLink API*. Pega o estado do dispositivo. (Nem precisa de agente.)
2. **Firmware aberto** — Sonoff aceita **Tasmota/ESPHome** → vira local (HTTP/MQTT) → driver local.
3. **Hub local** — **Home Assistant**/Node-RED integra Tuya/Sonoff/etc. e expõe num só lugar;
   o agente lê do hub (o hub pode até **ser** o agente).

## Como adicionar um tipo de dispositivo NOVO
1. Descobrir o **protocolo/acesso**: é local (RTSP/ONVIF/HTTP/Modbus/MQTT) ou nuvem (API do fabricante)?
2. Achar **como alcançar** (porta, path) e **como autenticar** (credenciais, onde pegar).
3. Reusar um driver existente (mesmo protocolo, config diferente) ou escrever um novo.
4. **Registrar aqui** na tabela — vira conhecimento pra todos os clientes futuros.

## Segurança
- Só conexões de saída; **nunca** expor câmera/dispositivo na internet (sem port-forward).
- Token por instância de agente. Credenciais de dispositivo ficam na config (nuvem), não no chat.
