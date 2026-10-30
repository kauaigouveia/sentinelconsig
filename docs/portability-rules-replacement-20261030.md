# Substituição das regras de portabilidade INSS — 30/10/2026

## Fonte e precedência

Fonte integral preservada em `docs/sources/portability-inss-replacement-20261030.md` (arquivo recebido: `Markdown colado(5).md`). SHA-256: `698c56ff3ca08b25f79beea0315206a0d9eb8350045a9e67239ddf8c0e41724b`.

A precedência é expressa, autorizada pelo responsável. A data de recebimento é 30/10/2026; a vigência comercial não foi informada e não foi inventada. Escopo exclusivo: INSS, PORT e PORT_REFIN. Novo, refinanciamento comum, CLT, FGTS e SIAPE ficam fora da substituição.

## Bancos atualizados

| Banco | Página | Efeito principal / ressalva |
|---|---:|---|
| DIGIO | 2 | Parcela mínima 70 e troco 250; espécies 32/92 (não herdar 93); saldo mínimo desconhecido. |
| C6 CONSIG | 3 | Saldo mínimo 2.000 somente na portabilidade pura; CORBAN 12 e rede 0; origem adicional de 13 pagas desconhecida. |
| DAYCOVAL | 4 | Parcela mínima 20 e saldo sem mínimo; PAN/Agibank 15, FACTA 24; idade final até 69a11m29d; cálculo por planilha. |
| FACTA | 5 | Saldo geral sem mínimo; pura com mínimo 1.900 e taxa mínima 1,70%; idade máxima e pagas por origem incompletas. |
| HAPPY | 6 | Saldo condicionado à taxa: 4.000/6.000/11.000/13.000 para as quatro taxas explicitadas; não escolher menor valor como padrão. |
| PB Consignado — Paraná Banco | 7 | Paraná Banco, independente do Banrisul; parcela 120, saldo sem mínimo, OP Santander/Itaú em contextos separados. |
| ICRED | 8 | Idade 21 a 62, saldo 3.000 e troco 100; não reutilizar regras de invalidez da versão anterior. |
| BANRISUL | 9 | Idade inicial até 68a11m29d, saldo 5.000, PAN 30; até 5 contratos no refin da portabilidade. |
| HAVECRED | 10 | Idades, saldo mínimo e fórmula de troco incompletos; nenhuma faixa antiga é herdada. |
| FINANTO | 11 | Parcela 50, idade inicial até 68a10m; mínimo de troco por idade/percentual não especificado. |
| NOSSA FINTECH | 12 | Saldo 2.900 e troco 100; idades para 108 e 96 meses conforme a nova fonte; outros prazos pendentes. |
| QUERO BANKING | 13 | Identidade canônica local quero-banking, sem associação a Quali/Quero + Crédito; pagas por saldo, sem mínimo geral inventado. |
| BRB | 14 | Idade final até 80a11m29d; saldo 5.000, troco 100; 32/92 a partir de 60 anos. |

## Regras históricas desativadas neste escopo

- As versões de 19/10 e do suplemento colado(4) não são mescladas com os critérios dos 13 bancos atualizados. A resolução usa exclusivamente o novo registro; campos omitidos continuam desconhecidos.
- Arquivos históricos intactos no Git: `portabilityRules20261019.json`, blob `8c489fe5918255d6d27f108335cae7b2260b8bd7`; `portabilityRulesSupplement.json`, blob `da1a3e25a905a12d5a489370b8fe20fb2a12f99a`. Os hashes do checkout normalizado correspondem a HEAD; o arquivo de 19/10 conserva suas quebras CRLF preexistentes.
- Histórico exportado separadamente como PORTABILITY_ARCHIVE_BOOKS. Catálogo e seções ativos contêm uma versão por banco substituído. Busca de portabilidade e instruções do assistente deixam de priorizar os PDFs/trechos antigos.
- Bancos ausentes (incluindo PAN, Safra, Quali e Quero + Crédito) conservam suas fontes e regras anteriores. Não foi assumida identidade bancária de Quero Banking.
- Helpers secundários recebem modalidade: validações antigas de Novo permanecem, mas não filtram portabilidade por idades, segmentação de nomes ou taxas antigas. Taxas para chamadas FINANTO vêm dos itens/ranges explicitamente retornados pelo catálogo da API, sem gerar grade arbitrária de 1,60 a 1,85.
- Planilha Nossa Fintech mantém coeficientes, IOF e fórmulas financeiras; critérios comerciais locais antigos (saldo 4.000/13.000, taxa mínima de origem 0,80%, expansão/troco percentuais) deixam de gatear a operação. Os mínimos documentados são 2.900/100.
- Planilha Paraná não aplica o antigo teto de idade final de 77 anos nem a antiga exceção de parcela 15 para 32/92; o documento atual não reproduz essas condições. Fórmulas/tabelas do arquivo não foram reescritas.
- O pós-cálculo usa o primeiro vencimento efetivamente calculado e o prazo da oferta para verificar a idade final em planilhas. A regra de prioridade Daycoval abaixo de 50 permanece no backend.

## Dados, permissões e simulações

Foram acrescentados campos opcionais de término efetivo do contrato e confirmação de origem participante da CIP ao formulário complementar INSS, propagados pelo normalizador e JSON existentes, sem schema/migration. Na falta de comprovação, o resultado é pendente. Não se infere data final bancária a partir de prazo isolado quando não há cálculo. Margem disponível positiva não é confundida com déficit; valores de déficit positivos exigem a indicação explícita de margem negativa, ou o valor assinado negativo.

A FACTA mantém ofertas financeiras retornadas e acrescenta policyStatus/policyReview para distinguir oferta calculada de aprovação documental. Condições bloqueadas são descartadas; pendências não são promovidas a elegibilidade definitiva. Não se criam propostas, contratos, autorizações ou retries. Sessão, tenant, promotora, permissões e mecanismos de idempotência permanecem nos fluxos existentes. O acesso aos diagnósticos continua restrito.

## Pendências documentais reais

### DIGIO

- Saldo mínimo não informado na fonte substitutiva.
- Identificador da origem Mais BB não confirmado no cadastro STR.

### C6 CONSIG

- Condições de saldo do refinanciamento não individualizadas.
- Banco com exigência de 13 parcelas pagas não identificado.
- Espécies 32 e 92: condições de idade/benefício não detalhadas.
- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### DAYCOVAL

- Código da origem NBC Bank, que exige 24 pagas, não comprovado.
- Espécies 32 e 92: condições não detalhadas.
- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### FACTA

- Faixas de idade e prazos FACTA não detalhadas.
- Exigências de parcelas pagas por origem e categoria não individualizadas.
- Há origens bloqueadas indicadas somente por logotipo; códigos NBC Bank e Socicred não comprovados.
- Invalidez: condições por idade e espécie não detalhadas.
- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### HAPPY

- Identificador da origem Barigui não confirmado.
- Espécies 32 e 92: condições conforme idade não detalhadas.
- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### PB Consignado — Paraná Banco

- Faixas de idade por prazo e banco com exigência de 12 pagas não individualizados.
- Identificador da origem Barigui não confirmado.
- Condições específicas de idade e espécie não detalhadas.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### ICRED

- Espécies 32 e 92: condições não detalhadas.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### BANRISUL

- Uma origem bloqueada foi indicada somente por logotipo.
- Espécies 32 e 92: condições não detalhadas.
- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### HAVECRED

- Faixas de idade e prazo não detalhadas.
- Saldo mínimo depende de condições de operação não individualizadas.
- Outras origens com 12 pagas e parte das exclusões não identificadas; códigos Barigui e NBC Bank não comprovados.
- Espécies 32 e 92: condições não detalhadas.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### FINANTO

- Origens adicionais com 12 pagas e exclusões indicadas no documento não individualizadas.
- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### NOSSA FINTECH

- Identificadores das origens Barigui e NBC Bank não confirmados.
- Condições específicas de idade e espécie não detalhadas.
- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### QUERO BANKING

- Identidade bancária de Quero Banking não confirmada; não associar a Quali ou Quero + Crédito.
- Outras origens com 12 pagas e exclusões indicadas por logotipo não individualizadas.
- Faixa de invalidez transcrita como 5 anos e 5 meses até 73 anos e 11 meses no término; confirmar interpretação antes de aplicar.
- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

### BRB

- Condições de formalização por idade/UF/alfabetização não completamente individualizadas; aplicadas como pendência quando relevantes.
- Valores separados por barras não comprovam faixa contínua ou correspondência inequívoca à tabela. Nenhum coeficiente/taxa intermediária é inventado.

A faixa de invalidez Quero Banking foi preservada literalmente como 5 anos e 5 meses até 73 anos e 11 meses no término; não foi convertida para 55 anos. A interpretação e a identidade dessa instituição dependem de confirmação. Ausência de informação de SRCC é exibida como não informada, sem presumir realização.

## Arquivos desta atualização

- Dados: `src/data/portabilityRulesReplacement20261030.json`; cópia integral da fonte em `docs/sources/`.
- Motor: `src/lib/portabilityReplacementPolicy.ts`, `portabilityRuleSources.ts`, `portabilityPolicy.ts`, `portabilityEligibility.ts`, `portabilitySimulationPolicy.ts`, `inssEligibility.ts`.
- Roteiros: `portabilityPlaybooks.ts`, `portabilityGuide.ts`, `bankPlaybooks.ts`, `server/services/bankPlaybookCatalog.ts`, `sentinelaToolRouter.ts`, texto de referência em `BankPlaybooksPanel.tsx`.
- Consumidores: guards de `server.ts`, `partnerSimulationService.ts`, `nossaFintechService.ts`, `nossaFintechWorkbook.ts`, `portRefinWorkbooks.ts`, `daycovalRoutes.ts`, mínimo contextual em `portabilityRouting.ts`. Protocolos/hosts/credenciais bancárias e Oracle intactos.
- Interface: `PortabilityReviewFields.tsx`, `FinantoInssSimulationModal.tsx`, `NossaFintechPortRefinSimulationModal.tsx`, indicação documental em `FactaSimulationResults.tsx`; tipo/DTO interno FACTA em `factaSimulationService.ts`.
- Testes: novo `tests/portability_replacement.test.ts`; expectativas históricas substituídas nos testes de suplemento/roteiros/workbook/FACTA; fixtures Prisma/planilha sintéticas corrigidas em `refinancing_rates.test.ts`.

## Validação e estado

Última execução completa: 285 testes aprovados em 22 arquivos (inclui 149 da rodada anterior, regressões adicionais e 74 casos da fonte substitutiva). Os testes históricos que exigiam conflitos ou mínimos revogados foram atualizados para a substituição autorizada; a verificação dos documentos históricos permanece. Testes com mocks antigos em refinancing_rates precisavam da configuração de planilha/Prisma que já era exigida em HEAD; foram corrigidos somente nas fixtures. O teste antigo de saldo Nossa 4.000/13.000 já divergia do helper em HEAD (2.900) e passou a exigir o valor agora documentado.

Executados somente testes locais com fixtures sintéticas/mocks, HTTP local e cálculo real em memória com planilha sintética. Não equivalem a homologação de API bancária real. Não há suíte específica preexistente de SIAPE: a cobertura nova comprova exclusão de escopo; não se declara homologação operacional SIAPE.

Automação operacional Daycoval ainda depende de vigência/compatibilidade da planilha cadastrada e dos dados/documentação pendentes já identificados. Nenhum banco operacional foi consultado ou modificado para validar cadastro. Sem chamadas bancárias reais, migrations, seeds, alterações de credenciais, commit, push ou deploy. Alterações anteriores preservadas; entrega local para revisão.

Validações finais: TypeScript/lint, build e git diff --check aprovados. Após os últimos ajustes, 100 testes afetados e 93 testes de apresentação/catálogo foram reexecutados e aprovados, sem somar repetições aos 285 testes distintos. O build mantém avisos de chunks grandes e imports estáticos/dinâmicos nos componentes CLT.

## Entrega posterior no GitHub

Após a validação local, o responsável autorizou commit e push das alterações relacionadas. Os registros anteriores de entrega local descrevem a etapa anterior; o SHA e o resultado do push são informados na entrega dessa publicação Git. Esta nota não comprova deployment nem homologação bancária real.
