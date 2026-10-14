# Equivalência de caminhos — primeira prévia

Data: 13/10/2026. Branch: codex/sentinel-2-visual-preview.

Nenhum path, alias, viewId ou contrato de router foi alterado. A prévia autenticada é habilitada no desenvolvimento pelo parâmetro `?ui=2` ou pelo botão “Avaliar Sentinel 2.0”. O botão de retorno grava `?ui=legacy`; o reload mantém a escolha explícita da URL. Em build de produção, a flag DEV é falsa e o botão não existe.

A galeria `/sentinel-2-preview.html` é separada da aplicação: mostra composição sem login e sem fontes de negócios, com exemplos de tabela opcionais e explicitamente identificados. Os links da galeria mudam a apresentação local, não comprovam funcionamento de rotas autenticadas. Na aplicação, a mesma sidebar usa o roteador e as rotas existentes.

| Caminho antigo | Caminho no shell novo | Grupo novo / acesso | Aliases preservados |
|---|---|---|---|
| `/` | `/` | Início → Dashboard / Início | ['/torre-controle'] |
| `/dashboard` | `/dashboard` | Início → Dashboard | — |
| `/central-pendencias` | `/central-pendencias` | Produção → Central de Pendências | ['/pendencias', '/pendencias-central'] |
| `/propostas` | `/propostas` | Produção → Propostas | ['/producao'] |
| `/propostas/:id` | `/propostas/:id` | Produção → Detalhes da Proposta | — |
| `/portabilidade` | `/portabilidade` | Produção → Portabilidade (CIP) | ['/portabilidades'] |
| `/simulacoes` | `/simulacoes` | Produção → Simulações | — |
| `/crm-parceiros` | `/crm-parceiros` | Relacionamento → CRM de Parceiros | ['/parceiros'] |
| `/integracoes` | `/integracoes` | Integrações → Hub de Integrações | ['/hub-integracoes', '/integracoes-hub'] |
| `/integracoes/:slug` | `/integracoes/:slug` | Integrações → Integração Bancária | — |
| `/bancos-promotoras` | `/bancos-promotoras` | Integrações → Bancos & Promotoras | ['/promotoras', '/admin-bancos'] |
| `/saude-apis` | `/saude-apis` | Integrações → Saúde das APIs | ['/admin-c6-bank'] |
| `/bi` | `/bi` | Gestão → BI Operacional | ['/dashboard-executivo'] |
| `/automacoes` | `/automacoes` | Gestão → Central de Automações | ['/central-automacao'] |
| `/command-center` | `/command-center` | Gestão → Sentinel Command Center | ['/command'] |
| `/command-center/incidents/:id` | `/command-center/incidents/:id` | Gestão → Incidente — Command Center | — |
| `/intelligence` | `/intelligence` | Gestão → Sentinel Intelligence | ['/sentinela-ai', '/sentinel-intelligence'] |
| `/intelligence/insights/:id` | `/intelligence/insights/:id` | Gestão → Insight — Sentinel Intelligence | — |
| `/central-administracao` | `/central-administracao` | Administração → Central de Administração | ['/administracao'] |
| `/empresas-assinaturas` | `/empresas-assinaturas` | Plataforma → Empresas & Assinaturas | ['/saas-tenants'] |
| `/meu-plano` | `/meu-plano` | Plataforma → Meu Plano & Consumo | ['/admin-plano-consumo'] |
| `/esteira` | `/esteira` | Produção → Esteira Kanban | — |
| `/clientes` | `/clientes` | Relacionamento → Clientes 360º & CRM | ['/busca-cpf', '/pesquisa-cpf'] |
| `/tv-monitor` | `/tv-monitor` | Gestão → Monitor TV Operações | — |
| `/radar-comercial` | `/radar-comercial` | Gestão → Radar Comercial & BI | — |
| `/agenda-operacional` | `/agenda-operacional` | Início → Agenda & Tarefas | — |
| `/minha-fila` | `/minha-fila` | Início → Minha Fila | — |
| `/gamificacao` | `/gamificacao` | Gestão → Conquistas & Metas | — |
| `/financeiro-geral` | `/financeiro-geral` | Financeiro → Fluxo Financeiro | — |
| `/relatorio-gargalos` | `/relatorio-gargalos` | Gestão → Gargalos & Permanência | — |
| `/central-operacoes` | `/central-operacoes` | Produção → Central de Operações | — |
| `/admin-usuarios` | `/admin-usuarios` | Administração → Usuários & Permissões | — |
| `/admin-produtos` | `/admin-produtos` | Administração → Produtos & Regras | — |
| `/admin-status` | `/admin-status` | Administração → Status & Regras | — |
| `/admin-calendario` | `/admin-calendario` | Administração → Feriados & Prazos SLA | — |
| `/admin-auditoria` | `/admin-auditoria` | Administração → Auditoria & Logs | — |
| `/admin-comunicados` | `/admin-comunicados` | Administração → Comunicados do Sistema | — |
| `/admin-import-status` | `/admin-import-status` | Administração → Importação de Status | — |
| `/central-atendimento` | `/central-atendimento` | Relacionamento → Central de Atendimento | ['/suporte-central', '/atendimento-parceiros'] |
| `/parceiro` | `/parceiro` | Portal do parceiro (shell próprio) → Portal do Parceiro | ['/parceiro/dashboard'] |
| `/parceiro/propostas` | `/parceiro/propostas` | Portal do parceiro (shell próprio) → Minhas Propostas | — |
| `/parceiro/propostas/:id` | `/parceiro/propostas/:id` | Portal do parceiro (shell próprio) → Detalhes da Proposta | — |
| `/parceiro/atendimento` | `/parceiro/atendimento` | Portal do parceiro (shell próprio) → Atendimento & Suporte | ['/parceiro/suporte', '/parceiro/chat'] |
| `/parceiro/perfil` | `/parceiro/perfil` | Portal do parceiro (shell próprio) → Meu Cadastro & Senha | ['/parceiro/cadastro', '/parceiro/seguranca'] |
| `/parceiro/login` | `/parceiro/login` | Portal do parceiro (shell próprio) → Login do Parceiro | — |

## Destinos sem rota independente

| Entrada antiga | Equivalente nesta etapa |
|---|---|
| Sidebar em duas áreas + painel de categoria | Sidebar única, expandida/compacta, com links às rotas autorizadas |
| “Ferramentas da área” | Mesmo destino pela sidebar e pela busca; painel não renderizado no modo 2.0 |
| WorkspaceToolbar: recentes | Paleta 2.0, filtrados por permissão e pela chave domínio/tenant/usuário existente |
| WorkspaceToolbar: favoritos | Paleta 2.0; adição/remoção e densidade disponíveis na topbar e no menu de usuário, com preferências por escopo |
| Criação/importação/exportação/seleção/status de propostas | “Todas as ações e campos” abre ProductionList original dentro do shell; “Voltar à consulta compacta” retorna à prévia |
| Nova proposta e detalhe | Mesmos handlers e modais existentes em App.tsx; consulta compacta é somente leitura |
| Filtro de status vindo do dashboard | Mesmo handleNavigateToProductionWithFilter; abre lista original com filtro, sem novo endpoint |
| Administração: perfis, convênios, regras, marca e domínios | Central de Administração original, com todas as subabas e restrições existentes |
| Integrações: bancos, saúde, incidentes e logs | Hub/Integrações Bancárias originais; todas as subabas mantidas |
| Simulações: solicitações, fila, relatórios e planilhas | SimulationView original; sem migração nesta entrega |
| Cliente 360, CIP, CRM, financeiro, atendimento e plataforma | Implementações existentes, preservadas dentro do novo shell quando acessadas em desenvolvimento |
| Portal do parceiro e suas abas | Shell próprio, inalterado; nenhuma prévia administrativa aplicada ao portal |
| Command Center de incidentes | /command-center e detalhe existentes; não substituídos pelo dashboard operacional |
| Atalhos de backup, white label, teste, senha, tour e ajuda | Menu de usuário/handlers atuais do Header; modo antigo continua acessível |

## Limite da preservação demonstrada

A paridade de destinos estáticos autorizados foi verificada por testes para os oito papéis. Isso não valida CRUD, integrações, subabas autenticadas, troca real de tenant ou autorização do backend. Nenhum desses fluxos foi declarado aprovado por análise de caminhos.
