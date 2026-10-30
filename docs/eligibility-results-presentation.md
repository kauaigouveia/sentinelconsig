# Apresentação estruturada da elegibilidade

## Escopo e causa

A FACTA recebia mensagens já prefixadas pelo backend e o componente adicionava outro `FACTA:`. O painel comum exibia `check.reason`, concatenado a partir de restrições e avisos. A correção é de apresentação: não altera decisões, fórmulas, fontes ativas, APIs bancárias ou regras Daycoval.

## Implementação

- `src/lib/eligibilityPresentation.ts`: modelo normalizado por banco, produto, modalidade, tabela, situação, condições comerciais, restrições, pendências e evidências/fontes. Usa `reasons` e `notices` quando disponíveis; mensagens legadas são tratadas como fallback de apresentação. Dados originais ficam referenciados e não são modificados. Deduplicação visual não apaga evidências distintas. Dinheiro é formatado em pt-BR, sem mudar os valores ou calcular novos limites.
- `src/components/simulation/EligibilityResult.tsx`: componente comum responsivo, claro/escuro; detalhes técnicos recolhidos e montados somente após abertura por perfil autorizado. Divergência não vira reprovação; ausência de dados não vira aprovação. O portal recebe orientações por campos, sem critérios privados ou diagnósticos detalhados.
- `BankPlaybooksPanel.tsx`: todos os destinos do catálogo utilizam o componente. Mantém seleção individual e Todos os bancos. Valida permissão pelo endpoint existente, sem polling; invalida a permissão ao trocar empresa e cancela requisições antigas.
- `FactaSimulationResults.tsx`, `C6SimulationResults.tsx`, `FinantoInssSimulationModal.tsx`, `NossaFintechPortRefinSimulationModal.tsx`, `DaycovalSimulationModal.tsx`, `src/components/partner-portal/PartnerSimulationsView.tsx`: reutilizam a apresentação nos retornos e pendências; mantêm seleção e cálculos existentes. FINANTO utiliza o cartão financeiro comum, preservando o objeto selecionado.
- `OrderedSimulationBanks.tsx`: resultados calculados precedem bancos pendentes quando o chamador informa a prioridade visual; a configuração de ordem bancária desempata. Não muda despacho de integrações ou prioridade operacional.
- `src/lib/portabilityGuide.ts`: projeta somente condições documentadas disponíveis, com contexto explícito para saldo de portabilidade pura e taxas listadas sem inferir faixas contínuas.
- `server/services/bankPlaybookCatalog.ts`: omite `guide.details` sem as permissões cumulativas `audit_logs.view` e `integrations.manage`. Mantém fontes e documentos comerciais existentes. O diagnóstico operacional restrito conserva seu RBAC e filtro pelo tenant da sessão.
- `BankPlaybooksView.tsx`: conflitos técnicos também ficam condicionados à permissão. As alterações locais anteriores nesse arquivo foram preservadas.

## Testes e limites

149 testes aprovados em 16 arquivos, incluindo os 135 da rodada Daycoval e 14 adicionais desta entrega. Após os últimos ajustes visuais, 16 testes de apresentação/painéis foram reexecutados e aprovados, sem somar repetições ao total. TypeScript/lint, build e `git diff --check` aprovados. O build mantém avisos de chunks grandes e imports estáticos/dinâmicos nos componentes CLT, sem falha de compilação.

Arquivos de teste desta entrega: `tests/eligibility_presentation.test.tsx` (13 casos novos) e `tests/portability_guide_catalog.test.ts` (1 caso HTTP novo), além da regressão existente.

Cobertura: múltiplas divergências FACTA, tabelas FINANTO independentes, duplicações, moeda brasileira, valores ausentes, conflitos e pendências, visibilidade por perfil, filtragem HTTP por permissão, mudança de tenant, ordenação visual, DOM responsivo e classes de tema. Um teste compara o resultado do motor antes/depois da normalização e verifica que o objeto não foi mutado. APIs e persistência são mocks nos testes; callbacks HTTP locais preservam sessão e permissões. Sem chamadas bancárias reais, banco operacional ou migrations.

Responsividade e temas foram verificados por DOM/classes CSS. A tentativa de abrir o navegador Codex terminou em timeout; não há screenshots nem homologação visual autenticada declarada nesta rodada. Necessária revisão visual final desktop/mobile no sistema completo antes da publicação.

A aplicação geral possui outros fluxos e mensagens operacionais fora desses componentes: esta entrega não é uma auditoria de todas as mensagens de erro do produto.

## Atualização documental substitutiva separada

O pedido substitutivo de regras cita `Markdown colado(5).md`, mas esse arquivo não estava disponível no caminho Downloads verificado. O anexo de instruções não contém a tabela completa dos 13 bancos. Não se substituíram critérios, não se inventaram valores e não se declarou concluída essa atualização documental. A fonte completa permanece necessária para esse trabalho separado.

## Estado

Alterações locais para revisão. Sem commit, push, merge ou deploy. Trabalho Daycoval e demais arquivos preexistentes preservados.

## Atualização posterior — fonte disponibilizada

O arquivo Markdown colado(5).md foi disponibilizado na rodada seguinte e a substituição foi implementada. O registro de indisponibilidade acima descreve a etapa anterior. Estado atual e pendências: `docs/portability-rules-replacement-20261030.md`.

## Entrega posterior no GitHub

Após a validação local, o responsável autorizou commit e push das alterações relacionadas. Os registros anteriores de entrega local descrevem a etapa anterior; o SHA e o resultado do push são informados na entrega dessa publicação Git. Esta nota não comprova deployment nem homologação bancária real.
