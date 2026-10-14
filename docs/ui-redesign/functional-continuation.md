# Continuidade funcional — 14/10/2026

Branch: `codex/sentinel-2-proposals-functional`. Alterações locais, sem commit, push, merge ou deploy.

## Marco atual

O briefing de continuidade foi lido integralmente. A preparação de homologação continua cancelada. A autorização é para frontend reversível, preservando serviços, banco, autenticação, portal e regras. A migração completa não deve ser confundida com a adaptação comum já registrada: ainda há telas e modais herdados a revisar individualmente.

### Propostas, antes da continuação

23 testes selecionados de Propostas/busca passaram novamente. A matriz de 45 itens e o manifesto de controles continuam preservados: filtros, ordenação, seleção, paginação, ações, permissões e destinos originais de formulário. Os cinco arquivos de modais continuam com os hashes da baseline. Isso comprova preservação estática e interações locais cobertas; não comprova CRUD, uploads, importação ou exportação autenticados.

### Fase A — Simulações

- Navegação interna lateral com estado ativo e quatro destinos existentes. No breakpoint menor ela volta a ser horizontal.
- Solicitações mantêm resumo, filtros, cartões/tabela, seleção, importação, exportação e detalhes originais.
- Fila em painel próprio com orientação de prazo, contagem, cartões/tabela e tabela com scroll interno. Regras de 5 dias úteis/72 horas intactas.
- Resultados reorganizados: relatório mensal e funil em largura total, análises por parceiro/responsável em dois painéis na resolução ampla e empilhadas na menor.
- Planilhas com seletor lateral de Daycoval, C6 e Paraná; formulário original reutilizado, incluindo taxas, contratos, prazo e versões. O portal não recebe esse layout.
- Correções após inspeção: navegação sem scrollbar horizontal, filtros com largura mínima legível, contraste do contexto da conversão no tema claro.
- Quatro novos testes DOM: navegação real, fila de oito colunas, destinos de importação/seleção, bancos por planilha, restrição DIGITADOR e exclusão visual do portal. Modais bancários são mockados nesses testes; nenhuma simulação foi executada.

### Fase B — Kanban

Dois testes adicionais exercitam o handler existente com transporte inteiramente mockado: avanço pula etapas não manuais e inativas; avanço não é oferecido sem destino manual. Cinco testes DOM do módulo aprovados. Essa evidência não valida todas as regras de transição do backend ou persistência real.

### Fases C–H

As adaptações anteriores permanecem na branch. A bateria consolidada verifica novamente seus controles/expressões e as interações locais existentes. A profundidade e as limitações por módulo continuam em `progressive-migration.md`. Não declarar revisão visual individual de todas as telas administrativas, financeiras e de gestão nesta continuação.

Atendimento ganhou dois testes DOM adicionais: recebimento por evento `SUPPORT_MESSAGE_RECEIVED` atualiza a mensagem sem reload; perfil sem `support.reply` permanece sem editor. Realtime e fetch estão mockados, sem conexão externa nem envio. A fixture financeira foi corrigida para o status real `REALIZADO`, sem alterar cálculo ou código da aplicação.

## Revisão visual isolada

`tests/visual/simulation-workspace.html` abre o componente operacional original em um harness exclusivamente local/DEV. As fontes são fictícias e explicitamente identificadas; `fetch` é substituído somente nessa entrada separada, sem importação pelo App. Toda escrita e toda URL desconhecida são bloqueadas. Não é login simulado nem captura autenticada. Execute apenas Vite, nunca o bootstrap Express com banco desconhecido.

- URL local: `http://127.0.0.1:5187/tests/visual/simulation-workspace.html`.
- Resolução efetiva inspecionada: 1920×1080 e 1365×767 (a escala do navegador arredondou a configuração destinada a 1366×768).
- Nenhum overflow horizontal da página observado na fila e nas análises. As tabelas largas têm scroll interno.
- Temas claro e escuro conferidos visualmente no harness. Isso não comprova comportamento dentro da sessão real ou do shell completo.

Capturas:

- [Fila escura](screenshots/functional-local/simulation-queue-dark.png)
- [Fila clara](screenshots/functional-local/simulation-queue-light.png)
- [Análises claras](screenshots/functional-local/simulation-analysis-light.png)
- [Planilhas escuras](screenshots/functional-local/simulation-spreadsheets-dark.png)
- [Propostas escuras](screenshots/functional-local/proposals-dark.png)
- [Kanban escuro](screenshots/functional-local/kanban-dark.png)
- [Clientes 360° escuro](screenshots/functional-local/clients-dark.png)
- [CIP escuro](screenshots/functional-local/cip-dark.png)
- [Pendências escuras, estado vazio](screenshots/functional-local/pendencies-dark.png)

O harness foi ampliado para sete módulos originais. As capturas de Propostas não exercitam os callbacks de criação/importação hospedados no App; esse limite permanece nos testes de paridade. A fonte de Pendências está vazia nesta captura. Esses exemplos não representam um tenant autenticado.

## Evidência local

259 testes aprovados em 22 arquivos na bateria consolidada após Simulações/Kanban/Atendimento. Typecheck e build locais foram executados; o primeiro typecheck do harness apontou falta de tipagem `ImportMeta.env`, corrigida com referência `vite/client`. O typecheck após a correção passou. A ampliação posterior do harness passou no typecheck. O fechamento tem 261 testes aprovados e build final aprovado; ver `frontend-delivery.md`.

Os testes não usam banco, serviços bancários, WhatsApp ou autenticação real. Baselines não foram regeneradas. A falha inicial de dois testes de Simulações era a busca de texto exato em um campo composto; o matcher foi corrigido sem alterar a aplicação.

## Comparação e publicação futura

- Aplicação em desenvolvimento: acrescentar `?ui=2` à rota atual para V2 e `?ui=legacy` para rollback. Rotas e aliases não mudaram.
- O harness tem botão próprio para comparar composição, sem autenticação.
- Produção permanece com DEV falso e interface legada. Nenhuma alteração de ativação em produção foi autorizada.
- Antes de publicação futura: concluir revisão individual pendente, validar sessão/perfis/tenants em ambiente autorizado sem operações financeiras, revisar white label, arquivos, realtime e formulários, manter rollback e só então solicitar autorização concreta de push/merge/deploy. Não executar `vercel-build` nesta fase, pois inclui migrations.

**Não validados:** sessões reais, isolamento efetivo no backend, CRUD/import/export completos, documentos, bancos, WhatsApp, realtime externo e todas as telas/modalidades ainda sem inspeção visual individual. Nenhuma perda funcional conhecida foi aceita como simplificação do layout.
