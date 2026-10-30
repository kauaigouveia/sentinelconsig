# Roteiros centralizados e direcionamento de portabilidade

Base: main `2a1f83c44df8a9997bbea7c825b7193589b4d2de`.

## Entrega

- `/roteiros`: busca por instituição (incluindo aliases PB/Paraná), convênio e modalidade; uma instituição selecionada com resumo e restrições; documentos completos, fontes, vigência e divergências recolhidos em Detalhes. O catálogo é deduplicado, sem apagar suas diferentes fontes.
- O resumo de portabilidade deriva do mesmo motor e das mesmas fontes existentes. Não há segundo cadastro de regras. Para modalidades sem resumo estruturado confirmado, o sistema conserva a consulta ao documento, sem aplicar indevidamente regras de portabilidade a Novo/Refin. Filtros sem material retornam ausência de roteiro, não ausência de integração.
- Diagnóstico restrito na própria tela, carregado sob demanda, sem polling. Requer `simulations.view`, `audit_logs.view` e `integrations.manage`, com empresa obtida da sessão. O acesso geral aos logs aplica a mesma restrição ao novo tipo de evento e mantém os demais registros existentes acessíveis pelas regras anteriores.
- Respostas de portabilidade do portal, atualizações intermediárias, histórico e replay usam projeção pública. Não retornam motivos privados, destinos descartados ou objetos internos de planilha. Mantêm instituição, condições financeiras e identificação de estimativa quando a origem é planilha.

## Prioridade Daycoval e limite operacional real

A regra inicial considera parcela **estritamente inferior a R$ 50** e saldo inferior aos mínimos documentados dos demais destinos habilitados e avaliáveis. Outro destino elegível, mínimo desconhecido/zero ou pendência documental impede a seleção especial. Nenhum destino é descartado artificialmente para favorecer Daycoval.

A seleção exige transporte oficial, integração configurada/habilitada/autorizada, dados obrigatórios, proteção de idempotência e elegibilidade comprovada. O executor prioriza o destino selecionado, mantém o processamento dos demais, isola falhas, deduplica identificadores de jobs e não cria retry automático.

**Neste código, Daycoval está implementado como calculador de planilha. Não foi localizado um adapter oficial de simulação de portabilidade.** Um gateway Oracle ou um health check cadastrado não comprova essa operação. Nenhuma flag do navegador ou configuração pode transformar a planilha em API oficial. Por isso, a prioridade oficial permanece bloqueada em produção e o fluxo existente continua avaliando os demais bancos. Não se criou endpoint ou payload bancário fictício.

Além disso, as fontes atualmente cadastradas vedam portabilidade pura no Daycoval e apresentam divergências para outras condições. O exemplo de R$ 35/R$ 900 não autoriza ignorar essas regras. Os testes positivos de prioridade usam capacidades e elegibilidade **sintéticas**, não comprovam aceitação bancária real desse caso.

Para liberar execução oficial futuramente, faltam: contrato/endpoints/payloads oficiais, implementação do adapter autorizado e seu transporte, comprovação de habilitação e dados exigidos, idempotência persistente da operação e enquadramento documental compatível. A mera existência da planilha não satisfaz esses requisitos. As proteções distribuídas existentes não foram substituídas por cache em memória; a deduplicação de jobs não é apresentada como idempotência distribuída.

## Extensibilidade e persistência

`RoutingRule` contém identificador, nome, modalidade, convênio, condições, banco, prioridade, empresa, ativo/inativo, vigência, versão e motivo interno. A regra padrão é um template de backend aplicado ao contexto da empresa autenticada. Overrides futuros usam a chave `PORTABILITY_ROUTING_V1` do `SystemConfig` existente, estritamente por tenant. Não houve gravação de configuração operacional nesta entrega nem nova interface de cadastro.

Configuração inválida ou indisponível não habilita prioridade e não paralisa as consultas anteriores. Um novo adapter precisa registrar sua capacidade no servidor; dados enviados pelo navegador não são prova de disponibilidade, autorização ou idempotência. Não se alterou a configuração de ordenação já existente por empresa.

As decisões usam o serviço de auditoria existente, evento `simulation.portability_routing`. O registro contém códigos, versões, instituições e motivos documentais; não inclui CPF, telefone, nome, credenciais ou payload bancário. O volume de decisões é limitado. `AuditLog.newData` é JSON em coluna string: o diagnóstico lê esse formato e projeta campos específicos, sem devolver o objeto completo. Se a auditoria estiver indisponível, preserva-se o fluxo anterior; não há nova operação oficial Daycoval habilitada para executar sem suas garantias.

## Validação

Dados sintéticos, mocks de APIs/armazenamento e HTTP local com callbacks reais, sem importar o bootstrap operacional. Cobertura: 35/900, fronteiras 50/60, outros destinos elegíveis ou com mínimo desconhecido/zero, bloqueios e disponibilidade, pendências, vigência/tenant, isolamento de falha e duplicações, projeção da oferta Daycoval, fontes completas, filtros, permissões administrativas, histórico e replay sem despacho bancário repetido.

Resultado final: 116 testes aprovados em 13 arquivos; TypeScript/lint (tsc --noEmit), build e git diff --check aprovados. O teste de despacho foi reexecutado após o limite final do diagnóstico (3/3, sem somar repetições à contagem). O build mantém o aviso de chunks acima de 500 kB. Verificou-se que o identificador da regra e a chave de configuração privada não estão nos arquivos JavaScript enviados ao navegador. Não houve homologação bancária real, screenshot autenticado de produção, chamada a instituição financeira, migration, seed ou alteração de credenciais/gateway/schema. Sem nova infraestrutura e sem aguardar READY da Vercel.

## Arquivos

- Backend: `server.ts`, `server/services/partnerSimulationService.ts`, `bankPlaybookCatalog.ts`, `portabilityRouting.ts`.
- Apresentação: `src/lib/portabilityGuide.ts`, `src/components/simulation/BankPlaybooksView.tsx`, `BankPlaybooksPanel.tsx`, `src/components/partner-portal/PartnerSimulationsView.tsx`.
- Testes: `tests/portability_routing.test.ts`, `portability_guide_catalog.test.ts`, `portability_guide_ui.test.tsx`, `portability_partner_projection.test.ts`, `portability_dispatch.test.ts`.
- Este relatório. As fontes bancárias existentes permanecem preservadas.

Publicação por commit e push normal na main após validação e sincronização. Reversão funcional por commit reverso, sem alteração no banco. Se já houver diagnósticos gravados, preservar as projeções públicas e o filtro de confidencialidade dos logs durante o rollback; um revert integral sem essas proteções poderia expor registros anteriores pelo endpoint geral. Não remover nem reescrever a trilha de auditoria.
