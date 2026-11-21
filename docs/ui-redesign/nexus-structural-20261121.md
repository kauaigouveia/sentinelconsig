# Sentinel Nexus — novo modelo estrutural de sistema

Data: 21/11/2026  
Branch de desenvolvimento: `feat/nexus-system-structural-ui-20261121`

## Objetivo

Transformar o Sentinel de um workbench com drawer lateral em um sistema SaaS com arquitetura visual própria, inspirado pela referência fornecida pelo usuário, **sem reproduzir uma marca de terceiros** e sem alterar operações bancárias ou regras financeiras.

O trabalho substitui a composição de navegação e a home, em vez de apenas adicionar estilos à sidebar anterior.

## Arquitetura de interface nova

### Desktop

- Barra lateral independente, com marca, busca, ações rápidas e módulos agrupados.
- Aplicativos expandidos e acessíveis, com filtragem pelo mesmo `visibleNavigation` autorizado pelo roteador.
- Cabeçalho operacional no conteúdo com empresa atual, busca global, ações e sessão.
- Contexto de página por módulo, incluindo caminho, descrição e atalhos autorizados.
- Nova home com hero de ações, KPIs da carteira carregada, movimentação recente, distribuição por instituição e próximas ações.
- Superfícies e controles compartilhados modernizados para Propostas, Simulações, Esteira, Suporte, BI, Financeiro e Administração.

### Mobile

- Barra de navegação inferior fixa, com até quatro destinos autorizados e botão “Mais”.
- “Mais” abre uma central completa de aplicativos, em tela inteira, no lugar do drawer lateral antigo.
- Alvos de toque ampliados, suporte às margens seguras do dispositivo e conteúdo sem colunas fixas.
- O cabeçalho mantém os controles da sessão e a busca; o shell deixa espaço para a navegação inferior.

### Dados e segurança

- Os indicadores da home usam `PreviewRow` conforme permissão e escopo de empresa aplicados pelo mesmo `usePreviewData`.
- Os atalhos e links são extraídos de `visibleNavigation`, que se apoia em `canAccessRoute`; não são criadas permissões novas.
- Nenhuma chamada bancária, esquema Prisma, `tenantId`, tabela de comissão ou persistência de propostas é alterada.
- Integrações Daycoval, C6, Paraná, Finanto, BMG, Facta e demais fluxos permanecem sob os respectivos componentes existentes.
- Os números dos cartões não simulam crescimento ou receita. Correspondem à carteira acessível carregada no cliente.

## Implementação

- `src/components/nexus/NexusNavigation.tsx`: nova navegação e central de aplicativos.
- `src/components/nexus/NexusHome.tsx`: página inicial de composição nova.
- `src/components/nexus/NexusPageContext.tsx`: cabeçalho contextual reutilizável por módulo.
- `src/components/nexus/*.css` e `src/styles/sentinel-nexus.css`: layout, grid, tokens, componentes e responsividade.
- `src/App.tsx`: substituição real de shell e home quando Nexus está habilitado.
- `src/workspace-preview.tsx`: prévia com dados fictícios identificados, sem acesso a dados do usuário.
- Testes focados de navegação, permissões e dados da home; `prebuild` bloqueia builds da nova versão se esses testes falharem.

## Controles e reversão

A Nova Interface Nexus é habilitada por padrão em sessões operacionais autenticadas. É possível usar:

- `?ui=classic`: interface clássica durante a sessão atual.
- `?ui=nexus`: volta ao Nexus na mesma sessão.

A preferência utiliza `sessionStorage` sob `sentinel_nexus_variant`; não herda escolhas de interface clássica anteriores da Aurora.

Rollback de código: reverter a publicação do Nexus no GitHub/Vercel. Nenhuma migração de banco deve ser desfeita, pois nenhuma foi executada.

## Limite declarado

A refatoração entrega **novo AppShell, nova navegação e nova home** e adapta os componentes comuns às novas regras visuais. As telas de negócio internas continuam utilizando as implementações operacionais já existentes para evitar regressões bancárias e comerciais; não é uma reescrita integral de cada módulo. A homologação visual de todos os fluxos autenticados e dos formulários bancários exige validação complementar.

A conclusão do build e dos testes do shell não prova homologação de todas as APIs financeiras.
