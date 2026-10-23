# Simulações CLT — FACTA e V8 Digital

Branch `codex/clt-facta-v8-fix`, criada da main `da2ed71706ecc38909e2085c8ca83f6287c4fecb`. A correção FACTA anterior foi reaproveitada por cherry-pick (`fc0291f`), preservando a branch original `codex/facta-clt-employment-fix`. Nenhum merge, push, deploy, migration ou acesso operacional foi realizado nesta entrega.

## FACTA

A causa comprovada e a correção estão detalhadas em [facta-clt-employment-fix.md](facta-clt-employment-fix.md). O cartão exibia a matrícula retornada, mas o estado e as rotas guardavam somente o empregador. Vínculos diferentes do mesmo empregador podiam aparecer selecionados simultaneamente. Agora a seleção preserva `factaRegistration`, compara empregador/matrícula na consulta autorizada atual e envia a matrícula textual somente na análise de política. Não há fallback que invente `1`.

Os testes cobrem matrícula numérica, alfanumérica, zeros à esquerda, ausência, seleção desatualizada, um/múltiplos vínculos e preservação da parcela de 1423.98. A diferença do caso operacional entre `1` e `0001700031…` continua sem comprovação por payload real; não se presume equivalência entre esses identificadores.

Contrato oficial: [Crédito do Trabalhador v9](https://webservice-homol.facta.com.br/documentacao/assets/Manual-do-WebService-FACTA-v9.0-CREDITO-TRABALHADOR.pdf) e [Consulta do Trabalhador v2](https://webservice-homol.facta.com.br/documentacao/assets/Manual-do-WebService-FACTA-v2.0-CONSULTA-DADOS-TRABALHADOR.pdf). O endpoint de operações não recebeu parâmetros não documentados.

## V8 Digital: diagnóstico e contrato

**CLT é documentado pela V8**, mas a entrega anterior no Sentinel implementava somente configuração e diagnóstico de acesso. `ProductSimulationService.run` não despachava para V8; não existia adaptação de consulta, consentimento ou oferta ao simulador. Habilitar CLT no painel de conexão não equivalia a habilitar uma jornada de simulação. Essa é a causa local comprovada da ausência de simulação.

A documentação foi consultada pelo conector MCP V8 (`search_documentation`), em 23/10/2026, nas páginas oficiais abaixo. Nenhum endpoint bancário autenticado foi chamado. O conector consulta documentação e não executa simulações.

| Operação documentada | Endpoint | Uso nesta entrega |
| --- | --- | --- |
| Autenticação | `POST https://auth.v8sistema.com/oauth/token` | Reutiliza o serviço existente, senha OAuth, audience, client_id e offline_access; credenciais permanecem criptografadas por empresa/promotora. |
| Criar termo | `POST /private-consignment/consult` | Documentado, não executado: exige nascimento, gênero, e-mail e dados do signatário. |
| Aceitar termo | `POST /private-consignment/consult/{consult_id}/authorize` | Documentado, não executado pelo operador; não há aceite automático. |
| Consultar consentimento/margem | `GET /private-consignment/consult` | Implementado: datas, paginação, CPF e provider QI; comparação exata do CPF retornado. |
| Configurações CLT | `GET /private-consignment/simulation/configs?provider=QI` | Implementado, incluindo prazos disponíveis por configuração. |
| Simular CLT | `POST /private-consignment/simulation` | Implementado para consulta já autorizada em SUCCESS. |
| Pré-cálculo | `POST /private-consignment/simulation/pre-calculate-installments`, em host Azure separado | Não chamado: schema de sucesso ainda requer validação autenticada na própria documentação. O cálculo completo usa o valor e prazo informados diretamente no endpoint documentado. |
| Criar operação, webhooks, formalização | `/private-consignment/operation`, callbacks consult/operation | Fora do escopo; não configurados nem executados. |

Fontes: [fluxo CLT](https://docs.v8sistema.com/guide/crédito-privado-clt/visão-geral-do-fluxo-clt), [consentimento](https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento), [simulação](https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt), [checklist](https://docs.v8sistema.com/guide/crédito-privado-clt/checklist-de-integração-clt).

Também há documentação de FGTS (`/fgts/simulations/fees/new`, `/fgts/simulations`), preservada sem alteração funcional nesta entrega. Não foi identificado contrato INSS no material retornado; não foi criada chamada INSS com base em documentação CLT/FGTS.

## Comportamento V8 implementado

- Descoberta das conexões canônicas configuradas da própria empresa. `V8BankService.config` revalida promotora ativa e abre credenciais com contexto criptográfico da empresa/promotora. Não herda conexão de outra empresa.
- Respeita habilitação da conexão/CLT e ambiente ativo. Não substitui homologação sem URL confirmada por produção. Credenciais incompletas e permissões negadas têm mensagens específicas, sem expor valores.
- Lista consultas dos últimos 30 dias em até 10 páginas de 50 registros. Respostas são filtradas por CPF exato; se a paginação exceder esse limite, falha explicitamente, sem usar resultado incompleto. Consultas mais antigas exigem uma nova consulta no fluxo autorizado V8; a janela não comprova ausência definitiva de consentimento.
- Múltiplas consultas exigem seleção explícita. `v8ConsultId` e `v8PromoterId` são preservados no formulário e reconferidos no servidor; nunca se envia matrícula FACTA como consult_id.
- O retorno de consulta documentado não contém empregador/matrícula. A interface mostra consulta/margem e referência V8 independentes, sem inventar CNPJ, vínculo, matrícula ou afirmar correspondência com um vínculo FACTA.
- `WAITING_CONSENT` aguarda aceite; etapas de processamento permanecem pendentes. `REJECTED` é inelegibilidade com motivo sanitizado; `FAILED` é falha técnica. Margem ausente é dado ausente, margem zero é inelegibilidade, e parcela acima da margem não é reduzida silenciosamente.
- O payload V8 contém apenas `consult_id`, `config_id`, `installment_face_value`, `disbursed_amount`, `number_of_installments` e `provider=QI`. No modo parcela, envia o valor desejado e desembolso zero; no modo desembolso, envia valor desejado e parcela zero, seguindo os campos do exemplo documentado. Cada prazo vem da configuração retornada.
- Oferta exige ID de simulação, líquido e parcela positivos e o prazo solicitado. `disbursed_issue_amount` é líquido e `issue_amount` é bruto, sem substituição. A taxa permanece ausente na oferta normalizada até confirmação da unidade percentual/fração do campo documentado `monthly_interest_rate`; não estimamos taxas.
- Não registra aceite, operação, proposta ou webhook. Falha de uma integração não apaga ofertas das outras. Falhas por condição V8 também são isoladas.

## Fluxo compartilhado e experiência

FACTA e V8 usam seletores separados. A parcela persiste entre Cliente, Condições e Resultados. O `CurrencyInput` existente preserva `1423,98`, `1.423,98`, `1423.98` e `R$ 1.423,98`. O campo CLT do Portal do Parceiro passou a usar o mesmo conversor, eliminando o uso de input numérico incompatível com entrada BRL naquele fluxo.

Resultados CLT apresentam categorias distintas: oferta, autorização, inelegibilidade, dados ausentes, falha técnica, CLT indisponível nesta conexão e processamento pendente. CLT desabilitado na conexão não é tratado como prova de ausência de suporte na API V8. Provedores legados mantêm seus estados e recebem classificação operacional conservadora.

Mensagens não mostram HTML, dumps JSON, tokens, URLs técnicas ou documentos. A sanitização vale tanto para o retorno final quanto para callbacks parciais. Os logs da adaptação V8 registram apenas provedor, escopo, código e HTTP status, sem corpo da API, CPF, nome, matrícula, token ou credenciais.

## Arquivos e testes

Além dos dez arquivos do commit FACTA, esta entrega altera `productSimulationService.ts`, as duas rotas em `server.ts`, os formulários interno/portal, o cartão compartilhado e a descrição da aba V8. Acrescenta `v8CltSimulationService.ts`, `cltSimulationOutcome.ts`, `v8_clt_simulation.test.ts` e este relatório; amplia os testes HTTP e de navegação já criados para FACTA. A lista exata pode ser obtida por `git diff --name-only da2ed71706ecc38909e2085c8ca83f6287c4fecb..HEAD` após o commit local.

Os testes usam somente fixtures sintéticas e mocks externos. A autenticação, criptografia, configuração por empresa/promotora, construção real das requisições e orquestrador foram exercitados com armazenamento em memória e fetch simulado. Os testes HTTP executam callbacks atuais das rotas em Express com sessão/dependências injetadas, sem importar o servidor completo ou conectar bancos.

As 12 falhas antigas de portabilidade INSS/seletor visual já foram reproduzidas na main publicada na entrega FACTA. Não foram alteradas regras INSS ou testes antigos para mascará-las. Os relatórios JSON detalhados ficam em `%LOCALAPPDATA%\SentinelConsig\clt-facta-v8-fix`.

Resultados: **74 testes focados aprovados**; regressão com 286 aprovações e as mesmas 12 falhas históricas, mais 2 testes específicos do portal aprovados separadamente (**288 aprovações únicas**, 12 falhas preexistentes, zero falhas novas). Os testes focados estão incluídos nesses totais e não devem ser somados novamente.

TypeScript (`tsc --noEmit`), build completo e `git diff --check` aprovados na execução final sequencial. O build utilizou URL sintética fornecida somente ao processo e executou apenas geração do cliente Prisma, Vite e esbuild, sem conexão com banco ou execução de migrations. Uma checagem intermediária de TypeScript coincidiu com a substituição de assets gerados em `dist`; foi repetida em sequência com sucesso, sem alteração da configuração do projeto.

| Arquivo | Finalidade |
| --- | --- |
| `server.ts` | Transporte e validação dos seletores FACTA/V8 nas rotas interna e portal. |
| `server/services/factaSimulationService.ts` | Revalidação e matrícula FACTA exata. |
| `server/services/productSimulationService.ts` | Despacho V8, isolamento de falhas e resultados sanitizados. |
| `server/services/v8CltSimulationService.ts` | Adaptação documentada de consultas, configurações e simulação V8. |
| `src/lib/cltSimulationOutcome.ts` | Categorias operacionais e sanitização. |
| `src/components/integrations/V8IntegrationTab.tsx` | Descrição fiel das capacidades e limites da conexão. |
| `src/components/simulation/CltCustomerDataCard.tsx` | Seleção distinta de matrícula FACTA e consulta V8. |
| `src/components/simulation/ProductSimulationModal.tsx` | Estado e resultado no fluxo interno. |
| `src/components/partner-portal/PartnerSimulationsView.tsx` | Estado, resultado e moeda BRL no portal. |
| `tests/facta_clt_employment.test.ts` | Regressões FACTA. |
| `tests/facta_clt_route.test.ts` | HTTP sobre callbacks atuais e validação dos seletores. |
| `tests/facta_clt_selection_ui.test.tsx` | Seleção e etapas do formulário interno. |
| `tests/v8_clt_simulation.test.ts` | Contratos V8, criptografia, autenticação, respostas e isolamento. |
| `tests/clt_partner_selection.test.tsx` | Fluxo do portal e conversão monetária. |
| `docs/facta-clt-employment-fix.md` | Evidências e limites da correção FACTA reaproveitada. |
| `docs/v8-integration.md` | Atualização da documentação histórica da conexão. |
| `docs/clt-facta-v8-audit.md` | Este relatório. |

## Pendências e prontidão

A correção pode seguir para revisão técnica e homologação autorizada, mas **não comprova funcionamento real na conta V8**. Dependências: conexão habilitada, credenciais válidas, permissões de consulta/configurações/simulação liberadas pela V8 e consentimento real do trabalhador já concluído. A jornada de criação/aceite de novos termos dentro do Sentinel ainda depende de implementação específica, texto legal e captura legítima do aceite; não foi simulada por autorização do operador.

Também permanecem pendentes a URL de homologação V8, a confirmação da unidade da taxa e eventual conferência de schema autenticado do pré-cálculo. Os diagnósticos antigos de `permission_denied` são históricos; não foram usados como prova do estado atual da conta. Nenhuma consulta real foi executada nesta entrega.

Schema, migrations, configurações de produção, branches do Lote 2 e ambientes Ruflo permaneceram preservados. Não publicar sem autorização. Para reversão local, reverter os commits desta branch; não há reversão de banco.
