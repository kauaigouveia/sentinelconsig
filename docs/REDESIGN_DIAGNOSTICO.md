# Redesign Sentinel Consig — Fase 0

Data: 03/11/2026. Branch: `codex/redesign-v4-phase0`. Base Git: `5e278a41ae592bac64981b9b745abd7b69bf42ab`, com alterações locais anteriores preservadas. Esta fase adiciona somente documentação, inventário e imagens; não implementa o redesign. Os diffs de backend, armazenamento e multissimulação já existentes não pertencem a esta fase.

## Método e limites de evidência

Não executei npm install: as dependências já estão disponíveis e o Vite instalado é 6.4.3. Não executei npm run dev, pois ele inicia `tsx server.ts`, capaz de inicializar Prisma, tarefas e serviços operacionais. O servidor local usado é apenas `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5185 --strictPort`, sem proxy configurado para o backend. Nenhuma autenticação real, consulta a banco ou operação bancária foi realizada.

O login foi capturado na entrada real `/`. Propostas, Simulações, Kanban, Clientes e Pendências foram capturados no harness **preexistente** `tests/visual/simulation-workspace.html`: componentes reais, fixtures fictícias, fetch interceptado, escritas recusadas e realtime desativado. O harness não reproduz a sessão autenticada, sidebar/header globais, identidade de uma empresa real ou todas as permissões. Sua faixa de diagnóstico e navegação são do harness, não defeitos do produto. Não introduzi bypass de autenticação no aplicativo.

Há 36 imagens reais: seis do login e seis de cada um dos cinco módulos. Não são mockups nem evidência de uma nova interface. A abertura inicial do navegador excedeu o tempo limite; a recuperação funcionou. O navegador tem zoom/DPI particular: a largura desktop intermediária solicitada como 1366 foi medida em **1365 pixels CSS**; 390 e 1920 foram confirmados exatamente. A API exige inteiros e não permitiu ajuste fracionário. Os JPEGs podem incluir superfície excedente da captura do IAB; tamanho físico do JPEG não equivale ao viewport CSS. O manifesto registra dimensões solicitadas e efetivas. Não declarar aprovado o breakpoint exato 1366 ou tablet 1024 ainda.

O documento principal do harness não apresentou scroll horizontal nos estados capturados. Isso não certifica todos os drawers, tabelas, menus ou estados de erro. Capturas de viewport podem não mostrar o conteúdo abaixo da dobra. Contraste, teclado, leitores de tela e fluxos autenticados completos ainda exigem homologação própria.

## CSS carregado de fato

O main importa index.css, que importa Tailwind e sentinel.css. App.tsx importa os outros cinco arquivos. Os nomes preview/finishing não indicam código morto. Total: **3.863 linhas e 44 usos de !important**, antes de qualquer consolidação.

| Arquivo | Linhas | !important |
|---|---:|---:|
| `src/index.css` | 180 | 4 |
| `src/styles/sentinel.css` | 401 | 18 |
| `src/styles/sentinel-2-preview.css` | 2633 | 21 |
| `src/styles/sentinel-2-production.css` | 212 | 1 |
| `src/styles/sentinel-2-modules.css` | 320 | 0 |
| `src/styles/sentinel-2-dialogs.css` | 41 | 0 |
| `src/styles/sentinel-2-finishing.css` | 76 | 0 |

Há declarações repetidas de `--bg-canvas`, `--bg-surface`, `--bg-surface-elevated`, `--border-default` e tokens de texto em até sete ocorrências; temas e escopos explicam parte das repetições, mas aumentam o custo de prever a cascata. `--primary-main`, `--primary-color`, `--s2-blue` e cores de classes utilitárias convivem. Seletores que dependem de classes Tailwind, posição dos filhos e `.s2-root` acoplam CSS à estrutura dos módulos. Exemplo: sentinel-2-finishing.css adapta filhos via `:last-child`, `~ div:not(.fixed)` e classes parciais. Não remover essas regras antes de migrar seus consumidores e testar o layout.

## Redesign anterior: ativo, galeria e candidatos

O grafo de imports literais a partir de src/main.tsx alcança 273 arquivos. É análise estática, não cobertura de runtime. Em produção, `initialPresentation` habilita a apresentação nova salvo modo legacy; PreviewSidebar, PreviewDashboard, PreviewSearch, WorkTabs, PremiumContent e PremiumPrimitives participam dos caminhos ativos. O comentário “Development preview only” de sentinel-2-preview.css está desatualizado em relação aos consumidores.

GalleryWorkspaces, galleryFixtures e PreviewProposals não são alcançados pela entrada main, mas são usados pela entrada separada `src/sentinel-2-preview.tsx` e por testes. São **galeria separada**, não candidatos comprovados a exclusão. A galeria não substitui a validação das telas reais. Nenhum arquivo foi removido.

`docs/ui-redesign/functional-inventory.md` é de 13/10/2026 e continua útil, mas precisa ser reconciliado com as **46 entradas atuais de APP_ROUTES** e abas internas. O snapshot hash das rotas e permissões foi registrado; nenhuma rota foi alterada.

## Componentes prioritários por tamanho

Contagem física de linhas; style= não inclui classes Tailwind extensas, templates ou estilos delegados.

| Arquivo | Linhas | Ocorrências style= |
|---|---:|---:|
| `src/components/simulation/SimulationView.tsx` | 2644 | 1 |
| `src/components/crm/PartnerDetailModal.tsx` | 2329 | 0 |
| `src/components/saas/PlatformMasterCentral.tsx` | 1956 | 5 |
| `src/components/integrations/BankIntegrationsView.tsx` | 1619 | 0 |
| `src/components/production/ProposalDetailModal.tsx` | 1587 | 3 |
| `src/components/admin/UserManagement.tsx` | 1502 | 0 |
| `src/components/admin/CentralPendencias.tsx` | 1426 | 1 |
| `src/components/CommandCenter/CommandCenterView.tsx` | 1289 | 0 |
| `src/components/admin/HubIntegracoes.tsx` | 1278 | 0 |
| `src/components/integrations/HappyIntegrationTab.tsx` | 1278 | 0 |
| `src/components/production/ProductionList.tsx` | 1260 | 3 |
| `src/components/admin/AuditLogView.tsx` | 1214 | 0 |
| `src/components/bi/ExecutiveBIDashboard.tsx` | 1195 | 0 |
| `src/components/production/NewProductionModal.tsx` | 1116 | 0 |
| `src/components/admin/StatusImport.tsx` | 1105 | 3 |

A concentração de estado, filtros, tabelas, diálogos e regras de apresentação nos maiores componentes aumenta o risco de regressão ao fazer uma troca global. Na fase visual, extrair somente a composição/presentação que preserve props, handlers, campos enviados, estados e testes; não mover regras financeiras ou permissões.

## Achados visuais e de consistência

1. **Propostas:** total/contagem e status aparecem no cabeçalho, cartões, faixa de filtros e topo da tabela. Várias linhas de controles antes dos registros reduzem espaço útil. Unificar a hierarquia de PageHeader + FilterBar + resultados, preservando filtros salvos, ações, colunas e modos.
2. **Simulações:** roteiro lateral, ações principais, navegação de áreas, métricas, avisos, filtros e cartões concorrem pela atenção. No móvel, a primeira dobra pode terminar antes dos registros. O cabeçalho do harness não deve ser contabilizado como parte do shell real.
3. **Kanban:** categorias/status repetidos na navegação, coluna e cartões; borda de atraso domina os cartões. Preservar drag/drop, SLA e todas as informações, reduzindo repetição e usando semântica de status consistente.
4. **Pendências:** tamanhos, raios e cores de ação divergentes do restante. No tema claro do harness, o botão habilitado “Configurar SLA” apresentou texto rgb(20,36,59), fundo rgb(38,48,71), tamanho 13px e contraste aproximado **1,19:1**, inferior a 4,5:1. É observação local confirmada, não auditoria AA de todo o produto.
5. **Login:** mantém duas assinaturas da marca e painel institucional acima do formulário no móvel. O painel pode tornar a autenticação mais distante da primeira dobra. A nova apresentação deve preservar esqueci senha, mostrar senha, manter conectado, mensagens de domínio e tema.
6. **Primitivas duplicadas:** ActionBar e MetricCard coexistem em common e ui, além das primitivas Premium. Inventariar props/consumidores e consolidar por adaptação; não apagar uma implementação só por nome.
7. **Shell:** App.tsx mantém alternativas Sidebar/PreviewSidebar, Header, WorkspaceToolbar, breadcrumbs, WorkTabs, RouteContextPanel e footer. A combinação condicionada exige teste autenticado para eliminar redundância sem perder favoritos, busca, atalhos, alertas e troca de empresa.

## White label, temas e acessibilidade

`useTenantBranding.ts` injeta `--primary-color`, `--secondary-color`, `--accent-color`; resolve `/api/public/tenant-branding`. `public/whitelabel.json` e branding/defaults também existem. A próxima fase deve **consumir** esses mecanismos, nunca substituí-los ou alterar a resolução de tenant. O token novo de ação deve referenciar `var(--primary-color, fallback)`; a paleta base pode usar as superfícies sugeridas, sem fixar o primary de uma empresa.

Há cores hardcoded em sentinel.css (por exemplo, botão primário #087d74) e --s2-blue fixo nos dois temas, sem associação completa ao branding. Corrigir a ponte de tokens na fase 1, antes de converter as telas. Manter as cores semânticas e as cores dos estados bancários separadas da cor da marca.

ThemeContext usa `evolve_theme`, respeita preferência inicial do sistema e alterna a classe dark. Preservar essa preferência. Plus Jakarta Sans e JetBrains Mono já constam das famílias CSS; não confundir declaração com confirmação de que a fonte foi carregada em todo ambiente. Há foco visível, link “Ir para o conteúdo principal” e regras prefers-reduced-motion existentes: preservar e validar, não declarar que estão ausentes. Não foi concluída certificação de contraste AA, ordem de foco ou leitores de tela.

## Sequência de implementação proposta

- Fase 1: um arquivo de tokens claro/escuro, ponte white label e primitivas pequenas, mantendo compatibilidade com props atuais. Galeria interna somente para validar tokens e estados. Migrar consumidores antes de desativar as camadas antigas; evitar criar uma oitava camada permanente de overrides.
- Fase 2: shell, login, troca de empresa e footer, com todos os destinos das 46 rotas, busca e favoritos preservados. Homologar o shell real com sessão sintética isolada.
- Fase 3: Propostas/esteira/detalhes, Simulações, Pendências e Dashboard, em commits por módulo.
- Fases 4/5: módulos restantes e portal; manter formulários, ações, permissões e contratos de API sem mudanças.
- Fase 6: remoção de estilos/galerias somente com prova de não utilização, responsividade 390/1024/1366/1920, teclado, AA, reduced motion e comparação de artefatos.

Cada fase termina com TypeScript, suíte segura e build. Não instalar UI pesada, trocar router, modificar src/lib/permissions.ts ou introduzir dependências de backend nesta tarefa. O restante do produto não está redesenhado nesta Fase 0.

## Capturas e validação pendente

Consulte [índice das capturas](redesign-v4/README.md), [manifesto](redesign-v4/capturas.json), [inventário](redesign-v4/inventario-estatico.json) e [hashes protegidos](redesign-v4/protected-files.sha256.json). O snapshot dos arquivos protegidos foi feito no começo da inspeção, já contendo diffs locais anteriores; deve permanecer idêntico ao final desta fase.

Pendentes: shell autenticado completo, Dashboard real, atendimento, portal do parceiro, modais e estados das demais rotas; sessão/empresa fictícias para homologação integral; breakpoint intermediário exato e tablet; AA/teclado completos. Não acessar dados operacionais para preencher essas lacunas e não apresentar galeria/harness como se fossem produção autenticada.


## Linha de base de validação da Fase 0

- `npm test -- --reporter=dot`: 390 testes aprovados em 33 arquivos da allowlist segura do Lote 0, com um worker. Não é execução das suítes antigas potencialmente destrutivas nem prova de integrações reais.
- `npm run lint`: TypeScript (`tsc --noEmit`) aprovado; não existe comando ESLint separado.
- `npm run build`: aprovado; permanecem os avisos existentes de chunks >500 kB e módulos com imports simultaneamente estáticos/dinâmicos. Nenhum aviso foi suprimido.
- `git diff --check`: aprovado.
- 195 arquivos protegidos conferidos por SHA-256: nenhuma mudança durante a fase. Inclui backend, schema/migrations, API, vercel.json, rotas, permissões e hook de branding.
- Apenas documentação e capturas fazem parte do commit desta fase; as alterações locais anteriores continuam fora dele.

A Fase 0 entrega o diagnóstico e a referência visual disponível. A matriz autenticada completa continua pendente, explicitamente separada das capturas sintéticas; a Fase 1 ainda não foi implementada.
