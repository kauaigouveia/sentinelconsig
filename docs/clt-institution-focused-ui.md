# CLT — detalhes por instituição e comparação separada

## Causas verificadas no código publicado c9698e4

- A seção de margem e a tabela recebiam o snapshot completo; a escolha do banco controlava apenas alguns painéis. Isso permitia visualizar condições de outras integrações dentro dos detalhes da instituição selecionada.
- QI/UY3 não possuíam uma identidade canônica compartilhada entre projeção e interface. O catálogo aceita os códigos de string retornados pela API; entradas ausentes ou não identificadas não produziam uma explicação por subinstituição. Não foi consultado um caso real para afirmar quais códigos o banco retornou no incidente.
- Os botões de atualização/cálculo do componente V8 competiam com as ações gerais.
- O recálculo individual reutilizava a lógica de nova combinação global e podia limpar ofertas dos outros bancos. Os parâmetros também eram globais, contaminando a retomada financeira de outra instituição.

## Organização final

A lateral compacta mostra nome, status e quantidade de ofertas. A direita contém exclusivamente a instituição selecionada: cabeçalho, Atualizar status, margem, parâmetros, Simular condições e ofertas. A comparação geral é uma visão explícita separada, limitada a três condições.

`cltInstitution` usa IDs de partição e aliases exatos conhecidos, nunca correspondência aproximada de nome. Respostas novas carregam origem canônica: providerId, subInstitutionId, connectionId, consultationId e executionId, quando esses valores são disponíveis. O backend recusa origem incompatível em vez de renomear dados financeiros. Históricos anteriores continuam sendo lidos pela partição canônica em que foram persistidos.

Nossa Fintech apresenta QI Tech e UY3 separadamente mesmo sem oferta. Quando uma subinstituição não é retornada/identificada, a linha explica a ausência, sem margem, autorização ou identificador fictícios. Nenhuma chamada é criada para preencher essa linha. Códigos conhecidos como qi e QITECH são normalizados apenas pela tabela explícita de aliases; o código efetivamente enviado ao banco continua sendo o retornado pelo catálogo. Aliases duplicados do mesmo catálogo não geram chamadas duplicadas. Autorização QI continua distinta da UY3.

## Processamento independente

Cada resultado conserva os parâmetros e o ID da própria execução. Recalcular Nossa com R$ 200 preserva FACTA/V8 e mantém a consulta raiz do mesmo cliente. A observação e o cálculo automático usam os parâmetros da instituição, sem herdar o valor digitado em outro banco. A comparação mostra as condições atuais de cada instituição, não uma união de históricos arbitrários.

Trocar de banco não inicia consulta nem apaga resultados. Workers existentes permanecem montados e podem acompanhar o estado em segundo plano; sua interface retorna null quando não selecionada. A identidade do worker VCTEX usa a raiz, evitando reinício por um cálculo em outro banco. Retornos tardios de uma execução de preços anterior não são incorporados aos parâmetros novos. Reservas persistentes de idempotência são preservadas.

A atualização secundária usa observação de referências existentes. Na VCTEX, a leitura é refresh(..., false), sem criar pré-operação, termo ou assinatura. Cálculo personalizado não renova autorizações. As etapas adicionais indispensáveis ficam no fluxo específico do banco; ações redundantes de atualização/cálculo V8 foram retiradas.

A preparação automática do dispositivo V8 e sua auditoria permanecem ativas. Somente a exibição dos controles acompanha a seleção; não se transforma operação da API em comprovação de aceite humano.

## Validação

Regressão final: 299 testes aprovados em 30 arquivos, com um worker por vez. TypeScript, build e git diff --check compõem a barreira de publicação. Testes usam dados sintéticos, APIs simuladas e persistência injetada. Cobrem: QI pendente + UY3, QI ausente na resposta, bloqueio de origem VCTEX em Nossa, comparação separada, troca de banco sem POST, atualização por GET, R$ 200, preservação de outros resultados e parâmetros após reinício, isolamento de empresa/usuário, origem incompatível e rejeição de retorno financeiro tardio.

Testes de responsividade verificam a interface em larguras desktop/mobile. Isso não é homologação com banco real nem inspeção autenticada de dados operacionais em produção. Não houve chamadas bancárias reais no desenvolvimento.

## Publicação e reversão

Push normal na main após testes, TypeScript, build e diff-check, conforme autorização. Nenhuma alteração em Oracle, credenciais, schema, migrations ou configuração de produção. A rota VCTEX recebeu somente proteção contra associação de preços a parâmetros antigos; transporte e contratos bancários permanecem os existentes.

Reversão por commit de revert e publicação normal. Não remover registros de consultas, resultados ou reservas de idempotência.
