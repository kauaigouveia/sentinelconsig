# Integração documental de portabilidade — 30/10/2026

## Escopo e fontes

- Base: `612935695b7ff09be4ccf09f0e42e6831debe51d`, main.
- O arquivo `src/data/portabilityRules20261019.json` foi preservado integralmente.
- `src/data/portabilityRulesSupplement.json` incorpora a transcrição fornecida em `Markdown colado(4).md`, seu SHA-256, as páginas indicadas pelo usuário, campos e critérios dos nove bancos solicitados.
- Recebimento em 30/10/2026 não significa vigência. O complemento não informa vigência nem precedência sobre 19/10/2026. Não foi presumida atualização comercial apenas pela ordem de recebimento.
- Não se consultaram bancos, clientes, credenciais nem dados operacionais. Não se ativaram integrações e não se criaram endpoints bancários.

## Política de comparação

Os critérios não conflitantes são incorporados ao motor existente. Restrições adicionais históricas não contraditas são preservadas (inclusive espécie e formalização). Exclusões concordantes continuam definitivas. Listas de origens divergentes ficam pendentes para a origem afetada. Limites mínimos distintos preservam a exclusão comum: abaixo de ambos, não elegível; a divergência permanece registrada. Limites máximos de idade de ambas as fontes são conferidos para não liberar um caso rejeitado por ambas.

Sem prioridade documental, um critério controverso não decide sozinho uma aprovação ou rejeição definitiva. O resultado informa fonte, pendências, razões e `ELEGÍVEL`, `NÃO ELEGÍVEL` ou `PENDENTE DE DADOS`. Isso não equivale a aprovação do banco.

### Divergências que dependem de confirmação documental

| Banco | Exemplos principais |
| --- | --- |
| FACTA | Pura permitida no roteiro anterior e vedada no complemento; refin 1,68% versus 1,70%/1,80%; portabilidade e limites de idade diferentes; PAN aparece duas vezes, com 15 e 30 pagas no próprio complemento. |
| C6 | Idade mínima/máxima, rede com zero ou uma paga, taxas, redução, margem negativa e agregação diferem. A repetição de FACTA com 13 pagas não foi contada como regra adicional. |
| DIGIO | Taxas, parcela mínima, prazos/idade e origens excluídas diferem. O saldo antes ausente agora é individualizado por aposentado/pensionista; sem essa categoria permanece pendente. Espécies 32/93 históricas não foram substituídas por suposição. |
| PB/Paraná | FACTA constava na exclusão anterior; o complemento lista Barigui/Mercantil. Idade, parcela mínima, agregação, redução e taxas divergem. A condição de portabilidade pura “acima de 500” não identifica inequivocamente a base do limite. |
| Banrisul | Idades, origens excluídas, pagas, agregação e mínimos/taxas diferem. Continua independente do Paraná (254); Banrisul é 041. |
| Daycoval | Pagas, origens, idade, unificação, margem e taxas diferem. A base de TKT 20 mil não foi presumida como saldo, bruto ou troco. |
| Safra | Entrada complementar sem equivalente no catálogo de 19/10. As taxas condicionadas a 10/20 mil exigem enquadramento comercial confirmado. |
| Quero + Crédito | Entrada própria, sem confusão com Quali. Código 001 mantido como recebido; participação na CIP precisa ser confirmada. |
| PAN | Entrada própria no catálogo; mantém limites documentados e exceções por origem. Ausência de parcela mínima/SRCC no material não foi preenchida com valores fictícios. |

As taxas enumeradas não foram transformadas em uma faixa contínua de taxas permitidas. Não houve criação de fórmula para a regra TKT ou para a condição “acima de 500”.

## Simulação e interface

- PB CONSIGNADO, PARANÁ BANCO e BANCO PARANÁ resolvem para `parana`, inclusive como origem; não se associam ao Banrisul.
- A normalização percorre todos os contratos. Dados de um contrato não preenchem silenciosamente o banco/saldo/parcela ausentes de outro.
- Uma restrição confirmada impede a chamada daquele destino e deixa os demais prosseguirem. Falhas são isoladas, sem retry novo de operação bancária ou mecanismo de autorização automática.
- A seleção de integrações/configuração por empresa e o RBAC existentes foram preservados. As regras documentais, sozinhas, não tornam uma API habilitada. Nenhuma API foi adicionada para bancos que têm apenas roteiro.
- O painel existente permite filtrar um banco ou Todos os bancos e mostra os três estados e motivos. Os resultados do comparador recebem o enquadramento e as condições documentais.
- As planilhas preservam o resultado calculado para análise, mas não marcam uma condição pendente como liberada para registro automático. Não se confundem saldo devedor e troco.
- Uma pendência de enquadramento não representa aprovação. Retornos de integrações já habilitadas podem ser comparados sob análise; continuam sujeitos às validações de dados, permissões e contratos dos adapters existentes.

## Validação

Dados sintéticos, APIs/dependências bancárias simuladas. Os testes cobrem regras, fontes, aliases, idade inicial/final, pagas, mínimos, margem/unificação, contratos múltiplos, UI, continuidade após rejeição, falha isolada sem retry e seleção de configuração por tenant. Testes HTTP do painel de roteiros verificam autenticação, permissões e tenant do servidor.

O teste legado do exemplo CIP com saldo R$ 1.500 passou a verificar rejeição antes da chamada: o documento integrado exige R$ 2.000. O teste do catálogo foi atualizado para comparar as fontes reais, sem presumir doze livros ou páginas PDF inexistentes. Os demais testes FACTA permanecem preservados.

Resultado final: 77 testes aprovados em oito arquivos, incluindo os 44 testes FACTA do arquivo afetado; lint/TypeScript (tsc --noEmit), build e git diff --check aprovados. O build mantém o aviso de chunks acima de 500 kB. As verificações finais de lint/build foram sequenciais para evitar a leitura de assets durante sua regeneração. Isso não constitui homologação bancária real. Nenhuma migration, seed, alteração de schema, nova infraestrutura ou operação financeira foi executada.

## Publicação e reversão

Push normal na main, somente após verificações aprovadas e nova conferência da referência remota. Não aguardar READY da Vercel. Reversão por `git revert` do commit de integração, preservando histórico e sem alteração de banco de dados.

## Arquivos do pacote

- Motor/fontes: `src/lib/portabilityPolicy.ts`, `portabilityEligibility.ts`, `portabilitySimulationPolicy.ts`, `portabilityRuleSources.ts`, `portabilityPlaybooks.ts`, `bankPlaybooks.ts`; `src/data/portabilityRulesSupplement.json`.
- Simulação: `server/services/partnerSimulationService.ts`, `server/services/portRefinWorkbooks.ts`.
- Interface: `src/components/simulation/BankPlaybooksPanel.tsx`, `DaycovalSimulationModal.tsx`, `src/components/partner-portal/PartnerSimulationsView.tsx`.
- Testes: `tests/portability_supplement.test.ts`, `portability_dispatch.test.ts`, `portability_supplement_ui.test.tsx`, `portability_workbook_policy.test.ts`, `portability_playbooks.test.ts`, `facta_simulations.test.tsx`.
- Documentação: este relatório. Total: dezenove arquivos; nenhum schema, migration, arquivo de credenciais ou configuração operacional.
