# Redesign v4 — Fases 1 e 2

03/11/2026 · branch `codex/redesign-v4-system-shell` · base `c0e7b6acdd14ca60c056d23cb757d770f5a6d1ab`.

## Entrega visual

[Comparação lado a lado](comparacao.html) · [Manifesto das capturas](depois/capturas.json).

São 56 capturas reais da matriz: login, shell, Propostas, Kanban, Simulações, Pendências e primitivas, nos temas claro/escuro e larguras solicitadas 390/1024/1366/1920. Há ainda imagens do menu móvel, modal e drawer. A comparação usa os JPEGs anteriores originais, sem fabricação ou redesenho. Não há referência anterior de 1024, shell ou galeria: isso está identificado, sem substituir por outra dimensão.

- **Login:** formulário em primeiro plano e primeira dobra no móvel, uma assinatura de marca, painel editorial apenas no desktop, campos delimitados, senha/recuperação/manter conectado preservados.
- **Shell:** lateral de 208px, cabeçalho de 56px, navegação neutra em vez de ícones multicoloridos, breadcrumbs e páginas recentes em uma faixa compacta. Páginas recentes continuam acessíveis por expansão. Busca, favoritos, atalhos, notificações, seletor de empresa e footer mantidos.
- **Propostas:** cabeçalho editorial, total financeiro junto à contagem, menos indicadores repetidos, tabela limpa com valores tabulares. Filtros salvos, filtros rápidos/avançados, colunas, exportação, seleção em lote, paginação, cartões e Kanban preservados.
- **Kanban:** título e filtros separados das colunas, cartões sem sombras pesadas, tipografia e superfícies consistentes, navegação por etapas e SLA preservados. A captura revelou um desalinhamento após adaptação do ActionBar; corrigido na origem mantendo seu seletor estrutural.
- **Simulações:** tabela como apresentação inicial; cartões continuam disponíveis. Resumo operacional e roteiros sob demanda. Abas compactas e filtros junto aos registros, sem alteração de cálculo ou despacho bancário.
- **Pendências:** PageHeader com ações existentes, indicadores em faixa menor, filtros e resultados abaixo. Cores semânticas com nomes/status, sem usar marca como sinal de SLA.

## Sistema visual

`src/styles/tokens.css` é a fonte de cores, temas, escala tipográfica, espaçamento, raios, camadas e aliases de compatibilidade. Paleta oficial aplicada, sem gradientes. Campos usam `--field-border`, mais contrastante que divisórias decorativas. `--text-muted` escuro não é usado como texto legível nas folhas migradas.

A ação usa `var(--primary-color,var(--action-default))`. A composição visual recebe a cor existente do tenant/domínio, sem gravar configurações. `paletteStyle` escolhe tinta preta/branca para cores hex de white label, conservando a cor cadastrada. Ausência de marca usa o padrão do tema; o azul de fallback do resolvedor público não substitui essa paleta. Identidade, logos e mecanismos de resolução não foram reescritos. A matriz sintética de 216 cores confirma contraste de tinta >=4,5; cores CSS fora dos formatos hex aceitos são preservadas, mas não estão certificadas por essa medição.

Primitivas em `src/components/ui/DesignSystem.tsx`: Button/IconButton, Input, Select, Textarea, Checkbox/Switch, Badge, Card, Tabs, Modal/Drawer, Table, PageHeader e FilterBar; reutiliza EmptyState/Skeleton existentes. MetricCard, StatusBadge e ActionBar mantêm aliases de props; adaptadores common já delegavam a ui e foram conservados. PremiumStatCard, PremiumStatusBadge, DetailDrawer e EmptyState Premium delegam às bases compartilhadas. Formulários específicos mantêm seus controles/handlers nativos, estilizados pelo sistema; não foram substituídos por formulários novos.

As sete folhas ativas foram migradas em seus próprios seletores. Removidos os 44 `!important` anteriores, tokens duplicados, gradientes e sombras pesadas. Não foi criada uma oitava folha de correções por sobrescrita. Regras funcionais de colunas ocultas, navegação e responsividade permanecem; regras exclusivas do resumo de Propostas retirado foram removidas após confirmar ausência do consumidor.

## Contraste medido

[Medições dos tokens](depois/contraste-tokens.json) · [Medições no navegador](depois/contraste-browser.json).

- 36 pares estáticos verificados: textos primário/secundário e bordas de campos em três superfícies, ações padrão e quatro semânticas nos dois temas. Todos atendem suas metas de 4,5:1 para texto e 3:1 para bordas.
- 468 observações de controles visíveis no navegador (incluem controles do harness e repetição entre temas). Menor contraste de texto **5,016:1**; menor borda de input/select/textarea **5,016:1**. Não são 468 componentes únicos.
- Medição baseada em cores computadas, composição de fundos e luminância WCAG. Não equivale a certificação integral WCAG: não cobre todos os dados dinâmicos, estados operacionais, textos de imagens, cores arbitrárias de marca ou todos os popovers.
- A troca de tema não anima cores, evitando legibilidade insuficiente durante a transição. Movimento de layout respeita reduced-motion. Modal verificado com Escape/retorno de foco e trap de teclado; abas com setas e exclusão de itens desabilitados.

## Segurança e preservação

[Verificação dos hashes protegidos](depois/protected-verification.json): **195/195 intactos** em relação à Fase 0, incluindo backend, serviços, rotas, permissões, APIs, resolvedores de branding, Prisma e configuração Vercel. As 46 APP_ROUTES não foram alteradas. Nenhuma conexão com banco, migration, integração bancária, seed, deploy ou publicação foi executada.

Os diffs locais anteriores de backend, armazenamento, multissimulação até 13 contratos e infraestrutura de testes do Lote 0 foram preservados e não pertencem a este redesign. O build executa `prisma generate` (geração local de cliente), não aplica schema/migrations nem conecta ao banco. Não se iniciou o servidor completo; somente Vite em loopback.

Os testes funcionais mantêm a intenção e as ações. O manifesto AST compara controles e expressões operacionais com fontes Git da base, ignorando apenas classes visuais. A única mudança intencional de estado inicial é cartões → lista em Simulações. O hash dos formulários de Propostas foi alinhado à fonte Git já existente e normalizado para LF/CRLF; esses formulários não foram modificados pelo redesign. Mock de tenant e assertiva específica de cartões foram ajustados sem remover testes.

## Verificações

- Suíte segura allowlist do Lote 0: **45 arquivos, 481 testes aprovados, zero falhas**. Sem suítes antigas não autorizadas.
- `npm run lint`: TypeScript `tsc --noEmit`, aprovado. O projeto chama esse comando de lint; não é uma execução adicional de ESLint.
- `npm run build`: aprovado, sem migrations. Aviso de chunks >500kB continua; não declarar ganho de desempenho apenas com base no redesign.
- Regressão UI final: **20 arquivos, 132 testes aprovados, zero falhas**. TypeScript/build finais aprovados; `git diff --check` aprovado. A regressão UI é subconjunto dos 481 testes, não deve ser somada como cobertura independente. Após o ajuste dos estados hover e a formatação das primitivas, smoke final: **3 arquivos, 35 testes aprovados**, TypeScript/build novamente aprovados.
- Menu móvel aberto/fechado, diálogo aberto e fechado com Escape, drawer aberto/fechado no navegador local. Testes automatizados exercitam ordenação sem mutação de registros, callbacks, paginação, filtros e ações existentes.

## Limites e homologação restante

A entrada de login é real, sem submissão de credenciais. As telas operacionais usam o mesmo harness local da Fase 0, com componentes reais e dados sintéticos, fetch externo/escritas bloqueados e realtime desativado. Shell usa Header/Sidebar/Footer reais com usuário fictício; não representa sessão real autenticada. Não há aprovação de operações bancárias, RBAC ao vivo ou troca de empresa em backend por essas imagens.

O navegador confirmou 390, 1024 e 1920 CSS. O alvo 1366 resultou em **1365 CSS** pelo zoom/DPI do IAB. A API aceita apenas inteiros; não fabricamos dimensão exata. JPEGs podem incluir superfície excedente do navegador. As capturas depois usam altura CSS 955; as anteriores têm alturas variadas, e Propostas escuro móvel foi registrado em 488 CSS na Fase 0. A comparação informa as dimensões efetivas de cada imagem; não inferir ganho de área ou performance com alturas diferentes. O manifesto registra dimensões efetivas. Homologação do pixel exato 1366 e validação autenticada completa continuam pendentes.

O redesign está aplicado à entrada real e aos componentes ativos, não somente à galeria. Permanecem módulos fora desta rodada e formulários específicos não convertidos integralmente para as novas primitivas. Não houve push, merge ou deploy; o sistema publicado permanece na versão anterior.
