# Planejamento — Checklist automático por IoT / IA

> **Passo 1 do processo** (`docs/ops/PROCESSO_NOVA_FUNCIONALIDADE.md`): registrar a
> necessidade, escopo, o que reusa, as tabelas/migrations pensadas e as decisões —
> **antes** de escrever código. Documento de desenho; ainda não é implementação.

## 1. Necessidade

Um checklist que **roda sozinho** (agendado) e, em vez de entrada manual do usuário,
tem cada atividade preenchida pela **saída de um dispositivo** — termômetro, sensor,
câmera (imagem interpretada por IA). É o "retrato do momento" coletado por máquina.

## 2. Escopo do v1 (decidido com o usuário)

- **Ingestão por endpoint genérico** (`POST /iot/leitura`) — não amarra a fornecedor;
  qualquer gateway/ESP32/Zapier/n8n/câmera envia pelo mesmo contrato.
- **Sensor numérico E câmera+IA** juntos (o pipeline é o mesmo; são duas "pontas").
- Modelo **pedido→resposta com janela** (não amostragem passiva).
- Não-conforme **gera plano de ação sozinho**; "sem resposta" **só alerta**.

## 3. O que REUSA (já existe no CheckFlow)

| Peça | Componente atual |
|---|---|
| Rodar na hora marcada | Agendamentos: `agendamentos_processar()` + cron `/cron/agendamentos/processar` |
| Atividade que recebe número | tipo de atividade `numero` |
| Interpretar imagem por IA | `interpretar-foto` + `ia_prompt` da atividade → devolve texto/sim_nao/numero |
| Não-conforme → plano de ação | fluxo de plano de ação (flag `gera_plano_acao`) |
| Avisar (alerta) | WhatsApp / push / e-mail |
| Gatear por plano + contar tokens IA | características/serviços + `billing_pode_consumir_ia` |

## 4. Peças NOVAS

1. **Ingestão** — `POST /iot/leitura` autenticado por **token do dispositivo** (não é
   login de usuário) + onde guardar a leitura.
2. **Registro de dispositivos** — tela pra cadastrar dispositivo e gerar/rotacionar token.
3. **Execução automática sem humano** — o agendamento, ao disparar, conduz o ciclo
   pedido→resposta e conclui a execução sozinho.
4. **Avaliação de conformidade por faixa** (sensor) e o desfecho "sem resposta".

## 5. Modelo de dados (esboço — migrations ADITIVAS)

```
dispositivos          empresa_id, unidade_id, nome, tipo [sensor|camera],
                      token (hash), ativo, ultima_leitura_em
solicitacoes_leitura  execucao_id, atividade_id, dispositivo_id, janela_ate,
                      status [pendente|respondida|sem_resposta], criado_em
dispositivo_leituras  solicitacao_id, dispositivo_id, valor_numerico | imagem_url,
                      recebido_em    ← só vale amarrado a uma solicitação aberta
atividade  (+campos)  entrada_automatica, dispositivo_id, faixa_min, faixa_max
                      (câmera reusa o ia_prompt que já existe)
checklist (+campo)    modo [manual | automatico]   ← ver §7
agendamento (+campo)  janela_resposta_min          ← tempo máximo de resposta
```

## 6. Fluxo ponta a ponta (pedido→resposta, retrato do momento)

```
1. Agendamento dispara → cria a execução + uma solicitacao_leitura por atividade,
   com janela_ate = agora + janela_resposta_min.
2. Dispositivo pergunta "tem coleta pendente?" (GET /iot/pendencias, com token) →
   vê as solicitações abertas → COLETA AGORA → POST /iot/leitura {solicitacao_id, ...}.
3. Só vale a leitura amarrada à solicitação do momento. Valor/foto avulso (antes do
   disparo) → sem solicitação → ignorado.
4. Ao responder: número entra direto; imagem → IA-foto interpreta.
   Avalia a faixa → conforme / não-conforme.
5. Fim da janela (tudo respondido OU janela_ate vencido):
   - não-conforme → registra + **gera plano de ação** + alerta
   - sem resposta  → status sem_resposta + motivo + **alerta (SEM plano de ação)**
6. Execução concluída — sem ninguém ter tocado.
```

## 7. Não poluir a criação do checklist manual (90%+ do uso)

- O checklist tem um **`modo`** escolhido **no início**: **Manual** (padrão, idêntico
  ao de hoje) ou **Automático (IoT/IA)**.
- Os campos novos (dispositivo, faixa, janela) **só aparecem no montador quando é
  Automático**. O fluxo manual não muda em nada — quem faz os 90% nem vê.

## 8. Câmera = FONTE, não tipo novo

A IA-por-imagem já devolve texto/sim_não/número. Então a "fonte automática" de uma
atividade é **sensor** (número direto) **ou** **imagem+IA** (interpreta e preenche
qualquer tipo de saída — texto cujo input é uma foto, câmera que vira sim/não, etc.).
Reusa a IA-foto; não precisa de um tipo de atividade novo.

## Arquitetura do agente (1 software, N instâncias)

O agente **precisa rodar na rede local** do cliente (pra alcançar os dispositivos
atrás do firewall). Portanto:

- **Um único software** de agente; **uma instância por local** do cliente. A
  sorveteria roda a sua, a farmácia a dela — **mesmo programa**, tokens diferentes.
  Cada instância só enxerga os dispositivos daquele lugar.
- **Cliente novo = configuração, não código** (se os dispositivos usam drivers já
  suportados): instalar o agente + parear com um código + cadastrar os dispositivos
  no CheckFlow.
- **Drivers plugáveis por tipo de dispositivo** (RTSP, ONVIF, HTTP, Modbus, MQTT…).
  Um driver feito **uma vez** serve **todos** os clientes com aquele tipo → o esforço
  amortiza **por tipo de dispositivo, não por cliente**. Do 3º cliente em diante, se
  usa dispositivos já suportados, o dev é ~zero (só instalação).
- **Config vinda da nuvem**: o cliente cadastra os dispositivos no CheckFlow (qual
  câmera/sensor, como alcançar); o agente **puxa** essa config e obedece. Gestão pela
  tela, sem tocar no agente instalado.
- **Custo escondido (produto/ops)**: instalação/pareamento fácil pro cliente
  não-técnico — appliance pré-configurado (Raspberry Pi), container, ou instalador
  com código de pareamento. Não é só código.

## Drivers do v1 e esforço (relativo)

Prioridade = o que cobre o mercado de **cadeia de frio / food safety / farma**
(sorveteria, restaurante, frigorífico, farmácia).

| Driver | Cobre | Esforço | Retrato do momento |
|---|---|---|---|
| Câmera **HTTP snapshot** | câmeras pro com URL `.jpg` direta | **Baixo** (já no protótipo) | GET agora |
| Câmera **RTSP + ffmpeg** | iC5/Mibo e maioria das IP | **Médio** (tirar 1 frame) | frame do momento |
| Sensor **HTTP/JSON** | sensores/gateways com endpoint HTTP | **Baixo** | GET agora |
| Sensor **Modbus TCP** | temp/umidade industrial (cadeia de frio) | **Médio** (lib + mapa de registrador) | read agora |
| Sensor **MQTT** | IoT que publica em broker local | **Médio** | ⚠️ pega o último valor — checar frescor / pedir leitura |

**Fora do v1 (cauda longa)**: Serial/USB, BLE, 1-Wire, descoberta ONVIF automática.

> Leitura de esforço: o investimento inicial é construir os ~5 drivers acima **uma
> vez**. Depois, cada cliente novo com esses dispositivos é só instalar. Dispositivo
> exótico = um driver novo (reutilizável).

## 9. Decisões FECHADAS
Endpoint genérico · sensor+câmera no v1 · pedido→resposta com janela · não-conforme
gera plano de ação · sem resposta = só alerta · `modo` escolhido no início · câmera é
fonte (reusa IA-foto) · há **tempo máximo de resposta** (janela) e o que não responder
vira **"sem resposta automática" + motivo**.

## 10. Decisões TÉCNICAS a fechar no início do desenvolvimento
- ✅ **DECIDIDO — Executor = `automatico`**: a execução nasce com `origem =
  automatico` e sem `usuario_id` humano. Falta detalhar como aparece no
  funil/histórico e o ajuste de RLS (execução criada pelo sistema).
- **Auth do dispositivo**: formato do token, rotação, escopo (1 token por dispositivo).
- **Poll**: intervalo e contrato do `GET /iot/pendencias`; segurança (rate limit, replay).
- **Imagem**: upload multipart vs URL; retenção (conta na cota de armazenamento?).
- **Entitlement**: vira uma **característica nova gateada por plano** (tipo a `ia`).
  Câmera consome tokens de IA (já contados por `billing_pode_consumir_ia`).

## 11. Fora do v1 (v2+)
Integração direta com plataformas IoT de fabricante; ambientes de preview por
dispositivo; regras de faixa mais ricas (tendência, média móvel); reprocessar
execução automática que falhou.

## 12. Definition of Done
Rodar o `/golive` (permissão/perfil/RLS/entitlement/billing/mobile/testes) + testar no
`web-dev` com um dispositivo simulado (um `curl` fazendo o papel do sensor/câmera).
Migrations **aditivas** (ver §0 do processo). Deploy numa **quarta**.
