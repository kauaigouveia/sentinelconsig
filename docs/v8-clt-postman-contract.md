# V8 CLT — contrato Postman incorporado

Base: d87f39ad06c37b0074a8e75d3eb73333cdf78b44. Evidência externa: resultados de Postman fornecidos pelo responsável. A execução local usa somente fixtures sintéticas e mocks; não constitui nova homologação bancária pelo Codex.

## Causa-raiz e limites

Os campos financeiros e o endpoint já correspondiam ao contrato: POST https://bff.v8sistema.com/private-consignment/simulation, com installment_face_value OU disbursed_amount, consult_id/config_id e prazo positivo. O mapeamento principal também já era correto. Não atribuir os episódios específicos de produção a um campo/host incorreto sem rastreamento daquele caso.

Três regressões locais foram reproduzidas antes da correção: autoConditions=true substituía uma parcela explícita de 150 pela margem 529,93; a mesma flag transformava Liquid 3000 em Payment 529,93; e o adapter ignorava uma configuração selecionada, tentando outra tabela antes dela, o que podia interromper o fluxo por divergência de configuração na resposta. Essas falhas foram corrigidas sem relaxar consentimento, posse da consulta, autorização ou validação de margem.

## Alterações

- Valor explícito prevalece sobre a flag automática, tanto na validação como no builder do payload. Consulta inicial continua sem exigir parcela/prazo; fallback de condições automáticas só é permitido quando não existe valor solicitado.
- Seletor Configuração V8 usa exclusivamente as configurações da consulta/conexão selecionada. Sem escolha explícita, mantém todas as configurações elegíveis. Configuração não retornada pela conexão é rejeitada sem selecionar outra silenciosamente.
- v8ConfigId percorre formulário, rota validada, request cifrado e reserva de idempotência. Trocar configuração com os mesmos valores não recupera o resultado de outra tabela. Outros bancos mantêm suas chaves e comportamento anteriores.
- Prazo escolhido é enviado exatamente. Todos os prazos expande somente os inteiros positivos válidos retornados na configuração escolhida; zero nunca é enviado.
- A resposta mantém disbursement_amount como único valor liberado; issue_amount, operation_amount e disbursed_issue_amount são informações separadas, sem fallback. Campos de IOF, seguro, referência oficial e configuração continuam mapeados.
- QI é provider solicitado; CELCOIN permanece provider retornado. monthly_interest_rate fica decimal no armazenamento e vira percentual somente na apresentação. CET não é calculado.
- Modalidade/valor solicitado são registrados na oferta e preservados inclusive ao recuperar reservas antigas idênticas. Deduplicação V8 distingue modalidade/valor além dos identificadores, configuração e prazo; regras dos outros bancos permanecem idênticas.
- Erros bancários podem apresentar motivo operacional sanitizado. Não são registrados corpos completos; mensagens com segredos são descartadas, documentos/e-mails/telefones são ocultados. Ausência de oferta/erro não transforma oferta anterior em nova.
- Consulta oficial, ofertas originais e simulações personalizadas continuam separadas. Ver ofertas originais não realiza chamada bancária.

## Evidência sintética fiel aos resultados fornecidos

| Modalidade | Campo enviado | Valor solicitado | Prazo | Parcela retornada | Valor liberado retornado | Taxa |
|---|---|---:|---:|---:|---:|---:|
| Liquid | disbursed_amount | 3000 | 36 | 205,23 | 3000 | 0.0498 -> 4,98% |
| Payment | installment_face_value | 529,93 | 36 | 529,93 | 7746,43 | 0.0498 -> 4,98% |

IDs de consulta, configuração e oferta são sintéticos. IOF/seguro não informados nos exemplos não foram inventados; os testes anteriores de mapeamento desses campos foram mantidos. Também são verificados preservação de margem/originais, recuperação, modalidades distintas, ausência de duplicidade, isolamento tenant/ator, configuração inválida e rejeições sem novo POST.

## Validação final

152 testes aprovados em oito arquivos, executados com um worker: v8_clt_simulation, v8_native_ui, clt_bank_scope, clt_bank_scope_backend, clt_reprice_http, clt_uniform_presentation, clt_journey e clt_journey_ui. TypeScript (npm run lint), build e git diff --check aprovados. Build com avisos de chunks grandes/imports, sem erro.

## Escopo e pendências consolidadas

Nenhum arquivo de adapter FACTA, BMG ou VCTEX foi alterado. Suas pendências de homologação permanecem no relatório docs/clt-final-pricing-review.md; este pacote não as declara resolvidas. Não há schema, migrations, dependências, credenciais ou mudanças no gateway Oracle. Nenhuma proposta/termo/consulta bancária real foi criada nesta validação.

Publicação normal na main apenas após testes afetados, TypeScript, build e diff-check aprovados. Não consultar ou aguardar READY da Vercel. Verificação do deployment e operação real permanecem fora da evidência desta entrega. Reversão por git revert do commit publicado, mantendo históricos e reservas de idempotência.
