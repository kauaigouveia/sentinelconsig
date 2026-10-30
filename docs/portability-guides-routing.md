# Roteiros centralizados e direcionamento de portabilidade

Base: main `2a1f83c44df8a9997bbea7c825b7193589b4d2de`.

## Entrega

- `/roteiros`: busca por instituição (incluindo aliases PB/Paraná), convênio e modalidade; uma instituição selecionada com resumo e restrições; documentos completos, fontes, vigência e divergências recolhidos em Detalhes. O catálogo é deduplicado, sem apagar suas diferentes fontes.
- O resumo de portabilidade deriva do mesmo motor e das mesmas fontes existentes. Não há segundo cadastro de regras. Para modalidades sem resumo estruturado confirmado, o sistema conserva a consulta ao documento, sem aplicar indevidamente regras de portabilidade a Novo/Refin. Filtros sem material retornam ausência de roteiro, não ausência de integração.
- Diagnóstico restrito na própria tela, carregado sob demanda, sem polling. Requer `simulations.view`, `audit_logs.view` e `integrations.manage`, com empresa obtida da sessão. O acesso geral aos logs aplica a mesma restrição ao novo tipo de evento e mantém os demais registros existentes acessíveis pelas regras anteriores.
- Respostas de portabilidade do portal, atualizações intermediárias, histórico e replay usam projeção pública. Não retornam motivos privados, destinos descartados ou objetos internos de planilha. Mantêm instituição, condições financeiras e identificação de estimativa quando a origem é planilha.

## Prioridade Daycoval e limite operacional real

A regra inicial considera parcela **estritamente inferior a R$ 50** e saldo inferior aos mínimos documentados dos demais destinos habilitados e avaliáveis. Outro destino elegível, mínimo desconhecido/zero ou pendência documental impede a seleção especial. Nenhum destino é descartado artificialmente para favorecer Daycoval.

A seleção admite cálculo **WORKBOOK** no backend. Para Daycoval, não exige API, gateway ou credenciais bancárias. Exige planilha configurada/habilitada para a empresa, modelo reconhecido, vigência comprovada, dados suficientes e resultado elegível segundo as regras documentais. O executor reutiliza o resultado calculado, mantém os demais destinos e não repete jobs.

O backend usa `DAYCOVAL_INSS_WORKBOOK_V1`, decodifica o arquivo importado e chama `calculatePortRefin('DAYCOVAL', ...)`, que executa `simulateDaycoval` e seu interpretador Excel limitado. Não usa `eval`, macros, resultados cacheados ou fórmulas financeiras novas. Preserva metadados documentais do formulário. A parcela original e o saldo são entradas distintas; o troco não é somado ao saldo como valor entregue ao cliente. Os resultados públicos permanecem identificados como estimativa de planilha.

As fontes cadastradas vedam portabilidade pura Daycoval e apresentam divergências para Portabilidade + Refinanciamento. Esses impedimentos continuam ativos; o caso R$ 35/R$ 900 não é aprovação documental automática.

### Disponibilidade e vigência

O arquivo importado contém `uploadedAt`, hash do arquivo, hash de fórmulas e prazos. **Não possui comprovação automática de vigência comercial.** O preflight exige `validFrom` e `validUntil` documentados no registro de backend; não deriva vigência do nome, data de upload ou ausência de erro de cálculo. O cadastro/importador atual não coleta essas datas: é pendência real obter a vigência oficial e definir sua incorporação administrativa com evidência, antes de ativar automação operacional. Nenhuma configuração ou banco operacional foi consultado/alterado nesta correção.

Na inspeção offline dos arquivos fornecidos em Downloads:
- `DAYCOVAL-SIMULADORES-V- 09102026.xlsx`: fórmulas compatíveis, SHA-256 do arquivo `cdb84201e629776020b245dd91ae95cc80f1e9c1c6d2dd868d4db0f8a0fbba57`.
- `DAYCOVAL-SIMULADORES-V- 16102026.xlsx`: fórmulas compatíveis, SHA-256 do arquivo `63e94e89464fd49fd0aa0e44cba9dbaf418accd5fbf5e2a3195dfa1e881ce728`.
- Hash de fórmulas aceito: `6e0eacd03bb614e7a257cae03b8c7844f4f1436abd14cad78124369427dfb1af`; prazos encontrados: 108, 96 e 84.
- Versões de 02/10 e 23/10: rejeitadas pelo importador por estrutura/fórmulas diferentes; não houve adaptação presumida nem escolha automática de versão antiga como vigente.

Teste de cálculo real **offline**, sem política de aprovação: nascimento sintético 01/01/1980, data de cálculo 30/10/2026, saldo 900, parcela 35, 36 parcelas restantes, refinanciamento 108 meses. As versões compatíveis retornaram 11 tabelas, 7 disponíveis segundo a própria planilha; na tabela 805971 o troco calculado foi 682,5868270523455, taxa 1,85% a.m., primeiro vencimento 10/12/2026. Esses números demonstram o executor, não validam vigência, enquadramento documental ou aceitação bancária. Nenhum dado pessoal das planilhas foi exportado para fixtures/logs.

### Entradas e saídas

Entradas automáticas: nascimento, espécie INSS, banco de origem, prazo original e restante (para parcelas pagas), saldo, parcela original e prazo de refinanciamento; data de cálculo definida no backend. Demais informações documentais são preservadas. Margem adicional é zero somente quando não solicitada; quando há nova parcela, usa a diferença explícita. Redução não é convertida silenciosamente em margem zero. Daycoval usa taxas/tabelas da planilha, sem criar taxa externa.

Saídas do calculador: tabela, taxa, coeficiente, valor do contrato, saldo, troco, parcela, prazo, disponibilidade, re-assinatura, taxa de retorno por contrato, primeiro vencimento e identificação da versão. O portal recebe apenas instituição/tabela e condições financeiras permitidas, com `quoteKind: ESTIMATE`; critérios privados e diagnósticos ficam na auditoria administrativa.

## Extensibilidade e persistência

`RoutingRule` contém identificador, nome, modalidade, convênio, condições, banco, prioridade, empresa, ativo/inativo, vigência, versão e motivo interno. A regra padrão é um template de backend aplicado ao contexto da empresa autenticada. Overrides futuros usam a chave `PORTABILITY_ROUTING_V1` do `SystemConfig` existente, estritamente por tenant. Não houve gravação de configuração operacional nesta entrega nem nova interface de cadastro.

Configuração inválida ou indisponível não habilita prioridade e não paralisa as consultas anteriores. Um novo adapter precisa registrar sua capacidade no servidor; dados enviados pelo navegador não são prova de disponibilidade, autorização ou idempotência. Não se alterou a configuração de ordenação já existente por empresa.

As decisões usam o serviço de auditoria existente, evento `simulation.portability_routing`. O registro contém códigos, versões, instituições e motivos documentais; não inclui CPF, telefone, nome, credenciais ou payload bancário. O volume de decisões é limitado. `AuditLog.newData` é JSON em coluna string: o diagnóstico lê esse formato e projeta campos específicos, sem devolver o objeto completo. Se a auditoria estiver indisponível, preserva-se o fluxo anterior; o cálculo local de planilha não realiza operações bancárias ou contratação.

## Validação

Dados sintéticos, mocks de APIs/armazenamento e HTTP local com callbacks reais, sem importar o bootstrap operacional. Cobertura: 35/900, fronteiras 50/60, outros destinos elegíveis ou com mínimo desconhecido/zero, bloqueios e disponibilidade, pendências, vigência/tenant, isolamento de falha e duplicações, projeção da oferta Daycoval, fontes completas, filtros, permissões administrativas, histórico e replay sem despacho bancário repetido.

Regressão desta correção: 135 testes aprovados em 15 arquivos (116 do conjunto anterior e 19 adicionais, sem somar reexecuções). TypeScript/lint (tsc --noEmit), build e git diff --check aprovados. O build emite avisos de chunks grandes e de imports estáticos/dinâmicos já existentes; não foram alterados nesta correção. A validação inclui o interpretador real com fórmulas sintéticas, despacho com configurações/APIs mockadas e leitura/cálculo offline dos arquivos Daycoval descritos acima. Não equivale a comprovação de vigência comercial ou homologação bancária. O build mantém o aviso de chunks acima de 500 kB. Verificou-se que o identificador da regra e a chave de configuração privada não estão nos arquivos JavaScript enviados ao navegador. Não houve homologação bancária real, screenshot autenticado de produção, chamada a instituição financeira, migration, seed ou alteração de credenciais/gateway/schema. Sem nova infraestrutura e sem aguardar READY da Vercel.

## Arquivos

- Backend: `server.ts`, `server/services/partnerSimulationService.ts`, `bankPlaybookCatalog.ts`, `portabilityRouting.ts`.
- Apresentação: `src/lib/portabilityGuide.ts`, `src/components/simulation/BankPlaybooksView.tsx`, `BankPlaybooksPanel.tsx`, `src/components/partner-portal/PartnerSimulationsView.tsx`.
- Testes: `tests/portability_routing.test.ts`, `portability_guide_catalog.test.ts`, `portability_guide_ui.test.tsx`, `portability_partner_projection.test.ts`, `portability_dispatch.test.ts`.
- Este relatório. As fontes bancárias existentes permanecem preservadas.

Esta correção permanece local, sem commit, push ou publicação. Exige validação da versão vigente e resolução das pendências documentais antes de produção. Reversão funcional por commit reverso, sem alteração no banco. Se já houver diagnósticos gravados, preservar as projeções públicas e o filtro de confidencialidade dos logs durante o rollback; um revert integral sem essas proteções poderia expor registros anteriores pelo endpoint geral. Não remover nem reescrever a trilha de auditoria.

## Atualização posterior — precedência documental

A fonte substitutiva Markdown colado(5).md passou a prevalecer para os 13 bancos indicados pelo responsável. As referências anteriores a conflitos entre versões descrevem a etapa histórica e não são mais aplicadas a esses critérios. As pendências atuais são lacunas da nova fonte, dados operacionais ou vigência/compatibilidade da planilha. Veja `docs/portability-rules-replacement-20261030.md`.

## Entrega posterior no GitHub

Após a validação local, o responsável autorizou commit e push das alterações relacionadas. Os registros anteriores de entrega local descrevem a etapa anterior; o SHA e o resultado do push são informados na entrega dessa publicação Git. Esta nota não comprova deployment nem homologação bancária real.
