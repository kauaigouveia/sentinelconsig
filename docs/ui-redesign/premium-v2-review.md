# Sentinel Consig 2.0 — Premium V2 para avaliação

Data: 13/10/2026. Branch: `codex/sentinel-2-visual-preview`.
Entrega limitada à segunda iteração visual. Nenhum push, merge ou deploy. Nenhuma migração de módulo operacional autorizada ou realizada.

## Avaliar

Galeria local: `http://127.0.0.1:5179/sentinel-2-preview.html`.
Use sidebar ou abas: Visão da Operação, Propostas, Esteira Kanban, Clientes 360° e Simulações. Os outros destinos explicam que o fluxo permanece na implementação atual.

**Galeria:** pessoas, CPF mascarado, ADEs, valores, estados, tarefas e alertas são fictícios. Sem sessão, consulta a API, cálculo financeiro, alteração em banco ou chamada bancária. Importar/criar/contratar/ações em lote mostram uma explicação de demonstração. Exportar exemplos baixa somente CSV de fixtures. Arrastar cards não está implementado.

**Aplicação autenticada de desenvolvimento:** `?ui=2` continua sendo opt-in. Sidebar, topbar, abas e dashboard de leitura são a prévia. Produção, detalhes, Kanban, Cliente 360°, Simulações e demais fluxos operacionais continuam nos componentes existentes. `?ui=legacy` mantém o modo anterior. Produção continua oferecendo “Todas as ações e campos”, porque migrar os handlers reais está fora desta autorização. Esse botão não existe na demonstração da futura experiência de propostas.

## Diferenças da primeira entrega

| Antes | Segunda iteração |
|---|---|
| Galeria com dashboard vazio | Cenário fictício explícito, seis KPIs, curva de produção e radar |
| Quatro indicadores e lista simples | Hierarquia de indicadores, inteligência, workspace e análises |
| Cabeçalho e links | Topbar preservada, favoritos/recentes na sidebar e até seis abas de rotas |
| Consulta de propostas básica | Barra completa demonstrativa, filtros, seleção, colunas, densidade, cartões e drawer |
| Placeholders em todos os outros módulos | Kanban, Cliente 360° e Simulações com prévias próprias |
| Moldura externa herdada | Shell contínuo com sidebar e conteúdo de rolagem independente |
| Paleta inicial | Dark azul profundo e light com canvas azulado, superfícies brancas e acentos consistentes |

Iluminação aplicada discretamente ao item ativo e botão principal. Sem nova marca, biblioteca paga ou infraestrutura adicional.

## Arquivos modificados

- `src/App.tsx`: passagem das preferências existentes à sidebar, abas e atualização do dashboard; mudanças pequenas na composição da prévia.
- `src/components/redesign/PreviewSidebar.tsx`: favoritos e recentes autorizados; mantém catálogo, grupos, mobile e white label.
- `src/components/redesign/PreviewDashboard.tsx`: composição premium compartilhada entre galeria e aplicação; fontes separadas e filtros de leitura.
- `src/components/redesign/PreviewData.ts`: atualizar recarrega o cache existente e a consulta de permanência já existente; loading e descarte de respostas antigas preservados.
- `src/sentinel-2-preview.tsx`: galeria expandida, histórico back/forward/refresh via parâmetro `view`, sem alterar o router da aplicação.
- `src/styles/sentinel-2-preview.css`: tokens e componentes apenas dentro de `.s2-root`, responsividade e reduced motion.
- `docs/ui-redesign/navigation-equivalence.md`, `validation-results.md`, `redesign-plan.md`: registros desta etapa.

## Componentes novos e reaproveitados

- `PremiumPrimitives.tsx`: PremiumStatCard, SectionHeader, StatusBadge, DetailDrawer e EmptyState. Drawer com foco contido, Escape e retorno ao acionador.
- `WorkTabs.tsx`: atalhos de rotas, máximo seis, dashboard fixado se permitido; fechar não cria/destrói uma sessão independente.
- `galleryFixtures.ts`: dados exclusivos da galeria, sem importação na aplicação autenticada.
- `GalleryWorkspaces.tsx`: representações demonstrativas de propostas, Kanban, cliente, simulações e ActivityTimeline. Reutiliza filtros da consulta e componentes de apresentação.
- `tests/ui_redesign_premium.test.tsx`: sete regressões estáticas novas, sem backend/banco.
- Reutilizados: APP_ROUTES/canAccessRoute/hasPermission, PreviewSidebar, PreviewDashboard, PreviewSearch, filtro de PreviewProposals, ThemeProvider, workspace por tenant/usuário, logo oficial e Recharts existente.
- Header, formulários reais, modais de negócio, portal e serviços bancários não foram reimplementados.

## Fontes e limites do dashboard autenticado

| Indicador | Fonte / interpretação |
|---|---|
| Propostas em andamento | Propostas carregadas; helper operacional existente |
| Volume liberado · pagas | Soma de `disbursedValue` conhecido em propostas atualmente pagas, como na base anterior; não é série por data de pagamento |
| Produção do período | Soma de `contractValue` conhecido para propostas criadas no período |
| Propostas pagas | Status pago da carteira carregada; não inferir data efetiva de pagamento |
| Pendências abertas | Fonte de entidades de pendência não conectada nesta prévia; exibe indisponível, não conta status pendente como entidade |
| Fora do SLA | Resposta da análise de permanência existente; nenhuma regra de calendário recalculada |

Gráfico agrupa por data de criação. Valor pago aparece somente na fixture da galeria. Valores desconhecidos não são substituídos por zero; somas são dos valores conhecidos. Não há percentuais de tendência fabricados. Participação por banco é calculada a partir da carteira/período carregado. Status vêm dos registros carregados, não de catálogo fictício na aplicação.

Filtro de banco/status aplica-se à carteira, curva, workspace e análises. Pendências e SLA mantêm a base geral da respectiva fonte, como explicado no painel de filtros. Não se apresenta contagem carregada como total universal da empresa. Radar real usa somente permanência disponível; fontes de pendência crítica, retorno CIP e tarefas não foram conectadas nesta fase.

Personalizar permite ocultar/inverter ordem de indicadores durante a sessão da prévia. Não persiste CPF nem cadastro. Favoritos, recentes e densidade da aplicação continuam na infraestrutura existente; não foi criada persistência nova de widgets.

## Capturas reais

Em `screenshots/premium-v2/`:

- `dashboard-dark-1920.jpg`, `dashboard-light-1920.jpg` — sidebar expandida, seis indicadores e inteligência.
- `dashboard-analysis-dark-1920.jpg` — Minha Operação e análises, após rolagem.
- `propostas-dark-1920.jpg`, `propostas-light-1920.jpg` — tabela e controles completos demonstrativos.
- `propostas-cards-dark-1920.jpg`, `proposta-drawer-dark-1920.jpg` — cartões/detalhe.
- `kanban-dark-1920.jpg`, `kanban-light-1920.jpg`.
- `cliente-360-dark-1920.jpg`, `cliente-360-light-1920.jpg`.
- `simulacoes-dark-1920.jpg`, `simulacoes-light-1920.jpg`, `simulacoes-planilhas-dark-1920.jpg`.
- `dashboard-dark-1366.jpg`, `dashboard-light-1366.jpg`, `propostas-dark-1366.jpg`, `propostas-light-1366.jpg`.
- `sidebar-compact-dark-1366.jpg`, `busca-light-1920.jpg`.
- `mobile-dashboard-dark-390.jpg`, `mobile-dashboard-light-390.jpg`, `mobile-propostas-dark-390.jpg`, `mobile-propostas-light-390.jpg`, `mobile-sidebar-dark-390.jpg`.
- `tablet-dashboard-light-1024.jpg`.

Não são mockups rasterizados. São capturas JPEG do navegador renderizando a implementação. Viewports lógicos foram confirmados em DOM; o navegador usa escala de dispositivo, compensada na captura.

## Validação, riscos e pendências

Resultados detalhados estão em `validation-results.md`. Testes estáticos e build não certificam paridade funcional.

- Homologação autenticada por papel, custom permissions e A→B→A permanece bloqueada por ausência de sessão/base isolada de teste confirmada.
- Realtime, notificações, white label por domínio, portal e providers permanecem sem nova homologação ao vivo.
- Sem criação, edição, exclusão, uploads, comunicação ou testes destrutivos. Nenhuma operação bancária real.
- Não executar `vercel-build`: inclui migrations. Build local usa apenas geração de cliente Prisma, Vite e esbuild.
- Aviso existente de chunks grandes continua. Otimizar empacotamento depende de etapa separada; não é comprovação funcional.
- A11y: foco, labels, teclado, Escape, reduced motion e estados revisados; não é certificação WCAG nem teste com leitor de tela real.
- Tabelas largas têm rolagem interna; mobile abre cartões. Sidebar e abas também têm rolagem própria.
- Menus/abas mantêm somente caminhos de navegação; formulários não ficam duplicados e dados de clientes não são persistidos em preferências.
- A nova apresentação de propostas/cliente/Kanban/simulações existe exclusivamente na galeria; a migração funcional é pendência de fase posterior.

## Ponto de parada

Segunda versão entregue para avaliação visual. **Aguardar aprovação antes de nova fase.** Não publicar, fazer push/merge ou iniciar migração completa.

### Resultado final das checagens

- Typecheck: aprovado.
- Build local: aprovado, sem migrations; aviso de chunks grandes mantido.
- Testes seguros: 56 aprovados em 5 arquivos.
- Capturas reais: 26 arquivos JPEG.
- Console revisado: sem erros/warnings relacionados à prévia.
- Homologação autenticada/tenant/providers: bloqueada e não declarada aprovada.
