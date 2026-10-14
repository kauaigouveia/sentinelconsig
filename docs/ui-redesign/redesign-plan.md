# Sentinel Consig 2.0 — plano para aprovação

Data: 13/10/2026. Estado: proposta; implementação NÃO iniciada.
Base: functional-inventory.md, auditoria do código atual e briefing anexado pelo usuário.

## 1. Decisão solicitada

Aprovar a direção estrutural, a sequência e os critérios abaixo para iniciar alterações de frontend. Não há autorização nesta entrega para alterar código, fazer push/deploy, mudar APIs/autenticação/regras financeiras ou schema/migrations. Somente os dois documentos da auditoria foram criados. A aprovação de implementação não implica autorização de publicação.

## 2. Direção de experiência e identidade

Uma sidebar única expandida (aproximadamente 224px) ou compacta (64px), topbar de 56–64px e conteúdo amplo, com cabeçalho de página e ações. No modo compacto, ícones coloridos por função e tooltip acessível por foco/hover. No smartphone, menu em drawer com foco contido, botão de fechamento e retorno ao acionador. Evitar navegação de dois painéis laterais e abas de módulos empilhadas.

Preservar o nome Sentinel Consig e usar os assets originais de public/branding (logo horizontal/símbolo), sem novo logotipo nem assinatura “Workspace” junto da marca. Empresa/white label mantém nome, logo, favicon e título próprios. Seletor de empresa visível na topbar; contexto global/empresa explicitamente identificado.

Tema escuro principal: canvas #080F1E, sidebar #0D1729, superfície #141F33, elevada #1B2940, borda #293750, texto #F3F7FF, secundário #94A7C4. Azul #2563EB, ciano #06B6D4, sucesso #10B981, alerta #F59E0B, crítico #F43F5E, operacional #8B5CF6. Tema claro: canvas #F5F7FB, superfície/sidebar #FFFFFF, texto #162238, secundário #64748B, borda #E2E8F0. Respeitar tema escolhido existente; não sobrescrever preferência sem necessidade.

Manter Plus Jakarta Sans já adotada, evitando outra dependência; números tabulares e valores brasileiros. Contraste será medido, não presumido por código hexadecimal. Estados críticos terão texto/ícone além de cor.

Densidade compacta no desktop, com hit areas adequadas, filtros recolhíveis e tabelas amplas. Sem zoom obrigatório em 1366×768. Responsividade pode manter scroll local para tabelas completas quando omitir campos comprometer o trabalho; evitar scroll horizontal da página.

## 3. Nova arquitetura de navegação proposta

URLs e aliases atuais permanecem; a reorganização é de apresentação. Não criar um novo serviço para um atalho. Destinos sem rota própria ficam acessíveis por seção interna claramente nomeada, até eventual rota de frontend aprovada.

| Grupo novo | Destinos existentes / caminho |
|---|---|
| Início | Dashboard / e /dashboard; Meu workspace com Minha Fila /minha-fila e Agenda /agenda-operacional; atividade e favoritos com dados/fontes existentes |
| Produção | Propostas /propostas e detalhe; Simulações /simulacoes; CIP /portabilidade; Pendências /central-pendencias; Esteira /esteira; Central de Operações /central-operacoes |
| Relacionamento | Cliente 360 /clientes; CRM de Parceiros /crm-parceiros; Atendimento /central-atendimento |
| Financeiro | Fluxo financeiro /financeiro-geral; relatórios/ações financeiras realmente disponíveis nas telas atuais, sem anunciar módulo inexistente |
| Integrações | Hub /integracoes e slug; Bancos & Promotoras /bancos-promotoras; Integrações Bancárias e Planilhas via destinos internos reais; Saúde /saude-apis, incidentes/logs existentes |
| Gestão | BI /bi; Radar /radar-comercial; Gargalos /relatorio-gargalos; Intelligence /intelligence e insights; Command Center /command-center e incidentes; Automações /automacoes; Conquistas /gamificacao; TV /tv-monitor |
| Administração | Central /central-administracao; usuários /admin-usuarios; produtos /admin-produtos; status /admin-status; calendário /admin-calendario; auditoria /admin-auditoria; comunicados /admin-comunicados; importação /admin-import-status; perfis, convênios, regras e marca pelas entradas internas preservadas |
| Plataforma | Empresas/assinaturas /empresas-assinaturas; plano/consumo /meu-plano conforme autorização real; domínios e recursos globais já existentes. Ocultar grupo sem destinos permitidos |
| Portal do parceiro | Shell externo próprio: início, simulações, propostas/detalhe, atendimento e cadastro. Não mostrar sidebar administrativa |

Não presumir acesso por grupo: cada destino mantém canAccessRoute e cada ação mantém hasPermission/restrições adicionais. Plataforma não significa promover MASTER/TENANT_ADMIN a PLATFORM_MASTER. Revalidar sugestões/recentes/favoritos em toda mudança de papel/tenant.

“Ferramentas da área” será substituído por ações contextuais úteis do módulo, menu de ações e busca. Recentes/favoritos passam a um menu próprio e à command palette; breadcrumb discreto pode ocupar o mesmo cabeçalho. Não apagar links antes de registrar equivalência atual→novo na matriz R01–R23.

## 4. Componentes reutilizados e modernizados

| Elementos existentes | Tratamento proposto |
|---|---|
| RouterContext, APP_ROUTES, canAccessRoute | Reutilizar contratos e aliases; uma fonte de catálogo para navegação/atalhos |
| App.tsx | Extrair composição visual para AppShell sem reescrever sessão, tenant, realtime ou despacho de modais |
| Sidebar/Header/WorkspaceToolbar/RouteContextPanel | Consolidar em sidebar única + topbar; transferir links e preferências antes de retirar painéis redundantes |
| CommandPaletteModal/UniversalCommandPalette | Consolidar gradualmente navegação, ações e busca usando fontes disponíveis, com escopo tenant/permissões; preservar atalhos autorizados |
| ThemeContext, BrandLogo, branding e useTenantBranding | Reutilizar tema/resolução por domínio; aplicar assets originais e tokens consistentes |
| ui/common ActionBar e MetricCard | Criar interface visual compartilhada com adaptadores; não deletar variantes antes de migrar consumidores |
| StatusBadge/AuthorityBadge, Skeleton/EmptyState/ErrorState, Toast | Modernizar apresentação, foco/aria e semântica mantendo eventos/props |
| SavedFilterViews/RecordWorkspace/useWorkspacePreferences | Reutilizar preferências segmentadas; ampliar composição sem guardar dados pessoais nas sugestões |
| ProductionList/KanbanBoard/ProposalDetailModal | Padronizar tabela, filtros, alternância e drawer amplo, mantendo handlers e campos |
| Modais de simulação/planilha, cards de banco | Agrupar cliente/parceiro/contratos/condições/resultados; manter DTO, cálculos e seleção existentes |
| Recharts/BIFilterBar | Mesmas séries/cálculos; modernizar temas, legendas e espaços |
| Formulários administrativos/financeiros/CRM | Migrar controles e layout por seção, sem mudar validações/persistência |

Componentes novos somente se úteis: PageHeader, FilterBar, DataTable, DetailDrawer, QuickActions e ThemeToggle. DataTable inicialmente controla apresentação, não substitui a lógica de filtro/seleção/paginação de cada módulo. Reutilização não pode apagar diferenças reais entre banco/produto/perfil.

## 5. Command Center e workspace

Dashboard operacional precisa manter visões por perfil e fontes atuais. Projetar bloco superior de métricas existentes e região central com filas/pendências/CIP/propostas recentes, em abas relacionadas. Cada indicador terá nome, base, período e fonte documentados antes da implementação. Conversão, valor liberado, valor pago e comissão permanecem conceitos distintos.

Atalhos para proposta/simulação/CIP/pendência/cliente somente quando autorizados e ligados a ações reais. Workspace agrega Minha Fila, agenda, favoritos e recentes; personalização local por usuário/tenant é aproveitada. Não inventar “Minha Equipe” ou histórico de atividade se dados adequados não existirem: explicar indisponibilidade ou manter módulo atual.

Existe um Command Center de incidentes independente. Não substituir esse módulo pelo dashboard de início nem misturar incidentes com pendências.

## 6. Busca universal e limites

Ctrl+K/Cmd+K: navegar, ações autorizadas, recentes/favoritos, clientes e propostas/ADE/parceiros dos datasets autorizados já existentes. A busca de cache local pode ser incompleta; comunicar escopo e não fabricar resultados. A consolidação precisa verificar campos reais (nome/código de parceiro, CPF, número/ADE) e revalidar acesso no clique.

Antes de implementar nova consulta remota, confirmar endpoint existente e seus filtros. Se ausente, registrar limitação. Não criar backend de busca sob autorização de redesign visual. Ao trocar tenant, fechar paleta, limpar resultados e impedir resposta atrasada com generation/abort conforme arquitetura existente.

## 7. Riscos e controles

| Risco observado | Controle / critério |
|---|---|
| Muitas camadas de navegação e subpáginas sem URL | Inventário atual→novo e teste de acesso; preservar cada aba e modal |
| CSS global com seletores sobre utilitários | Tokens semânticos e escopo explícito por componente; revisão dos dois temas em cada módulo |
| Troca de tenant/cache/realtime e busca local | Preservar reload/limpeza atuais; provar A→B→A e negação de dados cruzados |
| Helper legado TenantSecurityService com conceito de MASTER global | Não usar como nova autoridade; servidor/contexto efetivo prevalecem; ajuste de segurança fora do escopo visual |
| Logo v2 diferente da marca original | Assets originais e white label existentes; nenhuma geração de nova marca |
| Permissões customizadas substituem padrões; restrições adicionais por papel | Testar padrões + conjuntos customizados + botões/atalhos/drag; não inferir autorização do título do perfil |
| Kanban e detalhe com transições financeiras/regras | Reutilizar handlers, confirmação, erro e persistência; sem bypass no drag-and-drop |
| Cálculos/idade/SLA e taxas de planilha | Congelar serviços/regras; fixtures para comparar outputs, preservar dias úteis e limites por banco |
| Componentes monolíticos e duplicados | Migração por módulo, adaptadores temporários; não limpar legado por suspeita |
| Testes integration criam/apagam registros | Base comprovadamente isolada e efeitos externos desativados; nenhum script destrutivo por padrão |
| Indicadores com conceitos distintos | Documentar fórmula/fonte existente e conferir antes/depois; vazio quando faltar dado |
| Provider/sandbox/WhatsApp indisponível | Mocks/fixtures + teste vivo separado; bloquear item com motivo, sem declarar aprovado |
| Modais maiores que notebook e menus móveis | max-height em viewport, scroll interno, foco/teclado e revisão nas resoluções previstas |

## 8. Plano incremental e critérios de aceitação

| Fase | Entrega | Critérios de saída |
|---|---|---|
| 1. Auditoria | Inventário, rotas/permissões, integrações, testes, diagnóstico e este plano | Revisão pelo usuário e aprovação explícita antes de código |
| 2. Design system | Tokens claro/escuro, marca original, tipografia e controles reutilizáveis | Contraste/foco, estados disabled/erro/vazio/loading, nenhuma mudança de campo/handler; preview local |
| 3. App Shell | Sidebar única compacta/expandida, topbar, seletor, breadcrumbs e command palette | Todas as 45 rotas/aliases e abas preservadas; menu filtrado; Ctrl/Cmd+K; mobile/teclado; A→B→A sem conteúdo anterior |
| 4. Dashboard/workspace | Início operacional com métricas reais, filas, atalhos e preferências | Mesmas fontes/fórmulas, visões por papel, estados vazios, nenhum valor fictício |
| 5. Produção | Propostas/tabela/kanban/drawer, simulações, CIP e pendências | Campos/ações/regras/SLA idênticos; regressões R04–R10 e formulário campo-a-campo |
| 6. Relacionamento/portal | Cliente 360, CRM, atendimento e portal próprio | Múltiplas propostas/ADEs, docs, chat/avaliação/modelos; restrição SIMULATION/grupos/tenant, R11–R14 |
| 7. Gestão/Financeiro | BI, radar, gargalos, intelligence/command, rotina, financeiro | Métricas discriminadas, filtros/exports/CRUD autorizados e fontes preservadas |
| 8. Admin/Integrações/Plataforma | Formulários, configurações, usuários/empresas, bancos e planilhas | Mesmos payloads/tokens/gates/limites; sem migration; ações e subabas não desaparecem |
| 9. Validação | Relatório completo de regressão e capturas por tema/resolução | R01–R23, testes seguros, lint/typecheck/build, browser/console/teclado e bloqueios documentados; publicação só autorizada |

Commits locais pequenos e reversíveis após aprovação; um módulo/grupo por commit. Nenhum push/deploy automático. A aprovação da fase 1 permite começar fase 2, mantendo barreira para mudanças em banco/auth/API/regras.

## 9. Estratégia de validação

1. Congelar baseline dos campos, fluxos, testes e sources do módulo.
2. Verificar setup de testes e efeitos de importação do servidor. Não usar vercel-build (inclui migration).
3. Executar testes unitários/fixtures seguros e criar regressões de frontend para navegação, permissões, escopo de dados e paridade de formulários.
4. Executar integração só com base isolada confirmada; externos em sandbox/fixture. Registrar qualquer bloqueio.
5. npm run lint (typecheck) e npm run build; build não prova paridade funcional.
6. Sessões de teste por papel e custom permission, duas empresas e parceiro; entrada direta/reload e cache/realtime.
7. Browser: claro/escuro em 1920×1080, 1366×768, tablet e smartphone; teclado, focus trap, Escape, retorno de foco, scroll, menu e console/rede.
8. Registrar em validation-results.md após execução: caso, ambiente, evidência, resultado, pendência/bloqueio. Ainda não criar relatório com status de aprovação fictício.

Não há dependência adicional instalada para teste de browser nesta auditoria. Decidir ferramenta local durante a implementação, reutilizando recursos existentes e evitando dependências desnecessárias.

## 10. Fora do escopo e bloqueios atuais

- Nenhuma refatoração de backend, schemas, migrations, autenticação ou cálculo financeiro.
- Nenhuma remoção de recurso legado ou contratação de serviço pago.
- Nenhuma garantia de “100% preservado” apenas por análise estática/build.
- Credenciais/sessões/dados de teste e base isolada ainda não confirmados para regressão completa. Eles bloqueiam execução ao vivo, não a proposta de arquitetura.
- APIs ou métricas inexistentes não serão simuladas na interface.
- Documento SENTINEL_REDESIGN.md registra a abordagem anterior. Este plano descreve a nova direção; não apagar o histórico nem tratar suas validações como evidência atual.

## 11. Próximo passo após aprovação

Implementar design system e App Shell, preservando temporariamente cada tela funcional dentro da nova estrutura. A primeira entrega visual terá diferença estrutural verificável: sidebar única, mais área útil, empresa na topbar e ausência do painel repetitivo. Em seguida modernizar cada módulo com checklist próprio, até cumprir a matriz completa.


## Atualização — autorização limitada de 13/10/2026

Usuário aprovou com ressalvas apenas Design System e preparação do shell, com dashboard e consulta demonstrativa, em branch separada e desenvolvimento. A primeira entrega visual está registrada em first-visual-delivery.md. A autorização anterior de implantação não se aplica a este redesign: nenhum push/merge/deploy é permitido sem novo consentimento. Parar para aprovação visual antes da migração dos módulos. Os itens de integração autenticada bloqueados estão em validation-results.md.
