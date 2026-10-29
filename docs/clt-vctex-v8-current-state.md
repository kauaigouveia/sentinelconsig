# VCTEX / V8 — consulta, vínculo e resultado financeiro

## Evidências no código

- O serviço VCTEX reproduzia vínculos repetidos da resposta; o cálculo acrescentava DATA sobre DATA prévio, o worker publicava vínculo e evento-resumo, o formulário genérico criava cartões com campos ausentes e o painel VCTEX repetia os mesmos vínculos.
- A validação local `validateVctexInstallments` lançava "Prazo ou parcela fora dos limites..."; o loop classificava cada recusa como TECHNICAL_ERROR. Isso não prova falha da consulta nem inelegibilidade do trabalhador.
- O acompanhamento V8 mantinha UNKNOWN e bloqueava readyToSimulate mesmo após uma leitura válida de consulta própria SUCCESS. Assim, a passagem de margem para cálculo podia ficar interrompida na orquestração. O adapter financeiro e a normalização já tinham cobertura contratual; não foram trocados hosts, parâmetros ou escalas.

## Alteração

Vínculos VCTEX são consolidados por employmentId dentro da consulta/conexão. CPF, empregador e valor de margem não são chaves de deduplicação. Matrícula e empresa são exibidas somente se retornadas; o painel compartilhado mostra os vínculos exclusivamente na tabela de margem. Eventos e ofertas continuam separados. As ofertas históricas da pré-operação não são rotuladas automaticamente como pertencentes à execução atual.

O cálculo preserva a parcela solicitada e usa o mesmo validador contratual antes de chamar a simulação. Condições fora dos limites não produzem ofertas nem falhas técnicas por tentativa. Seus IDs e parâmetros ficam em conditionRejections no snapshot cifrado da execução, com código OUTSIDE_LIMITS. A interface apresenta um único aviso resumido, preservando a margem e a autorização. Nenhuma consulta antiga é apagada.

A recuperação V8 distingue UNKNOWN da consulta e UNKNOWN de uma tentativa financeira. Margem própria revalidada pode habilitar cálculo; uma tentativa financeira incerta continua sem reenvio automático. Os ledgers persistentes de idempotência permanecem obrigatórios. O estado da simulação é persistido separadamente (RUNNING, OFFERS, NO_OFFERS, FAILED, UNKNOWN), sem apagar a margem em falhas. Ausência de condições ou falha já conhecida não provoca recálculo automático após refresh com os mesmos dados.

## Limites da comprovação

Não foram acessados casos reais, credenciais ou APIs bancárias. As causas acima são caminhos reproduzidos no código atual e testes sintéticos; não constituem diagnóstico conclusivo de uma execução específica de produção. A disponibilidade e o retorno efetivo de ofertas precisam de homologação bancária autorizada com caso legítimo. Margem positiva não garante oferta.

Não há alterações em Oracle, schema, migrations ou configuração de produção. Reversão por revert do commit e publicação normal, preservando consultas e ledgers.

Validação final: 312 testes aprovados em 30 arquivos, um worker por vez; TypeScript sem erros, build e git diff --check aprovados. APIs externas simuladas e persistência injetada, sem banco operacional.
