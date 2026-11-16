# Refatoração Sentinel Consig — Entrega de shell e fluxos (16/11/2026)

Base: `819116152939101cdd742fbd945783e0eee3d7f0`.

## Escopo implementado
- **Workspace lateral:** menu principal vertical por área, atalhos da área atual, mapa de todas as páginas autorizadas e acesso rápido por busca. A barra superior segue preservando empresa, busca, usuário, notificações e tema.
- **Responsividade:** até 1030px, menu lateral vira drawer acionado por botão dedicado, com máscara, Escape e botões de fechamento. Não depende de viewport armazenada em estado.
- **Guia contextual:** nas principais telas de Propostas, Simulações, Esteira, Portabilidade, Pendências, Clientes, CRM, Atendimento, BI, Financeiro, Administração e Integrações, mostra explicação objetiva e próximos passos. Links passam pelo `APP_ROUTES` e `canAccessRoute`.
- **Leituras do início:** consultas por IDs (cliente, banco, parceiro, produto e status) passaram de múltiplas buscas lineares por proposta para índices `Map`. Dados, escopo por empresa, RBAC e projeção mantidos.

## Consolidação de tema
- Removida duplicação de tokens de tema em `src/styles/workbench.css`. A paleta, tipografia e cores semânticas passam a usar `src/styles/tokens.css`, evitando que a folha do workspace substitua silenciosamente valores oficiais.
- Respeitada a cor primária e a tinta de contraste do tenant no workspace e no portal. Não foram editadas preferências ou configurações salvas.

## Contratos preservados
Nenhuma alteração em APIs, integrações, dados, `server.ts`, banco, Prisma, migrações, chaves ou rotas. Os componentes dos módulos operacionais são montados nas mesmas views do `App.tsx`.

## Próximos estágios
1. Remodelar a jornada de Propostas/Esteira/Pendências em fluxo comum, sem descartar suas modalidades e eventos de auditoria.
2. Extrair serviços e componentes da simulação com testes de paridade e regras por banco.
3. CRM/Atendimento e portal do parceiro: telas convergentes com permissões explícitas.
4. BI e Financeiro: critérios comuns de período, indicadores e origem.
5. Central administrativa/integrações: hierarquia de configuração e confirmação de alterações críticas.
6. Segmentar backend e armazenamento por domínio com contrato de API testado.

**Não declarar a refatoração total concluída com base apenas nesta entrega.**

## Gate de publicação — 16/11/2026

- Revisão `d1042998b99ae324ffe232adb067c38de85434c1` validada em sandbox efêmero (sem acesso a dados ou APIs operacionais).
- `npm ci`, `npm run lint` (TypeScript) e `npm run build`: aprovados.
- **141 testes aprovados, 0 reprovados, em 18 arquivos**: navegação, busca, novo layout, Propostas, Kanban, Simulações, Atendimento, Administração, design system, rodapé e segurança multiempresa.
- O preview automático da Vercel terminou em estado **READY**, no commit `d1042998b99ae324ffe232adb067c38de85434c1`.
- Consolidado também o seletor lista/cartões entre workspace legado, Propostas e Simulações, sem mudança de callbacks ou semântica de `aria-pressed`.
- Os **26 testes preexistentes com falhas na base original** (25 de paridade estática e 1 de Propostas, conforme `docs/refactor-20261116-roadmap.md`) não foram alterados nem reclassificados como sucesso.
- **Limite da validação:** não houve testes E2E com sessão real de cliente, dados de produção, chamadas bancárias ou validação visual completa no browser autenticado. Build pronto não equivale a homologação funcional integral.

## Correção responsiva — 16/11/2026 (capturas reais)

- A antiga folha `workbench-navigation.css` mantinha um mapa de telas com posicionamento absoluto e três colunas mesmo dentro de uma sidebar de 248px. Esse conflito causava sobreposição de menus e textos ao abrir "Todas as telas".
- O mapa passou a ser renderizado **fora** da navegação lateral, como diálogo com máscara, rolagem independente, retorno de foco, Escape e tabulação circular.
- Layout adaptável: modal de três colunas em telas largas, duas abaixo de 1030px e uma coluna em tela cheia abaixo de 600px.
- Os cartões de BI e de pendências são agrupados pela largura disponível do conteúdo (`@container sentinel-workspace`), em vez de depender apenas do tamanho da janela.
- Abas analíticas podem rolar horizontalmente sem comprimir o texto; cabeçalhos e guias quebram linha.
- Nenhuma regra financeira, API, migração, tabela de banco, segredo ou tenant foi modificado.

### Validação desta correção
- `npm ci`, `npm run lint` e `npm run build`: aprovados na revisão `e99b4144f7856a9962db14659762f6b5f5bde115`.
- **129 testes aprovados em 16 suítes selecionadas** (23 em navegação/busca/workspace, 106 em módulos operacionais, apresentação e segurança).
- Não foram feitas chamadas bancárias, atualizações de dados nem migrações.
- A inspeção automática por Chromium/Playwright não pôde ser completada: a instalação do Chromium headless não é suportada pelo ambiente Linux do sandbox. Isso limita a validação visual pixel a pixel em produção; as capturas do usuário fundamentaram o diagnóstico e os testes checaram estrutura, foco e integração.
