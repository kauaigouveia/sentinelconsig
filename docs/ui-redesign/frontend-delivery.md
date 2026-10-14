# Sentinel Consig 2.0 — entrega local de frontend

**Atualização de preparação para lançamento:** V2 foi preparada como padrão em produção, com rollback de apresentação controlado e build sem migrations. Ainda não publicada. Configurações e gates atuais em [release-preparation.md](release-preparation.md); instruções anteriores de DEV falso/legado padrão são históricas.

14/10/2026 · branch `codex/sentinel-2-proposals-functional`.

## Implementação disponível

## Acabamento final solicitado — 14/10/2026

Nesta rodada, a inspeção identificou BI Executivo, relatório de Gargalos, Command Center e Plataforma como áreas com tratamento predominantemente comum, além dos formulários internos administrativos. O acabamento individual adiciona:

- **BI Executivo e Gargalos/Relatórios:** navegação analítica lateral em telas amplas, conteúdo separado, filtros existentes mantidos; navegação horizontal com quebra de linha em telas menores.
- **Command Center:** barra interna compacta e responsiva, foco visível, campos e tabelas padronizados; continua sendo o módulo de incidentes, sem mistura com o dashboard operacional.
- **Plataforma:** indicadores com espaçamento uniforme, abas com quebra de linha, tabelas numéricas, filtros e formulários no padrão V2.
- **Administração e Integrações:** acabamento dos campos, divisões dos painéis e navegação; nenhuma mudança nas permissões ou configurações bancárias.
- **Compartilhados:** tipografia de tabelas, largura/scroll interno, foco de teclado e campos responsivos, restritos a `.s2-root`. A interface legada não recebe os novos estilos.

**Ainda conservam organização predominantemente legada:** formulários detalhados de bancos, importação/exportação, usuários/perfis, produtos/convênios/regras, auditoria, white label e assinaturas; Radar Comercial e alguns painéis de agenda/gamificação. Recebem os tokens/componentes de apresentação comuns, mas seus agrupamentos internos não foram reconstruídos. Monitor TV mantém propositalmente sua composição de leitura à distância. Portal do parceiro permanece fora do escopo. Não afirmar redesign individual desses componentes.

**Preservação:** todos os controles, campos, handlers, serviços e expressões das baselines continuam sendo verificados. Novos marcadores de apresentação em BI, Gargalos, Command Center e Plataforma; folha `sentinel-2-finishing.css` importada no App e na galeria local, sem fixtures no App. Nenhuma alteração de regras, backend, autenticação, banco, APIs ou portal.

**Capturas disponíveis:** os exemplos locais listados na seção Capturas continuam disponíveis. Esta rodada não produziu capturas novas de BI/Command Center/Plataforma; inspeção visual completa dessas telas nos dois temas/resoluções permanece **não validada**. Não usar imagens anteriores para comprovar essas mudanças.

**Limites:** fluxos autenticados e persistidos permanecem não validados. Build/typecheck e preservação estática não representam homologação funcional nem prontidão para produção. Após os checks desta rodada, execução interrompida para aguardar autorização do usuário; sem migrations, push, merge ou deploy.

**Resultado desta rodada:** 176 testes aprovados em sete arquivos selecionados, typecheck aprovado, build final aprovado e `git diff --check` aprovado. A bateria cobre baselines dos módulos, Propostas, escopo/rollback, Administração, Integrações e diálogos. O aviso de bundles acima de 500 kB permanece. O diff dos caminhos protegidos retornou vazio.

App Shell V2 integrado aos componentes operacionais originais em desenvolvimento. As rotas, permissões, dados e handlers existentes continuam sendo utilizados. Nenhum módulo autenticado importa os fixtures da revisão visual. Interface legada permanece disponível. O portal do parceiro conserva sessão e identidade próprias.

| Área | Apresentação e preservação | Evidência disponível |
|---|---|---|
| Shell | Sidebar, topbar, busca, favoritos, recentes, abas, temas e empresa | Testes de escopo, permissões e busca; sessão real não validada |
| Propostas | Tabela/cartões, paginação, colunas, filtros, ações e formulários originais | Matriz de 45 itens, DOM e hashes dos modais |
| Simulações | Solicitações, fila, relatórios, resultados e planilhas com navegação própria | DOM das quatro áreas; controles e cálculos preservados por baseline |
| Kanban | Etapas filtradas, cards, detalhes e avanço original | DOM e transições com transporte mockado |
| Clientes 360° | Carteira, sete seções, múltiplas ADEs, documentos, notas e comunicações | DOM com leituras sintéticas; gravações não validadas |
| CIP | Filas, resumo e tabela; SLA/calculadores/cron originais | DOM, baseline; cron e retornos não executados |
| Pendências | Fila, filtros, indicadores, drawer e formulário originais | DOM/GETs mockados; resolução e reabertura persistidas não validadas |
| CRM e Atendimento | Grade/tabela, conversa, modelos, avaliação e WhatsApp originais | DOM, evento de nova mensagem e gate de resposta com mocks |
| Rotina | Fila, agenda, tarefas, operação e gamificação | DOM da Minha Fila; demais controles/expressões por baseline |
| Financeiro | Indicadores, filtros e tabela; formulários e cálculos reutilizados | DOM/GETs mockados; pagamentos não executados |
| BI, Radar e Relatórios | Apresentação comum, gráficos/filtros/exportações originais | Baseline e testes de métricas locais; relatórios reais não validados |
| Intelligence | Navegação lateral e painéis reorganizados | Baseline; DOM local com dados fictícios |
| Command Center | Módulo original de incidentes, separado do dashboard operacional | Baseline e teste de escopo; tratamento real não executado |
| Automações | Navegação lateral, biblioteca/histórico/métricas e builder original | DOM, abertura/cancelamento com mocks; execuções não realizadas |
| Administração | Destinos originais, navegação e controles de acesso mantidos | MASTER com 15 áreas, PLATFORM_MASTER com 17 em testes isolados |
| Integrações | Dez áreas do Hub e configurações bancárias originais | DOM e baseline; diagnóstico/contratação externos não executados |
| Plataforma | Empresas, assinaturas, consumo, planos e white label originais | Baseline e gates; operações persistidas não validadas |
| Diálogos | Estilo V2 comum, campos/botões originais e rollback sem remount | Novo formulário real testado; rascunho preservado; sem submissão |

## Últimas alterações

- `sentinel-2-dialogs.css`: apresentação dos formulários e diálogos originais restrita ao ancestral `.s2-root`; sem flag no body e sem atingir o portal.
- `sentinel-2-modules.css`: estrutura de Automações/Intelligence, campos/superfícies e contraste de temas nos módulos herdados.
- `SentinelIntelligenceDashboard.tsx`: somente marcador de apresentação; nenhum cálculo ou handler alterado.
- `App.tsx`: importa a folha de diálogos; autorização/roteamento/sessão intactos.
- `tests/ui_dialogs_operational.test.tsx`: rascunho/cancelamento do formulário real e escopo da folha de estilos.
- Harness local ampliado para revisar dez módulos e o formulário original de nova proposta. Escritas HTTP e destinos desconhecidos são bloqueados. As preferências locais originais podem escrever somente dados fictícios no contexto da revisão.

## Testes e limites

**261 testes aprovados em 23 arquivos seguros selecionados.** Typecheck aprovado após a ampliação do harness e `git diff --check` aprovado. Build local executado sem migrations, com aviso existente de chunks acima de 500 kB. A checagem de diff dos caminhos protegidos retornou vazia: backend, Prisma/schema/migrations, serviços, regras, router, contexto de autenticação e portal não foram alterados.

Não há validação autenticada de CRUD, arquivos, importação/exportação completa, comunicação externa, integrações bancárias, realtime externo ou alternância real de empresas. Isso permanece **não validado**. A baseline estática comprova preservação de controles e expressões, não execução de todos os fluxos. Alguns módulos conservaram sua organização interna sob o novo shell e componentes de apresentação; não alegar reconstrução individual de todos os formulários nem preservação funcional 100% homologada.

## Capturas

Revisão local com fontes inteiramente fictícias, sem login. As capturas não são da aplicação autenticada.

- [Nova proposta — formulário original](screenshots/functional-local/new-proposal-dark.png)
- [Automações — navegação reorganizada](screenshots/functional-local/automations-dark.png)
- [Propostas](screenshots/functional-local/proposals-dark.png)
- [Simulações — fila escura](screenshots/functional-local/simulation-queue-dark.png)
- [Simulações — fila clara](screenshots/functional-local/simulation-queue-light.png)
- [Simulações — análises](screenshots/functional-local/simulation-analysis-light.png)
- [Planilhas](screenshots/functional-local/simulation-spreadsheets-dark.png)
- [Kanban](screenshots/functional-local/kanban-dark.png)
- [Clientes](screenshots/functional-local/clients-dark.png)
- [CIP](screenshots/functional-local/cip-dark.png)
- [Pendências — fila vazia](screenshots/functional-local/pendencies-dark.png)

O serviço de captura falhou nas tentativas finais de salvar Intelligence/Administração. O DOM dessas telas foi inspecionado; não apresentar capturas inexistentes como evidência. Dois temas revisados em exemplos locais. Resoluções efetivas verificadas anteriormente: 1920×1080 e 1365×767, devido ao arredondamento da escala do navegador. Todos os formulários/perfis/tenants em ambas as resoluções não foram validados.

## Comparação e publicação

Em desenvolvimento, `?ui=2` ativa V2; `?ui=legacy` retorna ao legado. A preferência persiste apenas o modo de apresentação. Produção permanece com DEV falso e não recebe essa ativação. URL do harness: `http://127.0.0.1:5187/tests/visual/simulation-workspace.html`.

Sem push, merge, deploy, migrations, seeds ou banco de produção. Para publicação futura: revisar os fluxos não validados com sessão autorizada, manter rollback, revisar o diff e então solicitar autorização específica. Não executar `vercel-build` como teste local: esse script inclui migrations.

[Matriz de Propostas](proposals-functional-parity.md) · [Rotas e aliases](navigation-equivalence.md) · [Histórico por módulo](progressive-migration.md) · [Arquivos alterados](migration-changed-files.md)
