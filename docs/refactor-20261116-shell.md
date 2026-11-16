# Refatoração Sentinel Consig — Entrega de shell e fluxos (16/11/2026)

Base: `819116152939101cdd742fbd945783e0eee3d7f0`.

## Escopo implementado
- **Workspace lateral:** menu principal vertical por área, atalhos da área atual, mapa de todas as páginas autorizadas e acesso rápido por busca. A barra superior segue preservando empresa, busca, usuário, notificações e tema.
- **Responsividade:** até 1030px, menu lateral vira drawer acionado por botão dedicado, com máscara, Escape e botões de fechamento. Não depende de viewport armazenada em estado.
- **Guia contextual:** nas principais telas de Propostas, Simulações, Esteira, Portabilidade, Pendências, Clientes, CRM, Atendimento, BI, Financeiro, Administração e Integrações, mostra explicação objetiva e próximos passos. Links passam pelo `APP_ROUTES` e `canAccessRoute`.
- **Leituras do início:** consultas por IDs (cliente, banco, parceiro, produto e status) passaram de múltiplas buscas lineares por proposta para índices `Map`. Dados, escopo por empresa, RBAC e projeção mantidos.

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
