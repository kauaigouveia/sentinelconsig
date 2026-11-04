# Varredura de desempenho — Sentinel Consig

## Escopo e resultado
Inspeção do código compartilhado, CRM, empresas, simulações e artefatos do build local de produção. Sem consultar banco operacional, usuários reais ou instituições financeiras. Medições de tamanho são reais do build; impacto sobre latência/LCP em produção ainda não foi medido. Não há evidência para atribuir toda a lentidão a uma única causa.

O arredondamento foi corrigido no estilo compartilhado `src/styles/sentinel.css:316`, usando o raio de painel já existente.11 testes focados e build aprovados. Commit publicado: `18cb6205c577331ccf7f1c96ce19a9d25b759872`. Nenhuma otimização funcional foi aplicada nesta varredura.

## Prioridades confirmadas no código

### P1 — Imagens de marca grandes demais
`public/branding/sentinel-favicon-v5.png`:1.220.561 bytes; símbolo982.062; wordmark escuro807.190; claro465.552. Em `src/components/common/BrandLogo.tsx:8`, as duas variantes são elementos img e a invisibilidade depende de CSS: esconder uma não impede seu download. Favicon mais as duas assinaturas somam cerca de2,49MB antes de considerar cache. Os PNGs preparados na troca recente de marca estão superdimensionados para sua exibição; este é um problema concreto da entrega recente.

Correção recomendada: derivados pequenos de cada original, alpha preservado, favicon16/32/48/180 e assinatura em resoluções adequadas. Carregar somente a variante ativa e validar fidelidade e temas. Não remover transparência nem distorcer a marca. A versão JPG do fundo tem99.510 bytes e não é o principal peso encontrado.

### P1 — Sincronização global sequencial e redundante
`src/services/storageService.ts:1189`:17 await safeFetch sequenciais, abrangendo clientes, propostas, tarefas, notificações, bancos, promotoras, parceiros, produtos, convênios, regras, vínculos, marca, documentos, financeiro, auditoria, usuários e empresas. Os resultados são mapeados e serializados em localStorage, operação síncrona. `src/App.tsx:192` inicia a sincronização; o fallback de eventos sem entity volta a solicitá-la. Não há coalescência de execução nesta função.

Correção recomendada: carregamento por tela/permissão, sincronização em voo única por usuário/empresa, paralelismo limitado para catálogos independentes e cache invalidado por contexto. Reduzir armazenamento e parse de coleções grandes. Preservar revogação, isolamento e invalidação após troca de empresa.

### P1 — CRM busca histórico inteiro para obter última atividade
`server/services/partnerCrmService.ts:104`:a lista usa count+findMany, depois seis consultas de agregação/atividade. As três buscas em176–190 carregam todas as propostas, simulações e interações dos parceiros da página, sem take ou agrupamento MAX. Em210–214, cada parceiro volta a filtrar os arrays completos em memória.

Correção recomendada: agregar MAX(createdAt/updatedAt/date) por partnerId no banco, mantendo os filtros tenantId e as regras atuais; mapear resultados por chave. Medir tempo e plano de execução em ambiente autorizado antes de propor índices. Não requer concluir que existe N+1: as consultas estão em lote, mas materializam histórico demais.

### P2 — JavaScript pesado e modais antecipados
Build: entrada979.191 bytes (276.878 gzip), Simulações403.229 (92.642 gzip), política de portabilidade221.559 (36.316 gzip). `SimulationView.tsx:41–50` importa estaticamente numerosos modais de produtos/instituições antes de o operador abri-los. App já usa lazy loading por rota; não se recomenda desfazer isso.

Correção recomendada: dividir modais por ação e analisar o grafo do bundle inicial. ExcelJS940.196 bytes (271.329 gzip) já é importado dinamicamente em `excelService.ts:141`; não é correto somá-lo automaticamente ao download inicial. Só será custo inicial se um caminho o antecipar, o que não foi demonstrado.

### P2 — Requisições que continuam ou ficam obsoletas
`PartnerCrmHub.tsx:91–141`:há debounce de200ms e proteção contra resposta antiga, mas sem AbortController; pesquisas anteriores continuam consumindo backend. Auxiliares carregam listas de usuários/promotoras separadamente. `Header.tsx:300` consulta health a cada30s sem pausar por visibilidade. Isso gera tráfego por aba, mas sua contribuição para a lentidão atual é hipótese, não causa medida.

Correção recomendada: cancelar GET obsoleto, reaproveitar catálogos por tenant e pausar apenas health não crítico em aba oculta. Não reduzir polling de chat ou de jornadas bancárias sem comprovar confiabilidade dos eventos.

### P2 — Empresas não utiliza paginação já disponível
`PlatformMasterCentral.tsx:303` chama `/api/saas/tenants` sem paginação. `server.ts:8668` retorna todos os tenants com marca, masters e contagens nesse modo; há caminho paginado existente no handler. Risco de crescimento, não explicação comprovada para uma instalação pequena.

## Sequência recomendada
1. Otimizar ativos e seleção de logo, com comparação visual e orçamento de bytes.
2. Medir e corrigir sincronização global e agregações do CRM com dados sintéticos representativos.
3. Dividir modais e cancelar GETs obsoletos.
4. Medir novamente sob as mesmas condições: cache frio/quente, LCP, INP, tempo até lista utilizável, volume de requests, bytes e tempo das APIs. Não inventar metas percentuais de ganho antes da linha de base.

Faltam waterfall, profiler, métricas Vercel e planos SQL de ambiente autorizado. Não foram executadas mudanças no banco ou produção para obter essas evidências. Inventário quantitativo em `performance-scan-20261104.json`.
