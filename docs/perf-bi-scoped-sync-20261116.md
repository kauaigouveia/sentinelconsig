# Otimização gratuita — BI e sincronização (16/11/2026)

## Antes
A página `/bi` iniciava 16 chamadas ao mesmo tempo no `ExecutiveBIDashboard`, incluindo indicadores de abas ainda não abertas, e a sincronização geral carregava 17 endpoints da aplicação.

## Depois
- Visão Executiva: apenas `overview`, `production`, `comparison` e `operational-health` (**4 de 16 chamadas iniciais do BI**, redução de 75% em contagem de chamadas, não em latência medida).
- Abas Produção, Conversão, Bancos, Parceiros, Operadores, SLA, Integrações: carregam exclusivamente o conjunto de dados da aba ativa. Produtos/Convênios traz dois; Gargalos/Cancelamentos/Recusas traz três.
- Alternar abas e filtros aciona nova consulta apenas para a aba escolhida. Os filtros continuam no endereço, a atualização manual e o realtime são preservados.
- A sincronização da rota `/bi` (e alias `/dashboard-executivo`) passa de **17 para 11 endpoints**, removendo audit logs, documentos, financeiro, regras operacionais, associações bancárias e promotoras do carregamento inicial.
- A busca global continua precisando de Clientes e Propostas; por isso ambas seguem na sincronização do BI. O painel de filtros continua com Bancos, Parceiros, Produtos, Convênios, Usuários, além de identidade, notificações e tarefas para a shell.
- Ao navegar para outras rotas, a sincronização global segue intacta. Nenhum cache entre tenants foi introduzido.

## Testes e cautelas
- TypeScript, build e **103 testes em 10 suítes** concluídos com êxito, incluindo interface React do BI, planejamento de endpoints, escopo multiempresa e testes de ativação de produção.
- Sem migrações, alterações em regras financeiras, endpoints bancários ou gravação de dados.
- Ganho de requisições é comprovado pelo código e testes; melhora em tempo de resposta real depende da rede, do PostgreSQL e dos dados da empresa. Não foram medidas métricas p50/p95 nem consumo de memória em produção.
- Próxima fase: busca leve por servidor para evitar carregar Clientes/Propostas inteiros no shell, paginação no backend, medição PostgreSQL `EXPLAIN` em consultas autorizadas e revisão de índices baseada em planos reais.
