# Propostas — matriz de paridade anterior à implementação

13/10/2026. Baseline `795dc0d`. Branch `codex/sentinel-2-proposals-functional`.
Matriz criada antes de modificar ProductionList/App nesta fase. Inventário completo de controles e atributos JSX: `proposals-baseline-controls.json` (seis arquivos, linhas e hashes). Documento é rastreabilidade, não homologação.

Estratégia: a tela real continua sendo ProductionList; adaptar somente composição/apresentação, reutilizando os mesmos estados, serviços e handlers. Não importar GalleryWorkspaces/galleryFixtures. Formulários de cadastro, detalhes e Excel permanecem os mesmos arquivos e fluxos. O modo novo fica opt-in em desenvolvimento até validação completa; não substituir o padrão antes dos testes autenticados bloqueados.

| ID | Campo/ação antiga | Destino Premium real | Permissão/fonte | Validação prevista |
|---|---|---|---|---|
| P01 | ADE/proposalNumber, copiar ADE, abrir por botão/duplo clique | Mesma coluna/handlers | proposals.view; cache do tenant | Render e handler preservado |
| P02 | Cliente/fullName, fallbacks clientId/clientCpf/client embutido | Mesma coluna e resolução | clients/proposals carregados | Render/fallbacks |
| P03 | CPF, formatação, copiar CPF | Mesma coluna e clipboard | proposals.view / política existente | Render/clipboard isolado |
| P04 | Produto/productId | Coluna sem remoção | products carregados | Render |
| P05 | Banco/bankId e promotora/promoterId | Coluna com os dois nomes | cadastros carregados | Render |
| P06 | Valor liberado/disbursedValue e saldo/contractBalance | Coluna financeira preservada | campos originais, sem fórmula nova | Valores ausentes e presença |
| P07 | Parceiro/partnerId/login | Coluna código/nome | partners carregados | Render |
| P08 | Alçada/currentResponsible e responsibleGroup/responsible | Mesma AuthorityBadge | status/operacional existente | Render |
| P09 | Status/statusId, fallbacks status/code | Mesma StatusBadge | status real tenant | Render |
| P10 | Data/createdAt | Mesma formatação e ordenação | propostas carregadas | Ordenação |
| P11 | Vínculo relatedPortabilityId | Ícone mantido | proposta vinculada | Render |
| P12 | Parcela/installmentValue e prazo/installmentsCount nos cartões | Preservados; disponíveis também na lista nova | dados reais da operação | Render |
| P13 | Busca CPF/nome/ADE/login de parceiro | Mesmo estado/algoritmo | dados autorizados carregados | Regressão filtros |
| P14 | Filtros produto, banco, promotora | Barra de filtros nova com controles originais | IDs validados em vistas salvas | Render/aplicação |
| P15 | Filtros parceiro, digitador | Controles originais | PartnerSearchSelect/users | Render/aplicação |
| P16 | Filtros status e alçada | Controles originais | status reais | Render/aplicação |
| P17 | SLA TODOS/NO_PRAZO/5_DIA/ATRASADO | Controle original | AutomationService, dias úteis/feriados | Serviços congelados/testes existentes |
| P18 | Chips por status/banco, contagens e scroll | Mantidos em seção recolhível | dados reais | Render/mudança de filtro |
| P19 | Limpar filtros e feedback | Mesmo clearFilters | sessionStorage por tenant/usuário | Limpeza isolada |
| P20 | Vistas salvas/filtros/ordenação | Mesmo SavedFilterViews | preferenceKey segmentado | Permissão/IDs existentes |
| P21 | Sort ADE, cliente, CPF, banco, valor e data | Mesmos seis handlers e aria-sort | leitura | Render/sort |
| P22 | Lista/cartões, campos nos cartões | Mesma apresentação com shell Premium | leitura | Toggle/render |
| P23 | Densidade, modo foco/Alt+F | Mesmos handlers/preferences | usuário atual | Render/atalho |
| P24 | Contagem e soma filtrada | Resumo horizontal, mesma soma | carteira filtrada; não pago/receita | Comparação antes/depois |
| P25 | Selecionar item/todas e desmarcar | Mesmos handlers; todas significa filtradas, não somente página | proposals.update OU proposals.delete | Restrições/perda de seleção após filtro |
| P26 | Alterar status em lote | Mesmo BulkStatusModal | proposals.update | Render; escrita bloqueada |
| P27 | Excluir individual/em lote/confirmar/erro | Mesmos handlers e DeleteConfirmationModal | proposals.delete | Presença/gate; execução destrutiva bloqueada |
| P28 | Exportar todos/selecionados | Mesmo ExcelExportModal com lista de IDs existente | proposals.view; restrições existentes | Payload/template local; sem envio externo |
| P29 | Importar Excel/templates/preview/deduplicação | Mesmo callback App/ExcelImportModal | proposals.create | Formulário congelado; banco bloqueado |
| P30 | Nova proposta/Ctrl+N | Mesmo App/NewProductionModal | proposals.create | Gate; banco bloqueado |
| P31 | Cadastro rápido/completo e múltiplas ADEs | Mesmo NewProductionModal, todos controles do manifesto | regras de criação existentes | Hash e fluxos bloqueados |
| P32 | Cliente CPF/nome/telefone/email e parceiro; contrato, produto, banco, promotora, convênio, status, alçada, valores/datas/observações | Todos campos JSX e payloads permanecem no formulário original | mesma autorização/validações | Manifesto exaustivo e hash |
| P33 | Detalhes anterior/próximo por propostaIds | Mesmo ProposalDetailModal/ids filtrados completos | proposals.view | Render; autenticado bloqueado |
| P34 | Ajustar valores e status/observação/edição | Mesmos controles/modais do detalhe | proposals.update e gates adicionais | Hash; escrita bloqueada |
| P35 | Histórico | Mesma aba HISTORICO | fontes existentes | Hash/acesso autenticado bloqueado |
| P36 | Pendências criar/resolver/excluir | Mesma aba PENDENCIAS | pendencies.view/create/resolve/delete | Hash/gates; banco bloqueado |
| P37 | Comentários e observações | Mesma aba COMENTARIOS e demais campos | mesmos handlers/gates | Hash; banco bloqueado |
| P38 | Cliente 360 no detalhe/documentos e comunicações vinculadas existentes | Mesmo conteúdo CLIENTE, sem migração de Cliente360 | gates existentes | Hash; arquivos/externos bloqueados |
| P39 | C6, FACTA, HAPPY, FINANTO/Nossa Fintech | Mesmas abas/componentes de integração | banco/tenant/permissões existentes | Hash e vínculo IDs preservado; provider bloqueado |
| P40 | Estados vazio/sem resultado/erro/toasts/loading | Mesmos componentes e feedbacks; sem fixtures | serviços originais | Testes locais e render |
| P41 | Shell: sidebar/rotas/aliases/favoritos/recentes | V2 existente usando APP_ROUTES | canAccessRoute/hasPermission | testes por oito papéis e custom permissions |
| P42 | Busca clientes/CPF/ADE/parceiros/tarefas e atalhos existentes | Paleta V2 com fontes reais; tarefas do endpoint existente | gates por fonte | mocks locais; vivo bloqueado |
| P43 | Empresa atual/seletor/contexto/perfil/tema/notificações | Header existente, apresentação V2 | memberships/contexto existentes | A→B→A/realtime bloqueados |
| P44 | White label/portal/sessões | Mesmas resoluções e portal próprio | domínio/tenant efetivo | inspeção; vivo bloqueado |
| P45 | Rollback | ui=legacy e componente operacional original | desenvolvimento | decisão visual + testes |

## Melhorias aditivas planejadas

Paginação somente de apresentação, com opção de mostrar todas; seleção/exportação/detalhe anterior/próximo seguem a lista filtrada completa. Configuração de colunas oculta visualmente e permite restaurar todos os campos; não remove payloads. Links para Kanban usam rota real autorizada sem migrar o módulo. Nenhuma soma de dados fictícios.

## Bloqueio de substituição

Sem ambiente isolado confirmado, CRUD/auth/multiempresa/documentos/providers não podem ser declarados validados. A tela nova não se torna o padrão. Não produzir captura de “tela autenticada” com sessão falsa. Entrega de desenvolvimento pode estar implementada e continuar com homologação pendente.

## Evidências locais — 14/10/2026

- 79 testes aprovados em sete arquivos selecionados, sem banco e sem chamadas externas. Destes, 23 exercitam a integração funcional nova e a busca de tarefas no DOM com mocks locais.
- Os 39 controles capturados da lista original mantêm seus atributos e bindings. Quatorze expressões de regras/handlers mantêm a mesma AST canônica do baseline `795dc0d`.
- NewProductionModal, ProposalDetailModal, BulkStatusModal, ExcelImportModal e ExcelExportModal permanecem com hashes iguais ao baseline. Isso comprova preservação do código, não execução bem-sucedida de seus fluxos autenticados.
- Paginação, todas as propostas filtradas na seleção/exportação/detalhe, poda da seleção após filtro, cartões/tabela, colunas/restauração, gates de MASTER/GESTOR/DIGITADOR e permissões customizadas foram exercitados localmente.
- A→B→A foi verificado somente para dados e preferências sintéticos do componente; não houve alternância de sessão real. Busca de tarefas descarta respostas atrasadas, aborta ao fechar e respeita `tasks.view`.
- Capturas autenticadas, criação/edição, importação real, geração do arquivo exportado, documentos, realtime, portal e chamadas bancárias continuam bloqueados. Não há autorização para tornar a V2 padrão ou publicá-la.
