# Paraná Banco — Crédito Trabalhador

Fonte: documentação OAS enviada pelo usuário em 15/10/2026 (API Crédito Trabalhador v1.0.0).

## Implementação

Painel na tela CLT existente, sem nova tela ou escolha de promotora. Usa exclusivamente conexões habilitadas da empresa autenticada, com ambientes separados e a autenticação OAuth existente. Todos os endpoints CLT estão na raiz do host; não usam `/consignado-cartao`.

- POST /v1/consentimentos: produto CreditoTrabalhador, CPF, nome, DDD de dois dígitos, telefone de nove dígitos, origem Link, enviarSms false; aceita HTTP 202/208.
- POST /v1/consentimentos/status: exibe o status exatamente como retornado, sem inventar um enum de aceite.
- POST /v1/elegibilidades: guarda em contexto criptografado o ID retornado, CPF, empresa, conexão e configuração utilizada.
- GET /v1/elegibilidades/{id}: só disponibiliza condições com status Concluido e vínculo elegivel true.
- POST /v1/simulacoes: valores, prazo e taxa validados contra a condição recebida; envia parcela OU valor solicitado com margem disponível. Exibe apenas simulações Novo CLT válidas, com código externo, valores, parcelas, taxa e CET reais.

O contexto usa AES-GCM e expiração técnica local (1h para consulta pendente; 15min para seleção elegível), não altera a validade comercial informada pelo banco, não é salvo no armazenamento local do navegador e é invalidado se a conexão mudar. Sem migrations, seeds ou gravações de teste em produção.

## Limitações explícitas

O trecho fornecido não inclui os estados possíveis de consentimento após aceite nem a origem de codigoDaRegra. O status não é traduzido em aprovação. A autorização da consulta é validada pelo banco; o sistema só permite simular após elegibilidade concluída com vínculo elegível. O código da regra deve ser informado a partir de orientação do banco e nunca é inventado nem substituído por idHistoricoAvaliacao. A documentação enviada não inclui cadastro/formalização de proposta CLT: esta entrega consulta e simula, não contrata. Validação com credenciais reais permanece pendente.
