# Entrega: resultados múltiplos, temas e desempenho — 04/11/2026

## Resultados de portabilidade
- Resultados agrupados por contrato e instituição, sem alterar cálculo, elegibilidade ou chamadas bancárias.
- Melhor troco calculado em destaque; todas as demais condições acessíveis em expansão. A seleção utiliza o objeto original.
- Contratos individuais e unificações Daycoval em áreas separadas; combinações sobrepostas não devem ser somadas. Estimativas continuam impedidas de seleção quando exigem análise.
- Filtro de instituição e paginação local de três grupos; suporte a 13 contratos preservado.
- Orientações repetidas idênticas agrupadas em painel expansível, sem remover pendências específicas.

## Temas
Causa: quatro superfícies de conteúdo utilizavam o token de sobreposição `scrim`, inclusive o seletor de produtos, produzindo conteúdo escuro com texto escuro no tema claro. Agora usam superfícies do tema; somente o backdrop conserva o scrim.
Tema escuro suavizado com superfícies azul-marinho dessaturadas e texto menos brilhante. Contraste registrado em theme-contrast-20261104.md (44 combinações); white label e resolução de empresa preservados.

## Desempenho implementado
- Logos v6 derivadas das artes oficiais v5, conservando proporção e transparência. Apenas a variante do tema ativo é renderizada. Masters v5 preservados.
- Wordmark escuro: 807.190 → 72.321 bytes; claro: 465.552 → 42.535; símbolo: 982.062 → 16.802; favicon de 32 px: 1.220.561 → 1.905.
- Modais de simulação importados sob demanda; após primeira abertura permanecem montados, conservando o ciclo de vida anterior.
- Chunk SimulationView: 403.229 → 111.111 bytes (gzip 92.642 → 20.726). Entrada global: 979.191 → 983.122 bytes (gzip 276.878 → 278.459). A entrada global não diminuiu; a redução se refere ao chunk de simulações e às imagens, não ao total de código instalado.
- Sincronização GET: coalescência, cache em memória de 30 segundos por usuário/empresa/papel/permissões, até quatro requisições concorrentes, invalidação/abort ao mudar contexto ou sair. Eventos forçam atualização. Gravações locais idênticas evitadas.
- Hubs com fontes próprias carregam somente três catálogos compartilhados; telas ainda dependentes conservam os 17 endpoints legados. Não foi feita uma migração indiscriminada de todos os consumidores.
- CRM: três históricos completos substituídos por MAX agrupado no PostgreSQL, preservando datas e filtro por tenant/parceiros. Datas consultadas por Map. GETs antigos cancelados e respostas obsoletas descartadas; catálogos compartilhados reutilizados.
- Health check do cabeçalho pausa quando a aba fica oculta e retoma quando visível. Polling bancário e chat não foram reduzidos.

## Limitações e pendências reais
- Não foram medidos LCP/INP, waterfall autenticado ou planos SQL em produção. Ganhos de latência percebida não são afirmados sem essas medições.
- Paginação completa da Central de Empresas permanece pendente: os indicadores globais e ações em lote exigem validação específica antes de substituir a leitura integral. Não foi alterada nesta entrega.
- Tentativa de revisão visual no navegador integrado falhou na criação da aba (webview não conectou). Nenhuma captura foi fabricada. Fixture local com 13 contratos e alternativas sintéticas em tests/visual/simulation-workspace.html, opção “Resultados múltiplos”.
- ExcelJS já era dinâmico; continua sendo um chunk grande sob demanda. Avisos de chunk grande no build não equivalem a falha.
- Sem migrations, alteração de schema, consultas bancárias reais ou acesso a banco operacional.

## Reversão
Reverter o commit desta entrega por `git revert`, com validação, e push normal. Os masters v5 e o histórico anterior continuam preservados; não há reversão de banco.

## Validação
- 82 testes aprovados em 13 arquivos no perfil isolado (Vitest): resultados e paginação; unificações; seleção sem escrita automática; cache, concorrência e troca de contexto; agregação CRM com mocks; navegação, planilhas e cálculo INSS HTTP simulado; temas/contrastes, marca, shell e logout.
- Testes de UI adaptados ao carregamento assíncrono dos modais, mantendo as mesmas ações e verificações.
- Nenhum teste com mock é tratado como homologação bancária ou medição real de produção.

- TypeScript (`npm run lint`), build de produção (`npm run build`) e `git diff --check`: aprovados. Build com avisos de chunks grandes, sem erro; Prisma generate apenas, sem conexão/migration.
- Declaração de tipos Vite adicionada para tipar `import.meta.env` no frontend e no harness, sem modificar configuração de runtime.
