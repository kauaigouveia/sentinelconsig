# FACTA CLT — seleção de vínculo e matrícula

Correção independente do Lote 2, baseada na main publicada `da2ed71706ecc38909e2085c8ca83f6287c4fecb`, branch `codex/facta-clt-employment-fix`. Sem migrations, banco operacional ou chamadas bancárias reais.

## Causa comprovada no código

O retorno `dados_trabalhador.dados[].matricula` era preservado na normalização e exibido no cartão; não foi encontrado fallback que inventasse `1` nem conversão da matrícula para índice de lista. Entretanto, o botão de seleção guardava apenas `employerDocument`. O estado do formulário, os endpoints interno/portal e `ProductSimulationInput` não transportavam a matrícula selecionada. A nova consulta filtrava por empregador e processava todos os vínculos correspondentes. Dois vínculos com o mesmo empregador apareciam selecionados simultaneamente e podiam gerar políticas para matrículas diferentes da escolhida.

A correção transporta `factaRegistration` separadamente do documento do empregador. O backend usa esse valor somente como seletor, comparando-o exatamente com uma nova resposta autorizada da FACTA. A política usa os dados do vínculo retornado, não dados de empregador/renda enviados pelo navegador. Matrículas com zeros à esquerda e alfanuméricas não são convertidas em números, completadas ou substituídas.

Seleção desatualizada, múltiplos vínculos sem escolha inequívoca ou matrícula ausente geram uma pendência específica da FACTA antes da consulta de operações/política. Clientes legados sem o campo novo continuam podendo simular quando a consulta retorna um único vínculo inequívoco. Alterar cliente/empregador ou atualizar os dados elimina a seleção anterior. O Portal recebe o mesmo campo, incluindo-o na comparação de tentativas idempotentes.

Não foram consultados payloads operacionais. Portanto, a diferença específica entre a matrícula `1` vista pelo usuário e a identificação iniciada por `0001700031` na mensagem do banco não foi reproduzida com o cliente real. Não há evidência para afirmar que esses dois valores sejam equivalentes. Se o banco retornar `1`, o sistema deve preservar `1`, nunca fabricar o outro identificador. Uma inconsistência entre a resposta autorizada e a política do banco exige conferência sanitizada com a FACTA, sem troca automática de matrícula.

## Contrato conferido

- [Crédito do Trabalhador v9.0](https://webservice-homol.facta.com.br/documentacao/assets/Manual-do-WebService-FACTA-v9.0-CREDITO-TRABALHADOR.pdf), páginas 5–8: análise de política exige `matricula` varchar(100), CPF, nascimento, admissão, prazo e valor do empréstimo. Consulta de operações documenta `opcao_valor=2`, `valor_parcela`, renda e os demais parâmetros CLT; não lista matrícula. Não acrescentamos esse parâmetro ao endpoint de operações por tentativa e erro.
- [Consulta Dados do Trabalhador v2.0](https://webservice-homol.facta.com.br/documentacao/assets/Manual-do-WebService-FACTA-v2.0-CONSULTA-DADOS-TRABALHADOR.pdf), páginas 5–6: consulta autorizada retorna uma lista de vínculos, cada um com `matricula` e `numeroInscricaoEmpregador` separados.

O portal de documentação de produção retornou HTTP 500 nesta execução; os manuais oficiais foram acessados no host de homologação. Não houve autenticação ou consulta de CPF em nenhum host bancário.

## Parcela e erros

O `CurrencyInput` e `normalizeBrlInput` existentes já convertem `1423,98`, `1.423,98`, `1423.98` e `R$ 1.423,98` para `1423.98`. Não foi alterado o conversor nem imposta margem artificial. Testes do formulário confirmam seleção e valor entre Cliente, Condições e Resultados e ao retornar às condições. A operação recebe `valor_parcela=1423.98`, separadamente da margem disponível e da renda do vínculo. Erros do banco permanecem específicos; o erro de matrícula não vira erro de margem. A orquestração mantém os resultados dos demais bancos.

## Validação

Todos os testes utilizam fixtures sintéticas e chamadas bancárias simuladas. Os testes HTTP executam os callbacks atuais extraídos do AST de `server.ts`, em Express, com dependências injetadas; não importam o bootstrap completo nem comprovam autorização ou aceitação real da FACTA.

- `facta_clt_employment.test.ts`: 20 casos de matrícula textual/numérica, zeros, alfanuméricos, vínculo único/múltiplo, ausência/seleção desatualizada, consulta atual, payload e serialização de URL, margem separada, aprovação/recusa e isolamento das falhas por banco.
- `facta_clt_selection_ui.test.tsx`: 6 casos com formulário real e endpoints simulados, quatro formatos monetários, seleção independente de matrículas do mesmo empregador e transição de etapas.
- `facta_clt_route.test.ts`: 7 casos HTTP cobrindo encaminhamento interno/portal, IDs malformados, 401/403 e rejeição antes dos provedores/persistência.

A regressão ampliada inclui testes antigos de FACTA/CLT/FGTS, moeda, cartão do cliente, Chat e segurança de Propostas. As suítes antigas `facta_simulations` e `product_simulations` apresentam 12 falhas preexistentes: 11 de portabilidade INSS por fixtures sem banco de origem/taxa compatível e uma expectativa antiga do seletor visual. Uma cópia limpa da main publicada reproduziu as mesmas 12 falhas (50 aprovados nesses dois arquivos). Não foram alterados esses testes nem as regras de portabilidade para ocultar as falhas. Relatórios JSON e logs ficam em `%LOCALAPPDATA%\SentinelConsig\facta-clt-fix`.

Resultado consolidado: **245 testes, 233 aprovados, 12 falhas preexistentes, zero pendentes e zero falhas novas**. Os 33 casos novos passaram. A comparação dos nomes das falhas com a base é idêntica. Dois casos novos foram ainda executados contra a versão publicada: reproduziram a perda da seleção e a aceitação de matrícula diferente da escolhida; ambos passam na branch corrigida.

Nenhum resultado com mock equivale a homologação bancária real. A validação de uma resposta específica de produção permanece dependente de autorização explícita e evidências sanitizadas.

TypeScript (`tsc --noEmit`), build completo (`prisma generate`, Vite e esbuild) e `git diff --check` aprovados. O build recebeu URL sintética somente no processo; nenhuma conexão de banco foi necessária. A revisão dos componentes verificou estado funcional, preservação da seleção e compatibilidade dos callbacks, sem reestruturação visual ou dependências novas.

## Arquivos alterados

| Arquivo | Alteração |
| --- | --- |
| `server.ts` | Valida e transporta a matrícula nas rotas interna e portal; compara a matrícula nas tentativas idempotentes do portal. |
| `server/services/productSimulationService.ts` | Acrescenta o seletor opcional FACTA ao tipo de entrada. |
| `server/services/factaSimulationService.ts` | Revalida o vínculo exato, bloqueia ambiguidades/ausência e usa a matrícula textual na política. |
| `src/components/simulation/CltCustomerDataCard.tsx` | Seleciona e sinaliza matrícula FACTA separadamente do empregador. |
| `src/components/simulation/ProductSimulationModal.tsx` | Preserva o seletor entre etapas e o envia ao servidor. |
| `src/components/partner-portal/PartnerSimulationsView.tsx` | Mantém o mesmo contrato no portal que usa o cartão compartilhado. |
| `tests/facta_clt_employment.test.ts` | Regressões do serviço/payload, sem chamadas reais. |
| `tests/facta_clt_selection_ui.test.tsx` | Regressões do formulário e moeda. |
| `tests/facta_clt_route.test.ts` | HTTP sobre callbacks atuais com dependências simuladas. |
| `docs/facta-clt-employment-fix.md` | Contrato, causa, evidências, limitações e reversão. |

## Revisão e reversão

Alterações limitadas aos formulários CLT compartilhados, transporte do seletor nas duas rotas, serviço FACTA, tipo de entrada e testes/documentação. Sem alteração do schema, migrations, credenciais ou configuração de produção. As branches de Chat, Lote 2 e piloto foram preservadas. O commit deve permanecer local até autorização de publicação.

Após commit, a reversão pode ser feita por `git revert <SHA-da-correcao>` na branch específica. Não existe migração ou procedimento de reversão do banco.
