# Recuperação de autorizações CLT — V8 e Nossa Fintech

## Correções

- V8: a rota de autorização valida a posse persistida da consulta por empresa, promotora e CPF da execução. Um snapshot incompleto ou UNKNOWN causado por outra instituição não invalida uma consulta própria. Consulta não vinculada continua retornando 404 antes de qualquer chamada bancária.
- V8: estados oficiais CONSENT_APPROVED, WAITING_CONSULT, WAITING_CREDIT_ANALYSIS e SUCCESS de uma consulta própria e do mesmo CPF são registrados como confirmação observada na API. O registro declara `humanAcceptanceCollected: false`; não fabrica assinatura ou aceite humano.
- Dispositivo: utiliza somente dados disponibilizados pelo navegador. Nome do equipamento e outros campos não expostos continuam exigindo preenchimento real. Não se inventa modelo, sistema ou nome.
- Nossa QI/UY3: toda solicitação verifica primeiro o estado oficial, inclusive a ação AUTHORIZE. AUTHORIZED recupera vínculos e margem; apenas SIMULATE executa cálculo. PENDING reutiliza o link conhecido. Respostas desconhecidas, conflitantes ou indisponíveis não autorizam novo envio.
- Estado e link ficam cifrados, separados por empresa, usuário, promotora e instituição. Expiração elimina o link antigo. POST com resultado incerto conserva sua reserva e não é reenviado automaticamente.
- A chave do cálculo não inclui o horário da observação; atualizar o acompanhamento não cria um novo cálculo apenas por mudar o timestamp.

## Acompanhamento persistente

A fila cifrada usa SystemConfig existente, sem schema ou migration novos. O cron autenticado `/api/cron/partner-simulations` processa no máximo uma leitura ou um cálculo já elegível por execução, com reserva CAS e nova validação de permissões. Não cria consulta nem autoriza consentimento. Resultados UNKNOWN não são reenviados. Metadados da fila expiram em sete dias ou oito tentativas; o histórico e as reservas bancárias permanecem.

O cron existente é **diário** (`0 3 * * *`) e não foi reconfigurado. Portanto, o processamento sem navegador é uma recuperação de retaguarda, com capacidade limitada; não há promessa de acompanhamento contínuo em minutos. Com a jornada aberta, permanece o polling controlado existente. Para maior frequência/capacidade será necessário dimensionar um agendador separadamente.

## Evidência e limites

Testes usam dados sintéticos e mocks de transporte e persistência. Nenhuma chamada bancária real ou consulta a banco operacional foi usada na validação. O contrato Nossa existente utiliza check-authorization por instituição; normalização aceita o mesmo status conhecido, ignorando caixa e espaços e envelope data. Não se presume que um HTTP 200 ou `SUCCESS` genérico seja consentimento. O formato real responsável pelo incidente ainda depende de observação sanitizada autorizada. Não foi inventado webhook: não há contrato de autenticação de callback confirmado neste escopo.

A confirmação visual autenticada e a homologação bancária real continuam separadas dos testes automatizados. Não afirmar operação bancária real aprovada a partir dos mocks.

## Publicação e reversão

Push normal na main autorizado no pedido; nenhum gateway Oracle, schema, migration ou credencial alterado. A reversão é um commit de revert desta alteração, seguido do fluxo normal de publicação. Não excluir dados nem reservas de idempotência. Registros cifrados adicionais são inertes no código anterior; preservar para diagnóstico.
