# Portabilidade INSS no Telegram — todos os contratos e integrações bancárias
Data: 17/11/2026

## Incidente reproduzido
O extrato PDF é reconhecido, com **quatro empréstimos** e cartão de crédito excluído. Porém, o bot exibia a instrução “até três contratos” e rejeitava a lista `1,2,3,4`, apesar de mostrar os quatro contratos. Após a confirmação, o fluxo exclusivamente documental calculava **DAYCOVAL, C6 e PARANÁ** por planilhas, sem consultar o serviço `PartnerSimulationService.run` usado no Portal do Parceiro para oferecer FINANTO, Nossa Fintech e outras integrações.

## Correção
- Responda **TODOS** ou informe números de contratos separados por vírgula, de 1 até o número real de contratos do extrato, com máximo de 13 empréstimos distintos por documento. Não é necessário reenviar o PDF para incluir o quarto.
- O motor `previewPortRefin` ainda recebe **um contrato por vez** para cada instituição `DAYCOVAL`, `C6` e `PARANA`. Portanto, todo contrato selecionado recebe sua própria cotação quando houver condições compatíveis, inclusive o quarto.
- **Unificações Daycoval**: planilha aceita de um a três contratos por cálculo; são testadas combinações de dois/três contratos até o limite operacional de 24. Essa restrição técnica de agrupamento **não limita as simulações individuais** dos contratos.
- Além das planilhas, cada contrato selecionado é enviado ao serviço de simulação **do próprio Portal** com o identificador de origem completo, CPF, número de benefício e dados financeiros previamente extraídos. As mesmas regras de banco, empresa e roteiros permanecem válidas. Só ofertas positivas de APIs são registradas no histórico do parceiro.
- O resultado distingue explicitamente **estimativa documental** (planilha) de **cotação do motor bancário** (API) e identifica a que contrato cada uma pertence. API sem oferta positiva não é interpretada automaticamente como recusa.
- C6 para Port/Refin continua usando a planilha de C6 quando habilitada; o serviço existente não chama a API C6 diretamente nessa modalidade. **Não há implementação nem alegação de uma integração de portabilidade C6 inexistente.**
- O motor oficial é executado com paralelismo máximo de duas consultas de contrato de cada vez para evitar excesso de tráfego bancário. Contratos sem resposta de API recebem aviso específico, sem cotação fictícia.

## Proteção de dados
- Para consultas bancárias autenticadas, a extração agora inclui CPF, NB e número de contrato **somente no estado temporário criptografado do chat**. O PDF original permanece processado em memória, sem persistência de bytes.
- O bot só mostra CPF e números de contrato mascarados; não reproduz dados privados da integração nem os coloca em logs.
- A confirmação da autorização do titular ocorre antes de qualquer consulta bancária. O fluxo verifica se o chat está vinculado a um parceiro ativo da empresa e se há acesso ativo ao Portal. Há proteção contra repetição de mensagens e limite por parceiro/empresa de dez consultas em quinze minutos.
- O estado criptografado com identificadores bancários é descartado da sessão após confirmar a simulação; casos abandonados têm validade lógica de dez minutos e são limpos pelo processo de retenção existente. A retenção física pode durar até a rotina de limpeza, conforme sua frequência.
- O histórico de cotações bancárias positivas segue a política do Portal e guarda os dados financeiros necessários ao acompanhamento. Não é criado contrato nem proposta bancária automaticamente.

## Validação
- Teste de extração textual de quatro contratos com cartão em seção separada.
- Teste de seleção `TODOS`, `1,2,3,4` e até 13, rejeitando índices repetidos/fora de faixa.
- Teste com planilhas simuladas: os contratos 1 a 4 são calculados individualmente em Daycoval, C6 e Paraná; Daycoval testa também combinações de dois/três, incluindo o quarto.
- Teste com motor de APIs simulado: um chamado para cada um dos quatro contratos, incluindo FINANTO e Nossa Fintech, com valores próprios e controle por tenant. Falha em um não descarta os demais.
- Testes de autorização, isolamento multiempresa, apresentação mascarada, webhook e compilação.
- **Pendente:** homologação no Telegram com dados e autorização reais após o deploy READY, comparando resultados com a mesma empresa, planilhas e condições do Portal. A API pode devolver ausência de cotação ou exigir dados/autorizações adicionais; jamais substituir essa ausência por oferta inventada.
