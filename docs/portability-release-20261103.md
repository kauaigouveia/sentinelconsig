# Portabilidade INSS — atualização recebida em 03/11/2026

## Fonte e precedência
A transcrição integral está em `docs/sources/portability-inss-rules-20261103.md` (SHA-256 `5f86e25bdcef30cf44d4cfc4317e06f78045ed741f94849a4ed8989dc005c836`). A data de recebimento não representa vigência comercial, que não foi informada. Os 13 bancos identificados substituem os respectivos critérios anteriores; bancos não mencionados preservam sua própria fonte. PB Consignado/Paraná Banco permanecem uma instituição distinta de Banrisul.

A nova fonte Daycoval proíbe portabilidade pura e informa idades máximas por prazo de 70/71/72 anos para 108/96/84 meses, substituindo o esclarecimento anterior arquivado. Não se herdam tetos contratuais ausentes da nova fonte. Restrições de UF de formalização permanecem documentadas, sem serem usadas como bloqueio geral de cálculo.

## Cálculo e segurança
Daycoval, C6 e Paraná utilizam os interpretadores de planilhas existentes em rotas autenticadas de cálculo, sem proposta ou escrita de negócio. A disponibilidade, versão, vigência e capacidade da planilha continuam verificadas. Daycoval tenta os prazos disponíveis em ordem decrescente, limitados ao solicitado, e apresenta somente o primeiro prazo com cálculo válido. Paraná conserva suas taxas oficiais e requer o total de contratos do benefício para as regras que dependem dele.

Dados financeiros brasileiros são normalizados; parcelas pagas podem ser obtidas de prazo original menos restantes. Pendências documentais são separadas de entradas inválidas e de restrições confirmadas, sem converter cálculo em aprovação bancária. A resposta FACTA HTTP 200 é interpretada pelo conteúdo, sem tratar resposta vazia/inválida como oferta. Alterar credenciais FACTA exige intenção explícita no formulário e backend, preservando senhas já armazenadas quando o campo fica vazio.

## Lacunas preservadas
- Instituições indicadas somente por logotipos e faixas não individualizadas não recebem códigos ou limites presumidos.
- FACTA não detalha idade/prazo e a associação das exigências de 12 a 50 parcelas pagas.
- ICRED não detalha todas as condições da exceção por invalidez a partir de 55 anos.
- HAVECRED e QUALI não individualizam completamente a alternativa de troco fixo/percentual.
- FINANTO não especifica exatamente 41 parcelas; seus 2% utilizam o novo endividamento, nunca o saldo antigo como substituto.
- Taxas listadas sem associação inequívoca não geram coeficientes ou fórmulas inventados.

## Validação e publicação
Testes usam dados sintéticos, mocks e interpretadores locais. Nenhuma chamada bancária real, migration, seed ou alteração de banco operacional é necessária. O push não comprova homologação bancária nem conclusão do deployment.

Verificações locais: 375 testes aprovados em 33 arquivos (`node scripts/testing/run.mjs safe --reporter=dot`); TypeScript (`npm run lint`); build (`npm run build`); `git diff --cached --check`. O runner seguro do Lote 0 permanece local e não integra esta publicação. O build mantém o aviso de bundles maiores que 500 kB.
