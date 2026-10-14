# Sentinel Consig 2.0 — inventário funcional

Data: 13/10/2026. Base inspecionada: `4e6a348e7aa8b02653560ba15a8acfc43311e83a`.
Estado: auditoria estática anterior à implementação; somente documentação foi criada.

## 1. Escopo e limites de evidência

Foram inventariados diretórios, rotas declaradas, composição em App.tsx, menus e abas internas, componentes, permissões, serviços, registros HTTP, testes e infraestrutura de sessão/tenant/realtime. A presença de um arquivo ou teste não comprova funcionamento. Nenhum fluxo autenticado, integração bancária, teste de banco ou operação destrutiva foi executado nesta auditoria. A matriz abaixo é um plano de regressão, não um relatório de aprovação.

Registros HTTP extraídos estaticamente incluem caminhos com interpolação; handlers montados por laços/helpers exigem leitura do registrador. Fontes e linhas constam no apêndice. Tipos/payloads e validações continuam nas implementações originais; este inventário não substitui os contratos de API nem autoriza alterá-los.

## 2. Estrutura e stack

| Área | Responsabilidade |
|---|---|
| src/App.tsx, src/router | Shell, sessão, despacho de views, rotas diretas, aliases e permissões |
| src/components | Páginas, abas, tabelas, gráficos, modais e componentes compartilhados |
| src/lib, src/types | Regras, tipos, permissões, identidade, formatos e elegibilidade |
| src/services, src/hooks, src/context | APIs, cache, realtime, branding, preferências e temas |
| server.ts, server/services, server/utils | Express, sessões, autorização, negócios, integrações e tenant |
| prisma | Schema/migrations; intocáveis neste redesign |
| api, deploy, ops, .github, .vercel | Entrada e infraestrutura; sem publicação nesta fase |
| tests, scripts | Vitest e scripts operacionais; verificar efeitos antes de executar |
| public/branding | Logos originais, logos horizontais/verticais, favicons e símbolo v2 |
| docs | Documentação anterior e novo registro da auditoria |
| backup, storage, dist | Backups, arquivos e saída de build; não tratar como código removível |

React 19 + TypeScript + Vite 6, Tailwind 4, lucide-react, Recharts, motion, ExcelJS. Backend Express/Prisma/PostgreSQL, Pusher e SSE. Não há necessidade de novo framework ou dependência paga.

## 3. Diagnóstico do frontend

- Sidebar própria + WorkspaceToolbar + breadcrumbs + RouteContextPanel + navegação interna das centrais geram camadas simultâneas. O painel genérico ocupa espaço sem ser um fluxo próprio.
- CentralAdministracao reúne 17 destinos internos, incluindo duplicações de usuários, bancos, pendências, integrações e automações. Preservar funções internas que não têm rota dedicada: perfis, convênios, regras, marca e domínios.
- HubIntegracoes tem abas de bancos, saúde, incidentes e logs; algumas renderizam BankIntegrationsView com outra camada de abas. Consolidar a apresentação mantendo handlers e configurações.
- Existem ActionBar e MetricCard em ui e common; duas paletas de busca e dois componentes SentinelaAIChat. Isso indica duplicação a investigar, não autorização para apagar.
- CSS compartilhado usa seletores amplos sobre classes Tailwind e tokens de paletas diferentes. Intervenções globais podem alterar modais, controles e contraste de telas não revisadas.
- A marca padrão atual aponta para sentinel-mark-v2.svg; assets originais continuam em public/branding. O briefing atual pede preservar a logo original, portanto a futura implementação deverá usar esses assets, respeitando white label.
- Rotas utilizam um router próprio, não React Router. App.tsx faz lazy loading e orquestra sessão, modais e views. Reorganizar casca visual sem reescrever esse roteador.
- Propostas e simulações já oferecem apresentação por cartões/lista e fluxos volumosos. Tabelas, seleção em lote e formulários devem permanecer acessíveis durante a migração visual.
- Tema existe em ThemeContext (chave evolve_theme), com classe dark. Não há validação visual completa dos temas nesta auditoria.
- Portal tem shell e sessão próprios; Simulações é aba local, ausente de APP_ROUTES e do mapeamento initialTab em App.tsx. Criar rota de frontend só após aprovação, sem inventar endpoint.

## 4. Matriz integral de rotas declaradas

`canAccessRoute`: múltiplas permissões significam OU; requiredRoles é verificado antes. Permissões customizadas não vazias substituem as padrões, não se somam a elas. Backend continua autoridade.

| Caminho atual (preservar) | Tela | View | Categoria atual | Permissão de entrada | Restrição adicional | Aliases |
|---|---|---|---|---|---|---|
| / | Dashboard / Início | torre-controle | Início | 'dashboard.view' | — | ['/torre-controle'] |
| /dashboard | Dashboard | torre-controle | Início | 'dashboard.view' | — | — |
| /central-pendencias | Central de Pendências | central-pendencias | Operação | 'pendencies.view' | — | ['/pendencias', '/pendencias-central'] |
| /propostas | Propostas | producao | Operação | 'proposals.view' | — | ['/producao'] |
| /propostas/:id | Detalhes da Proposta | producao | Operação | 'proposals.view' | — | — |
| /portabilidade | Portabilidade (CIP) | portabilidades | Operação | 'proposals.view' | — | ['/portabilidades'] |
| /simulacoes | Simulações | simulacoes | Operação | 'simulations.view' | — | — |
| /crm-parceiros | CRM de Parceiros | parceiros | Operação | ['partners.crm.view', 'partners.view'] | — | ['/parceiros'] |
| /integracoes | Hub de Integrações | hub-integracoes | Integrações | 'integrations.view' | — | ['/hub-integracoes', '/integracoes-hub'] |
| /integracoes/:slug | Integração Bancária | hub-integracoes | Integrações | 'integrations.view' | — | — |
| /bancos-promotoras | Bancos & Promotoras | promotoras | Integrações | ['promoters.view', 'banks.view', 'integrations.view'] | — | ['/promotoras', '/admin-bancos'] |
| /saude-apis | Saúde das APIs | admin-c6-bank | Integrações | ['integrations.health', 'integrations.view'] | — | ['/admin-c6-bank'] |
| /bi | BI Operacional | dashboard-executivo | Gestão | 'bi.view' | — | ['/dashboard-executivo'] |
| /automacoes | Central de Automações | central-automacao | Gestão | 'automations.view' | — | ['/central-automacao'] |
| /command-center | Sentinel Command Center | command-center | Gestão | 'command.view' | — | ['/command'] |
| /command-center/incidents/:id | Incidente — Command Center | command-center | Gestão | 'command.view' | — | — |
| /intelligence | Sentinel Intelligence | sentinela-ai | Gestão | 'intelligence.view' | — | ['/sentinela-ai', '/sentinel-intelligence'] |
| /intelligence/insights/:id | Insight — Sentinel Intelligence | sentinela-ai | Gestão | 'intelligence.view' | — | — |
| /central-administracao | Central de Administração | central-administracao | Administração | 'admin.view' | — | ['/administracao'] |
| /empresas-assinaturas | Empresas & Assinaturas | saas-tenants | Plataforma | 'tenants.view' | — | ['/saas-tenants'] |
| /meu-plano | Meu Plano & Consumo | admin-plano-consumo | Plataforma | 'tenants.view' | — | ['/admin-plano-consumo'] |
| /esteira | Esteira Kanban | esteira | Operação | 'proposals.view' | — | — |
| /clientes | Clientes 360º & CRM | clientes | Operação | 'clients.view' | — | ['/busca-cpf', '/pesquisa-cpf'] |
| /tv-monitor | Monitor TV Operações | tv-monitor | Operação | 'dashboard.view' | — | — |
| /radar-comercial | Radar Comercial & BI | radar-comercial | Gestão | 'bi.view' | — | — |
| /agenda-operacional | Agenda & Tarefas | agenda-operacional | Operação | 'tasks.view' | — | — |
| /minha-fila | Minha Fila | minha-fila | Operação | ['tasks.view', 'partners.crm.view', 'partners.crm.tasks', 'partners.crm.admin'] | — | — |
| /gamificacao | Conquistas & Metas | gamificacao | Operação | 'proposals.view' | — | — |
| /financeiro-geral | Fluxo Financeiro | financeiro-geral | Gestão | 'financial.view' | — | — |
| /relatorio-gargalos | Gargalos & Permanência | relatorio-gargalos | Gestão | 'bi.view' | — | — |
| /central-operacoes | Central de Operações | central-operacoes | Operação | 'proposals.view' | — | — |
| /admin-usuarios | Usuários & Permissões | admin-usuarios | Administração | ['admin.view', 'users.view'] | — | — |
| /admin-produtos | Produtos & Regras | admin-produtos | Administração | ['admin.view', 'products.view'] | — | — |
| /admin-status | Status & Regras | admin-status | Administração | 'statuses.view' | — | — |
| /admin-calendario | Feriados & Prazos SLA | admin-calendario | Administração | 'admin.view' | — | — |
| /admin-auditoria | Auditoria & Logs | admin-auditoria | Administração | ['users.view', 'audit_logs.view'] | — | — |
| /admin-comunicados | Comunicados do Sistema | admin-comunicados | Administração | ['admin.view', 'settings.manage', 'admin.manage'] | ['MASTER', 'PLATFORM_MASTER'] | — |
| /admin-import-status | Importação de Status | admin-import-status | Administração | ['statuses.manage', 'proposals.update'] | — | — |
| /central-atendimento | Central de Atendimento | central-atendimento | Operação | 'support.view' | — | ['/suporte-central', '/atendimento-parceiros'] |
| /parceiro | Portal do Parceiro | portal-parceiro | Portal do Parceiro | Sessão específica do portal | — | ['/parceiro/dashboard'] |
| /parceiro/propostas | Minhas Propostas | portal-parceiro-propostas | Portal do Parceiro | Sessão específica do portal | — | — |
| /parceiro/propostas/:id | Detalhes da Proposta | portal-parceiro-propostas | Portal do Parceiro | Sessão específica do portal | — | — |
| /parceiro/atendimento | Atendimento & Suporte | portal-parceiro-atendimento | Portal do Parceiro | Sessão específica do portal | — | ['/parceiro/suporte', '/parceiro/chat'] |
| /parceiro/perfil | Meu Cadastro & Senha | portal-parceiro-perfil | Portal do Parceiro | Sessão específica do portal | — | ['/parceiro/cadastro', '/parceiro/seguranca'] |
| /parceiro/login | Login do Parceiro | portal-parceiro-login | Portal do Parceiro | Sessão específica do portal | — | — |

### Entradas e subpáginas fora da matriz

- Login operacional `/login`, seleção de membership/tenant e troca obrigatória de senha são controlados por App.tsx; não são rotas comuns do catálogo.
- Portal: dashboard, propostas/detalhe, simulações, atendimento, cadastro/senha. Login do parceiro usa sessão distinta. Preservar aliases e entrada direta.
- Administração: overview, tenants (plataforma), users, roles, products, convenios, banks, rules, status, calendario, audit, pendencies, automations, integrations, whitelabel, announcements, domains (plataforma).
- Hub: overview, c6, facta, bmg, happy, finanto, nossa-fintech, health, incidents, logs.
- Simulações: VISAO_GERAL, AGUARDANDO_DIGITACAO, DASHBOARD_ANALISES, PORT_REFIN_PLANILHAS. Planilhas: Daycoval/C6/Paraná.
- Cliente 360: overview, proposals, contracts, timeline, documents, communications, notes.
- Detalhes da proposta e cards de integração, criação/importação/exportação/status em lote, filtros, atalhos, backup, white label, notificações, tour, senhas e test runner são entradas por modal/ação, não rotas removíveis.

## 5. Inventário funcional por família

| Família / componentes principais | Funcionalidades a preservar | Contratos e cuidados |
|---|---|---|
| ControlTower, DigitizerHome, ExecutiveBIDashboard, OperationalBIDashboard, ExecutiveDashboard | Visões por papel, carteira/produção, filtros, rankings, gargalos, widgets, atalhos e gráficos | Não transformar valor pago em liberado; rotular base e período; componentes presentes não significam rota independente |
| ProductionList, NewProductionModal, ProposalDetailModal | Busca/filtros/ordenação, lista/cartões, seleção, CRUD autorizado, cliente/CPF/ADE/banco/promotora/produto/convênio/parceiro/digitador/valores/datas, vínculos, histórico, comentários, pendências, documentos e sincronização | StorageService e validações existentes de CPF, compatibilidade banco/promotora/produto/convênio e regras operacionais; manter todas as mensagens de erro |
| ExcelImportModal, ExcelExportModal, BulkStatusModal | Templates, arquivos, preview, importação, exportação, status em lote | Não trocar colunas, formatos, regras de deduplicação ou acompanhamento de importação |
| KanbanBoard | Status cadastrados, filtros, urgência, detalhe e mudança autorizada | Usa proposals.update; preservar confirmação/persistência e status reais; drag-and-drop futuro só pelo mesmo fluxo de autorização |
| PortabilityView | ADE/CPF/cliente, banco/promotora, parceiro, saldo/troco, fase/alçada, SLA, retornos e ações | Calendário operacional/dias úteis e serviço de portabilidade; não converter para dias corridos |
| SimulationView e modais bancários | Solicitações, fila, acompanhamento automático, import/export, resultado por banco, relatório parceiro/usuário, escolha de oferta | Responsável e código do parceiro, CPF, expiração e vínculo com proposta/ADE; status real, sem novo atalho que burle transição |
| SpreadsheetPortRefinWorkspace, DaycovalSimulationModal, PortRefinWorkbookSettings | Cliente, parceiro, contratos de origem, condições, taxas selecionáveis, resultados e importação/ativação/versionamento | Fórmulas, hash de estrutura, elegibilidade, idade, parcela, prazo e taxas intocáveis; importação MASTER/PLATFORM_MASTER autorizado no tenant |
| CentralPendencias, incidentes e command center | Abertura, atribuição, prioridade/categoria/status, SLA, histórico, resolução, cancelamento/reabertura e configuração autorizada | Pendência e incidente são entidades/fluxos diferentes; não fundir contadores |
| Client360View | Busca, múltiplas propostas/ADEs, contratos/valores, timeline, documentos, WhatsApp e notas | clients.create/update/delete conforme ação; preservar vínculos muitos-para-um e métodos de upload/download |
| PartnerCrmHub, PartnerManagement, formulário/detalhe/importação | Parceiros, promotoras, relacionamento, notas, interações, tarefas, métricas, importação de acessos e credenciais do portal | Vínculo por tenant; credenciais e e-mail/arquivo de resultado sem persistência indevida na UI |
| CentralAtendimentoView, SupportCenter, templates, WhatsApp | Fila, conversa, resposta, resolução/reabertura, modelos, avaliação, anexos e identificação de parceiro | Canal de simulação restrito; grupos sem respostas automáticas; instância ligada à empresa; manter realtime/polling e entrega real |
| Portal do parceiro | Login, carteira/detalhes, simulações API/planilha, suporte/avaliação, contato/senha | Sessão e acesso por parceiro/tenant; nunca reutilizar datasets globais da mesa |
| GeneralFinanceView | Entradas/saídas, categorias/status/vencimentos, consulta, criação, alteração e exclusão autorizadas | /api/financial; diferenciar caixa, receita/comissão e valores de proposta; não inventar módulos de comissão ausentes |
| BI, Radar, gargalos, intelligence | Filtros, indicadores, comparação, insights, investigação, ações existentes, exports e explicações | Serviços analytics/bi/intelligence; mesmas fórmulas e permissões, sem métricas fictícias |
| Agenda, Minha Fila, Gamificação, TV, OperationsCentral | Tarefas, atribuições, prazos, conquistas/metas, monitor, comunicados e saúde API | Preservar módulos separados e filtros específicos |
| Administração | Usuários, senha/credenciais, memberships, perfis customizados, produtos, status/importação, calendário, auditoria, convênios, regras, marca, comunicados | Mesmos limites por papel/ação e confirmação para operações destrutivas |
| Plataforma e plano | Empresas/assinaturas, capacidade/consumo, contexto administrativo, domínios e ações tenant | Separar PLATFORM_MASTER global de MASTER da empresa; não mudar planos/limites/schema |
| Automações | Construtor visual, gatilhos, execuções, timeline, teste, ativação e ações autorizadas | Sem executar automação real para testar aspecto visual |

## 6. Perfis, permissões e isolamento

Fontes: src/types/index.ts, src/lib/permissions.ts, src/router/routes.ts, src/lib/supportAccess.ts e handlers do servidor.

| Perfil | Escopo padrão observado / atenção |
|---|---|
| PLATFORM_MASTER | Todas as permissões; contexto global ou empresa autorizada; requiredRoles continua aplicável |
| MASTER | Permissões padrão exceto tenants.*; empresa, sem promover automaticamente a administrador global |
| TENANT_ADMIN | Conjunto explícito de CRUD e gestão; não assumir equivalência com MASTER em ações restritas por papel |
| GESTOR | Gestão/BI, operações e parte das ações; não importar planilha só por ter integrations.view |
| GERENTE | Visões gerenciais e ações limitadas; manter restrições de exclusão/configuração |
| SUPORTE | Atendimento e operações limitadas; departamento SIMULATION excluído |
| DIGITADOR | Consulta/criação de propostas/clientes/ADEs/tarefas; não conceder update por arrastar card |
| SIMULACAO | Consulta/criação/atualização de simulações e suporte da mesa; não conceder gestão financeira/admin |
| Parceiro externo | PartnerPortalAccess/Session, não é um Role de usuário interno |

UserTenantMembership guarda papel/permissões por tenant e vínculo ativo. Dados de sessão resolvem effectiveTenantId e contexto administrativo no servidor. A UI usa hasPermission/canAccessRoute, mas deve preservar verificações adicionais por ação e backend.

Support SIMULATION: apenas SIMULACAO, MASTER, GESTOR, GERENTE; PLATFORM_MASTER é tratado como MASTER no contexto autorizado. Custom permissions não removem o filtro de departamento do backend.

Risco detectado: TenantSecurityService legado considera MASTER e PLATFORM_MASTER como globais em helper local. Não reutilizar esse helper como autorização de novos menus; manter contexto efetivo/servidor. Corrigir semântica de segurança exigiria escopo e autorização próprios, fora da alteração visual.

## 7. Autenticação, cache, branding e realtime

- Sessão server-side com cookies HttpOnly; /api/auth/session, login, memberships, switch-tenant e contexto administrativo. App.tsx valida sessão e força logout em falha.
- Header troca empresa pelos endpoints existentes, limpa cache de negócios e recarrega. Preservar essa fronteira antes de considerar navegação sem reload.
- StorageService centraliza cache e sync. Preferências workspace usam hostname+tenant+usuário e guardam caminhos, não CPF. Filtros salvos devem manter segmentação e rechecagem de permissão.
- ThemeContext e useTenantBranding/brandingService resolvem identidade. Logo, favicon e título devem corresponder ao domínio/empresa, mantendo padrão Sentinel e fallback seguro.
- realtimeService suporta Pusher/SSE, contextos tenant/user e ponte local; servidor realtime/pusher/eventBus. Preservar inscrição/autorização/reconexão e limpar contexto ao trocar tenant.
- Duas paletas de busca leem cache/StorageService. UniversalCommandPalette também consulta /api/tasks. Busca não equivale a índice completo do servidor. Cobertura de registros depende de dados carregados; consolidar apenas fontes reais, filtrar por acesso e impedir resposta tardia do tenant anterior.

## 8. Integrações e limites imutáveis

C6, FACTA, BMG, HAPPY/BYX, FINANTO, Nossa Fintech; planilhas Daycoval/C6/Paraná. Serviços específicos de auth/simulação/proposta/status/sync/calculation encontrados em server/services. Evolution API atende WhatsApp; Pusher/SSE realtime; Azure Blob/backupStorage arquivos; DNS/domínios, notificações, automação e IA têm serviços próprios.

Uma integração presente não está automaticamente habilitada para todos os produtos/empresas. Preservar gates, permissões, credenciais por tenant, timeouts/retries, payloads, retornos, identificação externa e sincronização de status/valores. C6 PORT+REFIN segue a planilha; não reativar API para esse fluxo durante redesign.

## 9. Matriz de regressão a executar após aprovação

Todos os itens estão NÃO EXECUTADOS nesta etapa. Testes citados são cobertura candidata, não garantia de que cobrem toda a coluna.

| ID | Caminho atual → acesso proposto | Fluxos e verificações | Cobertura candidata / necessidade |
|---|---|---|---|
| R01 | /login → acesso operacional | Sessão válida/inválida, senha forçada, seleção de membership, reload e logout | auth_password, auth_rbac, auth_password.test; inspeção de setup antes de rodar |
| R02 | Topbar/contexto → seletor de empresa sempre visível | A→B→A, empresa suspensa, custom permissions, cache/resposta atrasada, busca/realtime sem dados cruzados | multitenant, security_and_multitenant, auth_rbac; nova regressão de estado visual |
| R03 | Todas as rotas/aliases → mesmo URL e grupo novo | Entrada direta, refresh, back/forward, 404, acesso negado, papel/custom permissions | integration/routing; nova paridade catálogo/menu |
| R04 | /propostas e detalhe → Produção/tabela/kanban/drawer | Criar/editar/excluir autorizado, campos/validações, vínculo, status e rejeição de transição | new_production_persistence, partner_promoter_binding, official_status_loading; regressão visual sem mutações reais |
| R05 | Import/export/status lote → barra de ações | Templates, filtros, seleção, paginação, erros e confirmação | lacuna de cobertura visual e formato de exportação; usar fixtures |
| R06 | /esteira → Produção/Esteira | Status reais, detalhe, update autorizado, usuário sem update, calendário e SLA | portability_alcada_sla; nova regressão Kanban/ação de transição |
| R07 | /simulacoes → Produção/Simulações | APIs/planilhas, solicitações/fila/relatório, taxas, regras de idade, acompanhamento e resultados | inss_draft_flow, facta_simulations, simulation_selection, refinancing_rates, product_simulations, inss_novo_regression |
| R08 | Importar/ativar planilha → Integrações/Planilhas | Versão correta por banco/empresa, MASTER autorizado, impossibilidade de importar como parceiro/gestor | nova regressão de permissões, seleção de banco e retenção de campos |
| R09 | /portabilidade → Produção/CIP | ADE, retorno, alçada, saldo, troco, calendário/dias úteis | portability_alcada_sla, facta_status_mapping, c6_proposal_sync |
| R10 | /central-pendencias → Produção/Pendências | Criar/atribuir/resolver/reabrir, SLA, prioridade e histórico | pendencies_sla_phase2; novos testes de filtros/tema/teclado |
| R11 | /clientes → Relacionamento/Cliente 360 | Mesmo CPF, múltiplas ADEs, notas, arquivos, comunicação, erro de upload e acesso | new_production_persistence e lacunas documentais/visuais |
| R12 | /crm-parceiros → Relacionamento/CRM | CRUD autorizado, notas/tarefas, importação, portal/acessos | partner_promoter_binding, partner_portal_provisioning; scripts CRM só com base isolada |
| R13 | /central-atendimento → Relacionamento/Atendimento | Fila/mensagem imediata, resposta/avaliação/modelos, grupos, parceiro validado, departamento/tenant | partner_portal e lacunas de webhook/realtime, sessão e instância de teste necessárias |
| R14 | /parceiro/* e aba simulações → portal próprio | Login, histórico, detalhe, chat, avaliação, campos e marca da empresa | partner_portal, partner_portal_provisioning, simulation_selection; nova rota frontend avaliada após aprovação |
| R15 | /financeiro-geral → Financeiro/Fluxo | Filtros, valores, vencimentos e CRUD autorizado | lacuna UI; não executar pagamentos/lançamentos reais |
| R16 | /bi, radar, gargalos → Gestão | Mesma base/cálculo, filtro/período, export e dashboards por papel | bi_phase6_audit; identificar base dos indicadores existentes |
| R17 | /intelligence, /command-center → Gestão | Insights/incidentes, investigação, comentários, ações e permissões | intelligence_phase7; não disparar ações reais |
| R18 | /minha-fila, agenda, gamificação, TV, operações → Início/Produção/Gestão | Tarefas, agenda, comunicações, monitor e atalhos | cobertura visual e a11y a criar |
| R19 | Administração/abas → Administração | CRUD por ação, membership, papéis, produtos, status, calendário, audit, marca, convênio, regras | users, auth_rbac, auditlog, official_status_loading; não aplicar migrações |
| R20 | /integracoes, /saude-apis, bancos → Integrações | Credenciais, consulta, erro/timeout, sync/status, logs/incidentes e ordens por modalidade | hub_integracoes_phase4, happy_integration, c6_proposal_sync e status mappings; sandbox/fixtures |
| R21 | Empresas/plano/domínios → Plataforma/Admin conforme acesso | CRUD/soft delete autorizado, capacidade, marca, aliases/domínio e isolamento | multitenant, partner_portal_provisioning; scripts bulk delete não executar nesta etapa |
| R22 | Automações/backup/notificações → ações e módulos existentes | Builder/timeline, confirmação, leitura/export, realtime e erro | automations_phase3, backupStorage, backup; preservar bloqueio de ações destrutivas |
| R23 | Todos → shell novo | Claro/escuro, 1920×1080, 1366×768, tablet/mobile, teclado/foco/Escape, menus/modais/scroll e console | nova regressão frontend; build/typecheck são só evidência técnica |

## 10. Testes e estado da execução

package.json: lint = tsc --noEmit, test = vitest run, build = prisma generate + vite + esbuild. Não existe comando ESLint separado. vercel-build executa prisma migrate deploy, portanto não utilizar esse comando durante o redesign.

Testes de integração importam server/prisma e alguns criam/apagam fixtures (ex.: bootstrap e multitenant). Testes de scripts também podem mutar dados/chamar serviços externos. Antes de executar: provar DATABASE_URL de teste isolada, desativar crons/sync/efeitos externos e revisar setup. Esta etapa não roda migrações nem testes com escrita. Credenciais bancárias/sessões/browser e webhook controlado podem bloquear regressões ao vivo; registrar individualmente, sem marcar como aprovado.

### Arquivos de testes Vitest encontrados

- `tests/clt_customer_display.test.tsx`
- `tests/facta_simulations.test.tsx`
- `tests/inss_draft_flow.test.tsx`
- `tests/inss_eligibility.test.ts`
- `tests/inss_novo_regression.test.ts`
- `tests/integration/auditlog.test.ts`
- `tests/integration/auth_password.test.ts`
- `tests/integration/auth_rbac.test.ts`
- `tests/integration/automations_phase3.test.ts`
- `tests/integration/backup.test.ts`
- `tests/integration/backupStorage.test.ts`
- `tests/integration/bi_phase6_audit.test.ts`
- `tests/integration/bootstrap.test.ts`
- `tests/integration/c6_proposal_sync.test.ts`
- `tests/integration/c6_status_mapping.test.ts`
- `tests/integration/cron.test.ts`
- `tests/integration/facta_status_mapping.test.ts`
- `tests/integration/happy_homologacao.test.ts`
- `tests/integration/happy_integration.test.ts`
- `tests/integration/happy_simulation_audit.test.ts`
- `tests/integration/hub_integracoes_phase4.test.ts`
- `tests/integration/inss_provider_calculation.test.ts`
- `tests/integration/intelligence_phase7.test.ts`
- `tests/integration/multitenant.test.ts`
- `tests/integration/new_production_persistence.test.ts`
- `tests/integration/official_status_loading.test.ts`
- `tests/integration/partner_portal.test.ts`
- `tests/integration/partner_portal_provisioning.test.ts`
- `tests/integration/partner_promoter_binding.test.ts`
- `tests/integration/pendencies_sla_phase2.test.ts`
- `tests/integration/portability_alcada_sla.test.ts`
- `tests/integration/routing.test.ts`
- `tests/integration/users.test.ts`
- `tests/nossa_fintech_request.test.ts`
- `tests/nossa_fintech_table_names.test.ts`
- `tests/product_simulations.test.tsx`
- `tests/refinancing_rates.test.ts`
- `tests/security_and_multitenant.test.ts`
- `tests/simulation_selection.test.tsx`

## 11. Catálogo de componentes (preservar até confirmar uso)

- `src/components/admin/AnnouncementsManagement.tsx`
- `src/components/admin/AuditLogView.tsx`
- `src/components/admin/automations/AutomationExecutionTimelineModal.tsx`
- `src/components/admin/automations/AutomationTestModal.tsx`
- `src/components/admin/automations/AutomationVisualBuilder.tsx`
- `src/components/admin/BackupManagementModal.tsx`
- `src/components/admin/BankPromoterManagement.tsx`
- `src/components/admin/CentralAdministracao.tsx`
- `src/components/admin/CentralAutomacoes.tsx`
- `src/components/admin/CentralPendencias.tsx`
- `src/components/admin/ConvenioManagement.tsx`
- `src/components/admin/DomainManagement.tsx`
- `src/components/admin/HolidayManagement.tsx`
- `src/components/admin/HubIntegracoes.tsx`
- `src/components/admin/NewUserCredentialsModal.tsx`
- `src/components/admin/OperationalRulesManagement.tsx`
- `src/components/admin/PartnerImportModal.tsx`
- `src/components/admin/PartnerManagement.tsx`
- `src/components/admin/PerfisPermissoesView.tsx`
- `src/components/admin/ProductImportModal.tsx`
- `src/components/admin/ProductManagement.tsx`
- `src/components/admin/StatusImport.tsx`
- `src/components/admin/StatusManagement.tsx`
- `src/components/admin/TenantSaaSCapacityView.tsx`
- `src/components/admin/TestRunnerModal.tsx`
- `src/components/admin/UserDetailsModal.tsx`
- `src/components/admin/UserManagement.tsx`
- `src/components/admin/WhiteLabelModal.tsx`
- `src/components/agenda/MyTaskQueueView.tsx`
- `src/components/agenda/OperationalAgendaView.tsx`
- `src/components/ai/SentinelaAIChat.tsx`
- `src/components/auth/AuthFrame.tsx`
- `src/components/auth/ChangePasswordModal.tsx`
- `src/components/auth/ForcePasswordChangeModal.tsx`
- `src/components/auth/LoginView.tsx`
- `src/components/auth/TenantSelectionView.tsx`
- `src/components/bi/BIFilterBar.tsx`
- `src/components/bi/CommercialRadarView.tsx`
- `src/components/bi/ExecutiveBIDashboard.tsx`
- `src/components/bi/ExecutiveInsightsWidget.tsx`
- `src/components/bi/MarkdownRenderer.tsx`
- `src/components/bi/OperationalBIDashboard.tsx`
- `src/components/bi/OperationalHealthCard.tsx`
- `src/components/bi/SentinelaAIChat.tsx`
- `src/components/clients/Client360View.tsx`
- `src/components/CommandCenter/CommandCenterView.tsx`
- `src/components/common/AccessDeniedView.tsx`
- `src/components/common/ActionBar.tsx`
- `src/components/common/BrandLogo.tsx`
- `src/components/common/CommandPaletteModal.tsx`
- `src/components/common/DeleteConfirmationModal.tsx`
- `src/components/common/ErrorBoundary.tsx`
- `src/components/common/InteractiveTourModal.tsx`
- `src/components/common/KeyboardShortcutsModal.tsx`
- `src/components/common/MetricCard.tsx`
- `src/components/common/NotFoundView.tsx`
- `src/components/common/PartnerSearchSelect.tsx`
- `src/components/common/UniversalConfirmationModal.tsx`
- `src/components/crm/PartnerCrmHub.tsx`
- `src/components/crm/PartnerDetailModal.tsx`
- `src/components/crm/PartnerFormModal.tsx`
- `src/components/dashboard/ControlTower.tsx`
- `src/components/dashboard/CustomizeWidgetsModal.tsx`
- `src/components/dashboard/DigitizerHome.tsx`
- `src/components/dashboard/ExecutiveDashboard.tsx`
- `src/components/dashboard/StatusBottleneckReport.tsx`
- `src/components/finance/GeneralFinanceView.tsx`
- `src/components/gamification/GamificationCenter.tsx`
- `src/components/integrations/BankIntegrationsView.tsx`
- `src/components/integrations/BmgIntegrationTab.tsx`
- `src/components/integrations/C6BankConfigModal.tsx`
- `src/components/integrations/C6BankConfigView.tsx`
- `src/components/integrations/DaycovalWorkbookSettings.tsx`
- `src/components/integrations/FinantoIntegrationTab.tsx`
- `src/components/integrations/HappyIntegrationTab.tsx`
- `src/components/integrations/NossaFintechIntegrationTab.tsx`
- `src/components/integrations/SimulationBankOrderSettings.tsx`
- `src/components/intelligence/SentinelIntelligenceDashboard.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/NotificationsDrawer.tsx`
- `src/components/layout/RouteContextPanel.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/WorkspaceToolbar.tsx`
- `src/components/monitor/TVOperationsMonitor.tsx`
- `src/components/operations/AnnouncementsTab.tsx`
- `src/components/operations/ApiMonitoringTab.tsx`
- `src/components/operations/OperationsCentral.tsx`
- `src/components/partner-portal/PartnerPortalDashboard.tsx`
- `src/components/partner-portal/PartnerPortalLayout.tsx`
- `src/components/partner-portal/PartnerPortalLogin.tsx`
- `src/components/partner-portal/PartnerProfileView.tsx`
- `src/components/partner-portal/PartnerProposalDetailModal.tsx`
- `src/components/partner-portal/PartnerProposalsView.tsx`
- `src/components/partner-portal/PartnerSimulationsView.tsx`
- `src/components/partner-portal/PartnerSupportView.tsx`
- `src/components/partner-portal/SupportRating.tsx`
- `src/components/production/BmgProposalCard.tsx`
- `src/components/production/BulkStatusModal.tsx`
- `src/components/production/C6ProposalCard.tsx`
- `src/components/production/ExcelExportModal.tsx`
- `src/components/production/ExcelImportModal.tsx`
- `src/components/production/FactaProposalCard.tsx`
- `src/components/production/HappyProposalCard.tsx`
- `src/components/production/KanbanBoard.tsx`
- `src/components/production/NewProductionModal.tsx`
- `src/components/production/PortabilityView.tsx`
- `src/components/production/ProductionList.tsx`
- `src/components/production/ProposalDetailModal.tsx`
- `src/components/production/ProviderProposalSyncCard.tsx`
- `src/components/saas/PlatformMasterCentral.tsx`
- `src/components/search/UniversalCommandPalette.tsx`
- `src/components/simulation/BmgCltProposalForm.tsx`
- `src/components/simulation/BmgCustomerAuthorization.tsx`
- `src/components/simulation/CltCustomerDataCard.tsx`
- `src/components/simulation/DaycovalSimulationModal.tsx`
- `src/components/simulation/FactaSimulationResults.tsx`
- `src/components/simulation/FinantoInssSimulationModal.tsx`
- `src/components/simulation/HappyCltSimulationModal.tsx`
- `src/components/simulation/HappyInssSimulationModal.tsx`
- `src/components/simulation/InssBenefitTypeSelect.tsx`
- `src/components/simulation/NossaFintechPortRefinSimulationModal.tsx`
- `src/components/simulation/OrderedSimulationBanks.tsx`
- `src/components/simulation/PartnerSimulationMonthlyReport.tsx`
- `src/components/simulation/ProductSimulationModal.tsx`
- `src/components/simulation/SimulationFlowSelectorModal.tsx`
- `src/components/simulation/SimulationImportModal.tsx`
- `src/components/simulation/SimulationOfferCard.tsx`
- `src/components/simulation/SimulationView.tsx`
- `src/components/simulation/SpreadsheetPortRefinWorkspace.tsx`
- `src/components/support/CentralAtendimentoView.tsx`
- `src/components/support/SimulationWhatsAppConnection.tsx`
- `src/components/support/SupportCenter.tsx`
- `src/components/support/SupportReplyTemplates.tsx`
- `src/components/ui/ActionBar.tsx`
- `src/components/ui/AuthorityBadge.tsx`
- `src/components/ui/Breadcrumbs.tsx`
- `src/components/ui/EmptyState.tsx`
- `src/components/ui/ErrorState.tsx`
- `src/components/ui/MetricCard.tsx`
- `src/components/ui/RecordWorkspace.tsx`
- `src/components/ui/SavedFilterViews.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/components/ui/StatusBadge.tsx`
- `src/components/ui/ToastContainer.tsx`

## 12. Hooks, serviços e utilitários de infraestrutura

### src/hooks

- `src/hooks/useTenantBranding.ts`
- `src/hooks/useWorkspacePreferences.ts`

### src/services

- `src/services/analyticsApiService.ts`
- `src/services/auditApiService.ts`
- `src/services/automationService.ts`
- `src/services/backupService.ts`
- `src/services/biApiService.ts`
- `src/services/brandingService.ts`
- `src/services/bulkImportService.ts`
- `src/services/excelService.ts`
- `src/services/managerialIntelligenceApiService.ts`
- `src/services/partnerPortalClient.ts`
- `src/services/realtimeService.ts`
- `src/services/storageService.ts`
- `src/services/tenantSecurityService.ts`
- `src/services/testRunnerService.ts`

### src/context

- `src/context/ThemeContext.tsx`

### server/services

- `server/services/analyticsService.ts`
- `server/services/apiMonitoringService.ts`
- `server/services/auditLogService.ts`
- `server/services/automationEngine.ts`
- `server/services/azureBlobStorage.ts`
- `server/services/backupStorageService.ts`
- `server/services/biComparisonService.ts`
- `server/services/biService.ts`
- `server/services/bmgBankService.ts`
- `server/services/bmgProposalService.ts`
- `server/services/bmgRoutes.ts`
- `server/services/businessNotificationService.ts`
- `server/services/c6BankService.ts`
- `server/services/c6BankTypes.ts`
- `server/services/c6SimulationService.ts`
- `server/services/c6StatusMapper.ts`
- `server/services/c6SyncWorker.ts`
- `server/services/commandCenter/commandAlertEngine.ts`
- `server/services/commandCenter/commandCenterService.ts`
- `server/services/commandCenter/commandCenterTypes.ts`
- `server/services/commandCenter/impactAnalysisService.ts`
- `server/services/commandCenter/incidentLifecycle.ts`
- `server/services/commandCenter/incidentService.ts`
- `server/services/commandCenter/incidentSlaService.ts`
- `server/services/daycovalRoutes.ts`
- `server/services/daycovalWorkbook.ts`
- `server/services/dnsVerificationService.ts`
- `server/services/eventBus.ts`
- `server/services/evolutionService.ts`
- `server/services/factaBankService.ts`
- `server/services/factaBankTypes.ts`
- `server/services/factaSimulationService.ts`
- `server/services/factaStatusMapper.ts`
- `server/services/factaSyncWorker.ts`
- `server/services/factaTransport.ts`
- `server/services/finantoCalculation.ts`
- `server/services/finantoService.ts`
- `server/services/happyBankService.ts`
- `server/services/happyBankTypes.ts`
- `server/services/happySimulationService.ts`
- `server/services/happyStatusMapper.ts`
- `server/services/happyTokenManager.ts`
- `server/services/importWorker.ts`
- `server/services/inssSimulationDraft.ts`
- `server/services/integrationHubService.ts`
- `server/services/intelligence/anomalyDetectionService.ts`
- `server/services/intelligence/correlationService.ts`
- `server/services/intelligence/explanationService.ts`
- `server/services/intelligence/intelligenceRepository.ts`
- `server/services/intelligence/intelligenceRules.ts`
- `server/services/intelligence/intelligenceService.ts`
- `server/services/intelligence/intelligenceTypes.ts`
- `server/services/managerialIntelligenceService.ts`
- `server/services/nossaFintechService.ts`
- `server/services/partnerCrmService.ts`
- `server/services/partnerHappySimulation.ts`
- `server/services/partnerImportCredentials.ts`
- `server/services/partnerPortalService.ts`
- `server/services/partnerSimulationService.ts`
- `server/services/partnerSimulationTracking.ts`
- `server/services/passwordService.ts`
- `server/services/pendencyService.ts`
- `server/services/portabilityCronService.ts`
- `server/services/portRefinWorkbooks.ts`
- `server/services/productSimulationService.ts`
- `server/services/promoterService.ts`
- `server/services/pusherService.ts`
- `server/services/ruleEngineService.ts`
- `server/services/saasLimitsService.ts`
- `server/services/saasUsageService.ts`
- `server/services/sentinelaAIService.ts`
- `server/services/sentinelaToolRouter.ts`
- `server/services/simulationBankOrderRoutes.ts`
- `server/services/simulationService.ts`
- `server/services/statusService.ts`
- `server/services/supportService.ts`
- `server/services/tenantHealthService.ts`

### server/utils

- `server/utils/adminContext.ts`
- `server/utils/csrf.ts`
- `server/utils/tenantNormalization.ts`
- `server/utils/tenantResolver.ts`

## 13. Registros HTTP extraídos do código

Não são chamadas executadas. Métodos USE são montagem/middleware, não necessariamente endpoints finais. Contratos permanecem nos handlers referenciados. Registrar helpers dinâmicos junto ao apêndice.

| Método | Caminho/padrão | Fonte | Linha |
|---|---|---|---|
| GET | `/api/health` | `server.ts` | 585 |
| GET | `/api/public/tenant-branding` | `server.ts` | 643 |
| POST | `/api/auth/login` | `server.ts` | 667 |
| POST | `/api/auth/logout` | `server.ts` | 967 |
| POST | `/api/auth/update-password` | `server.ts` | 1012 |
| USE | `/api` | `server.ts` | 1206 |
| GET | `/api/auth/session` | `server.ts` | 1241 |
| POST | `/api/auth/switch-tenant` | `server.ts` | 1331 |
| POST | `/api/auth/change-password` | `server.ts` | 1420 |
| POST | `/api/pusher/auth` | `server.ts` | 1485 |
| GET | `/api/realtime` | `server.ts` | 1548 |
| GET | `/api/realtime/stats` | `server.ts` | 1611 |
| GET | `/api/clients` | `server.ts` | 1622 |
| POST | `/api/clients` | `server.ts` | 1649 |
| DELETE | `/api/clients/:id` | `server.ts` | 1841 |
| GET | `/api/clients/:id/notes` | `server.ts` | 1898 |
| POST | `/api/clients/:id/notes` | `server.ts` | 1925 |
| GET | `/api/clients/:id/communications` | `server.ts` | 1976 |
| POST | `/api/clients/:id/communications` | `server.ts` | 2002 |
| GET | `/api/simulations` | `server.ts` | 2083 |
| GET | `/api/simulations/:id` | `server.ts` | 2116 |
| POST | `/api/simulations` | `server.ts` | 2151 |
| PATCH | `/api/simulations/:id/status` | `server.ts` | 2350 |
| DELETE | `/api/simulations/:id` | `server.ts` | 2516 |
| POST | `/api/simulations/bulk-delete` | `server.ts` | 2591 |
| GET | `/api/settings/simulation-access` | `server.ts` | 2730 |
| GET | `/api/settings/happy-simulation-access` | `server.ts` | 2731 |
| PUT | `/api/settings/simulation-access` | `server.ts` | 2841 |
| PUT | `/api/settings/happy-simulation-access` | `server.ts` | 2842 |
| GET | `/api/proposals` | `server.ts` | 3046 |
| POST | `/api/proposals` | `server.ts` | 3068 |
| PATCH | `/api/proposals/:id` | `server.ts` | 3370 |
| POST | `/api/proposals/:id/comments` | `server.ts` | 3859 |
| GET | `/api/proposals/:id/comments` | `server.ts` | 3951 |
| GET | `/api/proposals/:id/timeline` | `server.ts` | 3976 |
| DELETE | `/api/proposals/:id` | `server.ts` | 4066 |
| GET | `/api/statuses` | `server.ts` | 4125 |
| POST | `/api/statuses` | `server.ts` | 4156 |
| PUT | `/api/statuses/reorder` | `server.ts` | 4218 |
| PUT | `/api/statuses/:id` | `server.ts` | 4254 |
| DELETE | `/api/statuses/:id` | `server.ts` | 4315 |
| GET | `/api/banks` | `server.ts` | 4380 |
| GET | `/api/promoters` | `server.ts` | 4396 |
| GET | `/api/partners` | `server.ts` | 4426 |
| GET | `/api/partners/:id` | `server.ts` | 4504 |
| GET | `/api/partners/:id/metrics` | `server.ts` | 4530 |
| GET | `/api/partners/:id/timeline` | `server.ts` | 4564 |
| GET | `/api/partners/:id/interactions` | `server.ts` | 4588 |
| POST | `/api/partners/:id/interactions` | `server.ts` | 4615 |
| GET | `/api/partners/:id/notes` | `server.ts` | 4658 |
| POST | `/api/partners/:id/notes` | `server.ts` | 4685 |
| GET | `/api/partners/:id/tasks` | `server.ts` | 4723 |
| POST | `/api/partners/:id/tasks` | `server.ts` | 4754 |
| PATCH | `/api/partners/tasks/:taskId` | `server.ts` | 4859 |
| PATCH | `/api/partners/:id/tasks/:taskId` | `server.ts` | 4860 |
| DELETE | `/api/partners/tasks/:taskId` | `server.ts` | 4861 |
| DELETE | `/api/partners/:id/tasks/:taskId` | `server.ts` | 4862 |
| GET | `/api/partners/:id/proposals` | `server.ts` | 4864 |
| GET | `/api/partners/:id/simulations` | `server.ts` | 4893 |
| GET | `/api/partners/:id/pendencies` | `server.ts` | 4916 |
| GET | `/api/products` | `server.ts` | 4939 |
| GET | `/api/financial` | `server.ts` | 4993 |
| POST | `/api/financial` | `server.ts` | 5012 |
| PUT | `/api/financial/:id` | `server.ts` | 5084 |
| DELETE | `/api/financial/:id` | `server.ts` | 5135 |
| GET | `/api/notifications/unread-count` | `server.ts` | 5170 |
| GET | `/api/notifications` | `server.ts` | 5185 |
| POST | `/api/notifications` | `server.ts` | 5220 |
| PATCH | `/api/notifications/:id/read` | `server.ts` | 5303 |
| POST | `/api/notifications/read-all` | `server.ts` | 5323 |
| GET | `/api/my-work` | `server.ts` | 5361 |
| GET | `/api/tasks` | `server.ts` | 5436 |
| POST | `/api/tasks` | `server.ts` | 5470 |
| PUT | `/api/tasks/:id` | `server.ts` | 5577 |
| DELETE | `/api/tasks/:id` | `server.ts` | 5672 |
| GET | `/api/documents` | `server.ts` | 5713 |
| POST | `/api/documents` | `server.ts` | 5741 |
| GET | `/api/documents/:id` | `server.ts` | 5899 |
| DELETE | `/api/documents/:id` | `server.ts` | 5960 |
| POST | `/api/partners` | `server.ts` | 6022 |
| PUT | `/api/partners/:id` | `server.ts` | 6372 |
| PATCH | `/api/partners/:id` | `server.ts` | 6373 |
| DELETE | `/api/partners/:id` | `server.ts` | 6375 |
| POST | `/api/partners/sync-local` | `server.ts` | 6438 |
| POST | `/api/promoters` | `server.ts` | 6524 |
| PUT | `/api/promoters/:id` | `server.ts` | 6552 |
| DELETE | `/api/promoters/:id` | `server.ts` | 6578 |
| POST | `/api/banks` | `server.ts` | 6600 |
| PUT | `/api/banks/:id` | `server.ts` | 6627 |
| DELETE | `/api/banks/:id` | `server.ts` | 6654 |
| GET | `/api/bank-promoters` | `server.ts` | 6676 |
| POST | `/api/bank-promoters` | `server.ts` | 6692 |
| DELETE | `/api/bank-promoters/:id` | `server.ts` | 6743 |
| POST | `/api/products` | `server.ts` | 6765 |
| PUT | `/api/products/:id` | `server.ts` | 6854 |
| DELETE | `/api/products/:id` | `server.ts` | 6924 |
| GET | `/api/convenios` | `server.ts` | 6968 |
| POST | `/api/convenios` | `server.ts` | 7008 |
| PUT | `/api/convenios/:id` | `server.ts` | 7077 |
| DELETE | `/api/convenios/:id` | `server.ts` | 7132 |
| GET | `/api/operational-rules` | `server.ts` | 7176 |
| POST | `/api/operational-rules` | `server.ts` | 7213 |
| PUT | `/api/operational-rules/:id` | `server.ts` | 7265 |
| DELETE | `/api/operational-rules/:id` | `server.ts` | 7314 |
| GET | `/api/whitelabel` | `server.ts` | 7346 |
| PUT | `/api/whitelabel` | `server.ts` | 7360 |
| GET | `/api/audit-logs` | `server.ts` | 7421 |
| GET | `/api/audit-logs/verify-integrity` | `server.ts` | 7571 |
| GET | `/api/audit-logs/failed-queue` | `server.ts` | 7597 |
| GET | `/api/users` | `server.ts` | 7618 |
| POST | `/api/users` | `server.ts` | 7671 |
| PUT | `/api/users/:id` | `server.ts` | 7941 |
| GET | `/api/users/:id/memberships` | `server.ts` | 8181 |
| POST | `/api/users/:id/memberships` | `server.ts` | 8229 |
| PUT | `/api/users/:id/memberships/:membershipId` | `server.ts` | 8327 |
| DELETE | `/api/users/:id/memberships/:membershipId` | `server.ts` | 8381 |
| POST | `/api/users/:id/reset-password` | `server.ts` | 8415 |
| DELETE | `/api/users/:id` | `server.ts` | 8513 |
| GET | `/api/saas/metrics` | `server.ts` | 8677 |
| GET | `/api/admin/metrics` | `server.ts` | 8678 |
| GET | `/api/saas/tenants` | `server.ts` | 8815 |
| GET | `/api/admin/tenants` | `server.ts` | 8816 |
| GET | `/api/tenants` | `server.ts` | 8817 |
| GET | `/api/saas/tenants/:id` | `server.ts` | 8880 |
| GET | `/api/admin/tenants/:id` | `server.ts` | 8881 |
| GET | `/api/tenants/:id` | `server.ts` | 8882 |
| GET | `/api/saas/tenants/:id/usage` | `server.ts` | 8916 |
| GET | `/api/saas/tenants/:id/limits` | `server.ts` | 8950 |
| GET | `/api/saas/tenants/:id/health` | `server.ts` | 8984 |
| GET | `/api/saas/usage/overview` | `server.ts` | 9129 |
| POST | `/api/saas/tenants` | `server.ts` | 9362 |
| POST | `/api/admin/tenants` | `server.ts` | 9363 |
| POST | `/api/tenants` | `server.ts` | 9364 |
| PUT | `/api/saas/tenants/:id` | `server.ts` | 9593 |
| PUT | `/api/admin/tenants/:id` | `server.ts` | 9594 |
| PUT | `/api/tenants/:id` | `server.ts` | 9595 |
| POST | `/api/saas/tenants/:id/suspend` | `server.ts` | 9659 |
| POST | `/api/admin/tenants/:id/suspend` | `server.ts` | 9660 |
| POST | `/api/saas/tenants/:id/reactivate` | `server.ts` | 9717 |
| POST | `/api/admin/tenants/:id/reactivate` | `server.ts` | 9718 |
| DELETE | `/api/saas/tenants/:id` | `server.ts` | 9816 |
| DELETE | `/api/admin/tenants/:id` | `server.ts` | 9817 |
| POST | `/api/saas/tenants/bulk-delete` | `server.ts` | 10149 |
| POST | `/api/admin/tenants/bulk-delete` | `server.ts` | 10150 |
| POST | `/api/saas/users/bulk-delete` | `server.ts` | 10447 |
| POST | `/api/admin/users/bulk-delete` | `server.ts` | 10448 |
| POST | `/api/saas/context-switch` | `server.ts` | 10511 |
| POST | `/api/admin/switch-tenant` | `server.ts` | 10512 |
| POST | `/api/saas/context-switch/exit` | `server.ts` | 10553 |
| POST | `/api/admin/exit-context` | `server.ts` | 10554 |
| GET | `/api/saas/context-switch/status` | `server.ts` | 10572 |
| GET | `/api/admin/context-status` | `server.ts` | 10573 |
| GET | `/api/admin/tenants/:id/domains` | `server.ts` | 10618 |
| GET | `/api/saas/tenants/:id/domains` | `server.ts` | 10619 |
| POST | `/api/admin/tenants/:id/domains` | `server.ts` | 10733 |
| POST | `/api/saas/tenants/:id/domains` | `server.ts` | 10734 |
| POST | `/api/admin/tenants/:id/domains/:domainId/verify` | `server.ts` | 10853 |
| POST | `/api/saas/tenants/:id/domains/:domainId/verify` | `server.ts` | 10854 |
| POST | `/api/admin/tenants/:id/domains/:domainId/primary` | `server.ts` | 10933 |
| POST | `/api/saas/tenants/:id/domains/:domainId/primary` | `server.ts` | 10934 |
| POST | `/api/admin/tenants/:id/domains/:domainId/disable` | `server.ts` | 11001 |
| POST | `/api/saas/tenants/:id/domains/:domainId/disable` | `server.ts` | 11002 |
| DELETE | `/api/admin/tenants/:id/domains/:domainId` | `server.ts` | 11079 |
| DELETE | `/api/saas/tenants/:id/domains/:domainId` | `server.ts` | 11080 |
| POST | `/api/import/proposals` | `server.ts` | 11096 |
| POST | `/api/import/status` | `server.ts` | 11234 |
| POST | `/api/import/products` | `server.ts` | 11340 |
| POST | `/api/import/partners` | `server.ts` | 11485 |
| GET | `/api/import/:id/partner-credentials` | `server.ts` | 11567 |
| GET | `/api/import/:id` | `server.ts` | 11582 |
| POST | `/api/import/:id/cancel` | `server.ts` | 11620 |
| GET | `/api/analytics/bottlenecks` | `server.ts` | 11717 |
| GET | `/api/analytics/dwell-time` | `server.ts` | 11740 |
| GET | `/api/analytics/aging` | `server.ts` | 11763 |
| GET | `/api/analytics/production` | `server.ts` | 11786 |
| GET | `/api/analytics/sla` | `server.ts` | 11809 |
| GET | `/api/bi/overview` | `server.ts` | 11884 |
| GET | `/api/bi/production` | `server.ts` | 11907 |
| GET | `/api/bi/banks` | `server.ts` | 11930 |
| GET | `/api/bi/partners` | `server.ts` | 11953 |
| GET | `/api/bi/comparison` | `server.ts` | 11976 |
| GET | `/api/bi/rankings` | `server.ts` | 11999 |
| GET | `/api/bi/conversion` | `server.ts` | 12022 |
| GET | `/api/bi/products` | `server.ts` | 12045 |
| GET | `/api/bi/convenios` | `server.ts` | 12068 |
| GET | `/api/bi/operators` | `server.ts` | 12091 |
| GET | `/api/bi/pendencies` | `server.ts` | 12114 |
| GET | `/api/bi/bottlenecks` | `server.ts` | 12137 |
| GET | `/api/bi/cancellations` | `server.ts` | 12160 |
| GET | `/api/bi/refusals` | `server.ts` | 12183 |
| GET | `/api/bi/integrations` | `server.ts` | 12206 |
| GET | `/api/bi/operational-health` | `server.ts` | 12229 |
| POST | `/api/bi/export` | `server.ts` | 12252 |
| GET | `/api/bi/insights` | `server.ts` | 12366 |
| GET | `/api/bi/health-score` | `server.ts` | 12393 |
| GET | `/api/intelligence/overview` | `server.ts` | 12424 |
| GET | `/api/intelligence/insights` | `server.ts` | 12444 |
| GET | `/api/intelligence/insights/:id` | `server.ts` | 12474 |
| POST | `/api/intelligence/insights/:id/acknowledge` | `server.ts` | 12498 |
| POST | `/api/intelligence/insights/:id/investigate` | `server.ts` | 12540 |
| POST | `/api/intelligence/insights/:id/resolve` | `server.ts` | 12582 |
| POST | `/api/intelligence/insights/:id/dismiss` | `server.ts` | 12624 |
| POST | `/api/intelligence/insights/:id/create-pendency` | `server.ts` | 12666 |
| GET | `/api/intelligence/insights/:id/evidence` | `server.ts` | 12705 |
| GET | `/api/intelligence/insights/:id/timeline` | `server.ts` | 12729 |
| GET | `/api/intelligence/rules` | `server.ts` | 12749 |
| PATCH | `/api/intelligence/rules/:id` | `server.ts` | 12769 |
| POST | `/api/intelligence/run` | `server.ts` | 12806 |
| GET | `/api/intelligence/metrics` | `server.ts` | 12834 |
| GET | `/api/command-center/overview` | `server.ts` | 12858 |
| GET | `/api/command-center/incidents` | `server.ts` | 12878 |
| POST | `/api/command-center/incidents` | `server.ts` | 12934 |
| POST | `/api/command-center/incidents/from-insight` | `server.ts` | 12985 |
| GET | `/api/command-center/incidents/:id` | `server.ts` | 13022 |
| PATCH | `/api/command-center/incidents/:id/status` | `server.ts` | 13048 |
| POST | `/api/command-center/incidents/:id/pendency` | `server.ts` | 13089 |
| POST | `/api/command-center/incidents/:id/comments` | `server.ts` | 13136 |
| POST | `/api/command-center/incidents/:id/recalculate-impact` | `server.ts` | 13177 |
| GET | `/api/command-center/sla-configs` | `server.ts` | 13194 |
| PUT | `/api/command-center/sla-configs` | `server.ts` | 13210 |
| GET | `/api/command-center/timeline` | `server.ts` | 13242 |
| GET | `/api/command-center/search` | `server.ts` | 13259 |
| GET | `/api/command-center/alerts` | `server.ts` | 13276 |
| POST | `/api/sentinela/query` | `server.ts` | 13314 |
| GET | `/api/cron/partner-simulations` | `server.ts` | 13388 |
| POST | `/api/cron/operational-rules` | `server.ts` | 13404 |
| GET | `/api/operational-calendar` | `server.ts` | 13511 |
| PUT | `/api/operational-calendar` | `server.ts` | 13524 |
| POST | `/api/announcements` | `server.ts` | 13606 |
| GET | `/api/announcements/manage` | `server.ts` | 13659 |
| GET | `/api/announcements` | `server.ts` | 13685 |
| GET | `/api/announcements/unread-count` | `server.ts` | 13739 |
| GET | `/api/announcements/:id` | `server.ts` | 13783 |
| PUT | `/api/announcements/:id` | `server.ts` | 13810 |
| POST | `/api/announcements/:id/publish` | `server.ts` | 13874 |
| POST | `/api/announcements/:id/cancel` | `server.ts` | 13925 |
| POST | `/api/announcements/:id/archive` | `server.ts` | 13973 |
| DELETE | `/api/announcements/:id` | `server.ts` | 14021 |
| POST | `/api/announcements/:id/read` | `server.ts` | 14052 |
| POST | `/api/announcements/:id/dismiss` | `server.ts` | 14091 |
| GET | `/api/monitoring/services` | `server.ts` | 14136 |
| GET | `/api/monitoring/health` | `server.ts` | 14150 |
| POST | `/api/monitoring/services/:id/ping` | `server.ts` | 14164 |
| POST | `/api/monitoring/ping-all` | `server.ts` | 14177 |
| PATCH | `/api/monitoring/services/:id` | `server.ts` | 14190 |
| GET | `/api/monitoring/incidents` | `server.ts` | 14219 |
| POST | `/api/monitoring/incidents` | `server.ts` | 14234 |
| PATCH | `/api/monitoring/incidents/:id` | `server.ts` | 14273 |
| POST | `/api/proposals/:id/c6-sync` | `server.ts` | 14307 |
| GET | `/api/proposals/:id/c6-history` | `server.ts` | 14381 |
| POST | `/api/proposals/:id/c6-link` | `server.ts` | 14400 |
| GET | `/api/integrations/finanto/config` | `server.ts` | 14441 |
| POST | `/api/integrations/finanto/config` | `server.ts` | 14457 |
| POST | `/api/integrations/finanto/test-connection` | `server.ts` | 14476 |
| GET | `/api/address/cep/:cep` | `server.ts` | 14492 |
| POST | `/api/integrations/finanto/inss/documents/:action` | `server.ts` | 14505 |
| POST | `/api/integrations/finanto/inss/simulations` | `server.ts` | 14521 |
| POST | `/api/proposals/:id/finanto-link` | `server.ts` | 14684 |
| POST | `/api/proposals/:id/finanto-sync` | `server.ts` | 14720 |
| POST | `/api/integrations/finanto/inss/simulations/:id/auth-term` | `server.ts` | 14753 |
| POST | `/api/integrations/finanto/request` | `server.ts` | 14787 |
| POST | `/api/integrations/facta/inss/:action` | `server.ts` | 14825 |
| POST | `/api/simulations/products/:product/:action` | `server.ts` | 14842 |
| GET | `/api/integrations/nossa-fintech/config` | `server.ts` | 14871 |
| POST | `/api/integrations/nossa-fintech/config` | `server.ts` | 14883 |
| POST | `/api/integrations/nossa-fintech/test-connection` | `server.ts` | 14903 |
| POST | `/api/integrations/nossa-fintech/request` | `server.ts` | 14915 |
| POST | `/api/integrations/nossa-fintech/port-refin/simulate-all` | `server.ts` | 14933 |
| POST | `/api/integrations/nossa-fintech/inss/novo/simulate-all` | `server.ts` | 14959 |
| POST | `/api/proposals/:id/nossa-fintech-link` | `server.ts` | 14981 |
| POST | `/api/proposals/:id/nossa-fintech-sync` | `server.ts` | 15002 |
| POST | `/api/integrations/c6/inss/simulate` | `server.ts` | 15054 |
| GET | `/api/integrations/c6/config` | `server.ts` | 15066 |
| POST | `/api/integrations/c6/config` | `server.ts` | 15097 |
| POST | `/api/integrations/c6/test-connection` | `server.ts` | 15160 |
| GET | `/api/integrations/c6/status` | `server.ts` | 15182 |
| POST | `/api/integrations/c6/run-sync` | `server.ts` | 15200 |
| GET | `/api/integrations/c6/recent-logs` | `server.ts` | 15229 |
| POST | `/api/proposals/:id/facta-sync` | `server.ts` | 15258 |
| GET | `/api/proposals/:id/facta-history` | `server.ts` | 15332 |
| POST | `/api/proposals/:id/facta-link` | `server.ts` | 15351 |
| GET | `/api/integrations/facta/config` | `server.ts` | 15393 |
| POST | `/api/integrations/facta/config` | `server.ts` | 15429 |
| POST | `/api/integrations/facta/test-connection` | `server.ts` | 15522 |
| GET | `/api/integrations/facta/status` | `server.ts` | 15544 |
| POST | `/api/integrations/facta/run-sync` | `server.ts` | 15562 |
| GET | `/api/integrations/facta/recent-logs` | `server.ts` | 15591 |
| POST | `/api/proposals/:id/happy-sync` | `server.ts` | 15616 |
| GET | `/api/integrations/happy/config` | `server.ts` | 15665 |
| POST | `/api/integrations/happy/config` | `server.ts` | 15683 |
| POST | `/api/integrations/happy/test-connection` | `server.ts` | 15708 |
| GET | `/api/integrations/happy/status` | `server.ts` | 15730 |
| POST | `/api/integrations/happy/consult-contract` | `server.ts` | 15749 |
| POST | `/api/integrations/happy/run-sync` | `server.ts` | 15769 |
| GET | `/api/integrations/happy/recent-logs` | `server.ts` | 15792 |
| GET | `/api/integrations/happy/unmatched-webhooks` | `server.ts` | 15826 |
| POST | `/api/integrations/happy/inss/cliente` | `server.ts` | 15867 |
| POST | `/api/integrations/happy/inss/in100` | `server.ts` | 15971 |
| POST | `/api/integrations/happy/inss/simulacao-margem` | `server.ts` | 16011 |
| POST | `/api/integrations/happy/inss/simulacao-portabilidade` | `server.ts` | 16049 |
| POST | `/api/integrations/happy/clt/cliente` | `server.ts` | 16105 |
| POST | `/api/integrations/happy/clt/dataprev` | `server.ts` | 16203 |
| POST | `/api/integrations/happy/clt/simulacao` | `server.ts` | 16252 |
| POST | `/api/integrations/happy/webhook` | `server.ts` | 16304 |
| POST | `/api/webhooks/happy/status` | `server.ts` | 16348 |
| GET | `/api/admin/overview` | `server.ts` | 16405 |
| GET | `/api/admin/roles-permissions` | `server.ts` | 16506 |
| GET | `/api/automations` | `server.ts` | 16556 |
| GET | `/api/automations/templates` | `server.ts` | 16590 |
| GET | `/api/automations/catalog` | `server.ts` | 16601 |
| GET | `/api/automations/metrics` | `server.ts` | 16629 |
| GET | `/api/automations/executions` | `server.ts` | 16687 |
| GET | `/api/automations/:id` | `server.ts` | 16740 |
| POST | `/api/automations` | `server.ts` | 16778 |
| PUT | `/api/automations/:id` | `server.ts` | 16837 |
| POST | `/api/automations/:id/toggle` | `server.ts` | 16899 |
| POST | `/api/automations/:id/duplicate` | `server.ts` | 16945 |
| POST | `/api/automations/test` | `server.ts` | 16996 |
| POST | `/api/automations/:id/test` | `server.ts` | 17019 |
| DELETE | `/api/automations/:id` | `server.ts` | 17057 |
| GET | `/api/pendencies/metrics` | `server.ts` | 17096 |
| GET | `/api/pendencies/sla-config` | `server.ts` | 17116 |
| PUT | `/api/pendencies/sla-config` | `server.ts` | 17136 |
| GET | `/api/pendencies` | `server.ts` | 17167 |
| GET | `/api/pendencies/:id` | `server.ts` | 17289 |
| POST | `/api/pendencies` | `server.ts` | 17342 |
| POST | `/api/pendencies/:id/assign` | `server.ts` | 17425 |
| POST | `/api/pendencies/:id/resolve` | `server.ts` | 17463 |
| POST | `/api/pendencies/:id/cancel` | `server.ts` | 17503 |
| POST | `/api/pendencies/:id/reopen` | `server.ts` | 17539 |
| POST | `/api/pendencies/:id/comments` | `server.ts` | 17574 |
| POST | `/api/pendencies/:id/status` | `server.ts` | 17609 |
| DELETE | `/api/pendencies/:id` | `server.ts` | 17653 |
| GET | `/api/integrations/health` | `server.ts` | 17688 |
| POST | `/api/integrations/:slug/health` | `server.ts` | 17716 |
| POST | `/api/integrations/:slug/diagnose` | `server.ts` | 17751 |
| GET | `/api/integrations/:slug/stats` | `server.ts` | 17786 |
| GET | `/api/integrations/logs` | `server.ts` | 17812 |
| GET | `/api/integrations/incidents` | `server.ts` | 17857 |
| POST | `/api/integrations/:slug/sync` | `server.ts` | 17883 |
| POST | `/api/admin/backups` | `server.ts` | 17933 |
| GET | `/api/admin/backups` | `server.ts` | 18018 |
| POST | `/api/admin/backups/:id/restore` | `server.ts` | 18056 |
| GET | `/api/partner-portal/simulations` | `server.ts` | 18143 |
| POST | `/api/partner-portal/simulations/:action` | `server.ts` | 18154 |
| POST | `/api/partner-portal/auth/login` | `server.ts` | 18201 |
| POST | `/api/partner-portal/auth/logout` | `server.ts` | 18232 |
| GET | `/api/partner-portal/auth/session` | `server.ts` | 18247 |
| POST | `/api/partner-portal/auth/change-password` | `server.ts` | 18267 |
| POST | `/api/partner-portal/profile/contact` | `server.ts` | 18294 |
| GET | `/api/partner-portal/dashboard` | `server.ts` | 18349 |
| GET | `/api/partner-portal/proposals` | `server.ts` | 18374 |
| GET | `/api/partner-portal/proposals/:id` | `server.ts` | 18407 |
| GET | `/api/partner-portal/support/conversations` | `server.ts` | 18438 |
| POST | `/api/partner-portal/support/conversations` | `server.ts` | 18460 |
| GET | `/api/partner-portal/support/conversations/:id/messages` | `server.ts` | 18484 |
| POST | `/api/partner-portal/support/conversations/:id/messages` | `server.ts` | 18514 |
| GET | `/api/partner-portal/support/unread-count` | `server.ts` | 18541 |
| GET | `/api/support/conversations` | `server.ts` | 18571 |
| GET | `/api/support/conversations/:id` | `server.ts` | 18607 |
| POST | `/api/partner-portal/support/conversations/:id/rating` | `server.ts` | 18666 |
| POST | `/api/support/conversations/:id/messages` | `server.ts` | 18686 |
| PATCH | `/api/support/conversations/:id/status` | `server.ts` | 18717 |
| GET | `/api/support/metrics` | `server.ts` | 18746 |
| GET | `/api/partners/:id/portal-access` | `server.ts` | 18770 |
| POST | `/api/partners/:id/portal-access` | `server.ts` | 18808 |
| POST | `/api/partners/:id/portal-access/reset` | `server.ts` | 19017 |
| PATCH | `/api/partners/:id/portal-access/:accessId` | `server.ts` | 19111 |
| GET | `/api/support/whatsapp/config` | `server.ts` | 19225 |
| PUT | `/api/support/whatsapp/config` | `server.ts` | 19225 |
| GET | `/api/support/whatsapp/state` | `server.ts` | 19226 |
| POST | `/api/support/whatsapp/connect` | `server.ts` | 19227 |
| POST | `/api/support/messages/:id/retry` | `server.ts` | 19230 |
| GET | `${prefix}/messages/:id/attachment` | `server.ts` | 19243 |
| POST | `/api/webhooks/evolution/:tenantId` | `server.ts` | 19262 |
| GET | `/api/webhooks/whatsapp` | `server.ts` | 19276 |
| POST | `/api/webhooks/whatsapp` | `server.ts` | 19292 |
| GET | `*` | `server.ts` | 19345 |
| USE | `/api/integrations/bmg/customer` | `server/services/bmgRoutes.ts` | 15 |
| USE | `/api/integrations/bmg/customer/send-otp` | `server/services/bmgRoutes.ts` | 16 |
| GET | `/api/integrations/bmg/config` | `server/services/bmgRoutes.ts` | 23 |
| PUT | `/api/integrations/bmg/config` | `server/services/bmgRoutes.ts` | 35 |
| POST | `/api/integrations/bmg/test-connection` | `server/services/bmgRoutes.ts` | 44 |
| POST | `/api/integrations/bmg/customer/:action` | `server/services/bmgRoutes.ts` | 52 |
| GET | `/api/integrations/bmg/proposals/:id` | `server/services/bmgRoutes.ts` | 83 |
| POST | `${path}/simulate` | `server/services/daycovalRoutes.ts` | 44 |
| POST | `/api/${routeName}/import` | `server/services/daycovalRoutes.ts` | 84 |
| PATCH | `/api/${routeName}/activation` | `server/services/daycovalRoutes.ts` | 107 |
| GET | `/api/simulations/bank-order` | `server/services/simulationBankOrderRoutes.ts` | 8 |
| PUT | `/api/simulations/bank-order` | `server/services/simulationBankOrderRoutes.ts` | 19 |

### Registradores dinâmicos

- daycovalRoutes: /api/daycoval, /api/c6-spreadsheet, /api/parana-spreadsheet e equivalentes partner-portal; metadata, simulate, import, activation. Mesmos DTOs e validações de banco/tenant.
- bmgRoutes e simulationBankOrderRoutes registram handlers próprios.
- server/realtime e pusherService fornecem canais/transporte/autorização, sem inventar canal global para clientes/parceiros.

## 14. Pontos a aprofundar por módulo antes da edição

Este inventário dá o catálogo e os fluxos críticos. Em cada fase registrar checklist campo-a-campo, caminhos de modais, efeitos de useEffect, chamadas HTTP e testes do módulo antes/depois. A auditoria estática não prova paridade integral de comportamento nem conformidade de todas as permissões do servidor. Não remover componente só por não aparecer em APP_ROUTES.
