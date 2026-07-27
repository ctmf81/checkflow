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

## 9. Decisões FECHADAS
Endpoint genérico · sensor+câmera no v1 · pedido→resposta com janela · não-conforme
gera plano de ação · sem resposta = só alerta · `modo` escolhido no início · câmera é
fonte (reusa IA-foto) · há **tempo máximo de resposta** (janela) e o que não responder
vira **"sem resposta automática" + motivo**.

## 10. Decisões TÉCNICAS a fechar no início do desenvolvimento
- **Executor "sistema"** na execução (hoje toda execução tem `usuario_id`): usar
  `origem = automatica` + `usuario_id` nulo? Como aparece no funil/histórico? (mexe em
  modelo + RLS + relatórios).
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
