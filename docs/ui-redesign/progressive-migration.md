# Migração funcional progressiva — Premium V2

## Continuidade mais recente

[Entrega local consolidada](frontend-delivery.md): 261 testes, typecheck e build final aprovados. Diálogos originais com apresentação V2; Automações e Intelligence reorganizados e contraste corrigido. A implementação está disponível em desenvolvimento com rollback. Fluxos autenticados e inspeção individual de todos os formulários não estão homologados; limites de evidência explícitos no relatório.

[Marco de 14/10/2026](functional-continuation.md): Propostas revalidado, Simulações aprofundado, testes adicionais de Kanban e Atendimento; 259 testes locais em 22 arquivos aprovados e capturas isoladas dos componentes reais com dados fictícios. A revisão individual de todas as telas e modais herdados continua pendente. Não considerar a migração completa concluída.

14/10/2026. Branch `codex/sentinel-2-proposals-functional`.

## Autorização vigente

O usuário cancelou a preparação de homologação separada e autorizou a migração progressiva de todos os módulos em desenvolvimento. Não criar ambiente, banco, migrations ou seeds. Não modificar backend, integrações, contratos HTTP ou regras. Sem push, merge ou deploy. Ausência de autenticação segura não bloqueia desenvolvimento: registrar fluxos como **não validados**.

O plano de homologação anterior é histórico e está cancelado. Rollback continua disponível pelo modo legado. Galeria não alimenta os módulos operacionais.

## Registro por módulo

| Módulo | Migração / preservação | Verificação local | Fluxos não validados |
|---|---|---|---|
| Shell e Propostas | Componente operacional original, paginação, colunas, filtros, mesmos modais e handlers; matriz de 45 itens | 79 testes selecionados, typecheck e build aprovados na conclusão de Propostas | Sessão real, CRUD, import/export reais, documentos, realtime, bancos, white label por domínio |
| Simulações | Workspace horizontal Premium, resumo e filtros no topo, conteúdo original, quatro abas e todos os simuladores/modais preservados | 35 testes selecionados aprovados (12 de paridade/adapter); typecheck e build aprovados | Cálculos ao vivo, consulta/contratação bancária, planilhas autenticadas, gravação, fila/realtime |
| Kanban | Navegador de etapas com dados filtrados, coluna focável, layout de esteira e cards Premium; mesmos filtros/detalhe/mudança de status | 15 testes selecionados aprovados; typecheck e build aprovados. Falha inicial de nome acessível corrigida com aria-label explícito | Transição de status com persistência |
| Clientes 360° | Layout de carteira/perfil com navegação lateral de sete seções, múltiplas ADEs e mesmos handlers | 15 testes selecionados aprovados; typecheck e build aprovados. Testes usam GETs mockados e não executam comunicação/upload | Cadastro, documentos, comunicação e notas com persistência |
| CIP | Resumo financeiro, navegação lateral das cinco filas e tabela operacional de nove campos; mesmos cálculos, cron e detalhe | 14 testes selecionados aprovados; typecheck e build aprovados; cron não executado | Retornos, cron e atualizações financeiras |
| Pendências | Filtros laterais, seis indicadores compactos e fila principal; mesmo drawer, formulários, ações e gates | 15 testes selecionados aprovados; typecheck e build aprovados; apenas GETs mockados | Assumir/resolver/cancelar/reabrir/criar, comentários e configuração de SLA com persistência |
| Financeiro | Quatro indicadores, filtro lateral e tabela de oito campos; mesmos formulários, CSV, pagamentos e cálculos | 96 testes selecionados aprovados; typecheck e build aprovados; abertura/cancelamento local do formulário e busca | Gravação, edição, pagamento, exportação real e exclusão |
| CRM de Parceiros | Indicadores compactos, filtros laterais, grade/tabela e mesmos formulários/detalhes/importação | 95 testes selecionados aprovados; typecheck e build aprovados; grade/tabela, pesquisa e destinos de formulário/importação com mocks | Cadastro, credenciais, comunicação, edição e exclusão com persistência |
| Hub de Integrações | Dez áreas reais em navegação lateral, indicadores e conteúdo original; mesmas configurações e ações bancárias | 95 testes selecionados aprovados; typecheck e build aprovados; rascunho do filho preservado em rollback com mock | Diagnósticos, sincronizações, credenciais, logs e saúde reais |
| Administração | Navegação interna horizontal, sem segunda sidebar; usuários/produtos/status/auditoria/calendário/bancos e demais destinos reutilizados; gates de plataforma intactos | 96 testes selecionados aprovados; typecheck e build aprovados; MASTER mantém 15 destinos e PLATFORM_MASTER 17, com mocks | CRUD de usuários/perfis/regras, importações, marca e domínio com persistência |
| Rotina e Operação | Minha Fila em painéis de prazo; agenda, Central de Operações, digitador e gamificação com identidade comum e mesmos controles | 95 testes selecionados aprovados; typecheck e build aprovados; busca/navegação da Minha Fila com fonte sintética. Outros componentes: paridade estática | Conclusão/criação de tarefas, edição, importação/exportação e realtime reais |
| Atendimento e Suporte | Fila e conversa em painéis Premium; filtros, modelos, avaliação, configuração WhatsApp e handlers originais preservados | 99 testes selecionados aprovados; typecheck e build aprovados. Paridade estática, sem enviar mensagens | Envio, WhatsApp, avaliação persistida, realtime e isolamento de sessão reais |
| BI, Radar, Intelligence e Relatórios | Cabeçalhos compactos, navegação analítica e tabelas Premium; cálculos, filtros, gráficos e exports originais | 101 testes selecionados aprovados; typecheck e build aprovados; paridade estática dos módulos e testes locais de métricas existentes | Métricas autenticadas, exportações reais e relatórios gerados |
| Command Center | Identidade Premium aplicada ao módulo de incidentes original; permanece separado do dashboard operacional | Mesma bateria de 101 testes, typecheck e build; paridade estática | Tratamento de incidentes, logs e realtime reais |
| Automações | Navegação de regras/histórico/métricas/modelos e builder originais no padrão Premium | 95 testes selecionados aprovados; typecheck e build aprovados; abertura/cancelamento do builder com mock, sem executar regra | Salvar/ativar/duplicar/excluir regras, testar e executar automações |
| Plataforma e Consumo | Empresas/assinaturas e plano/consumo com controles originais e apresentação comum; seleção, ações em lote e modais preservados | 142 testes selecionados aprovados; typecheck e build aprovados; paridade estática e escopo de rotas | Cadastro/edição/exclusão de empresas, assinaturas e inspeção real |
| Monitor TV | Mantém seu layout de leitura à distância no novo shell; sem alterar escala dos indicadores | Mesma bateria de 142 testes, typecheck e build; paridade estática | Monitoramento e realtime autenticados |
| Login e Portal do Parceiro | Mantidos independentes do shell administrativo, com sessão e identidade próprias | Paridade estática dos arquivos originais | Login, sessão real, identidade por domínio e fluxos do parceiro |

## Evidência e limites

`modules-functional-baseline.json` captura controles e expressões dos cinco primeiros módulos antes das modificações. `remaining-modules-baseline.json` registra outros 47 componentes/formulários antes de suas migrações. `scripts/ui-module-manifest.mjs` só lê código fonte; não importa serviços da aplicação. Os testes de AST evidenciam preservação do código, não comportamento de serviços ao vivo. Testes DOM do adapter exercitam o conteúdo e callbacks sintéticos, sem sessão falsa.

Após cada módulo: testes locais selecionados, typecheck e build sequenciais; registrar resultado, avisos e pendências. Nunca executar a suíte indiscriminada: há testes que usam banco. Interromper se a alteração exigir mudar regra, contrato, persistência, permissão ou remover fluxo.

## Consolidação local

251 testes aprovados em 20 arquivos selecionados. Baterias por módulo/família foram executadas durante a migração; a bateria final reúne todos os testes seguros selecionados. Typecheck e build também foram executados em cada marco de módulo/família; não houve execução de migrations, seed, banco ou contratação. Typecheck final e `git diff --check` aprovados. Build final aprovado, com aviso de chunks maiores que 500 kB.

A profundidade da migração varia: Propostas, Simulações, Kanban, Cliente 360°, CIP, Pendências, Financeiro, CRM e Hub têm adapters/layouts próprios; Administração, Rotina, Suporte, BI/Intelligence/Relatórios, Automações e Plataforma reaproveitam a estrutura interna existente sob o shell e apresentação comuns. Preservar os formulários originais foi prioritário. Não declarar redesenho individual completo de cada modal ou aprovação visual autenticada.

Todas as rotas administrativas/operacionais declaradas têm escopo de apresentação, com a mesma autorização. As rotas do parceiro continuam fora desse escopo. A preferência do modo de desenvolvimento persiste somente `2` ou `legacy`; não armazena CPF, cliente, senha ou dados financeiros. URL explícita tem prioridade sobre essa preferência.

**Não validados:** sessão real, múltiplos tenants reais, permissões efetivas no backend, gravações/CRUD/importação/exportação completa, arquivos/documentos, mensagens/WhatsApp, integrações bancárias, realtime, layout autenticado nos dois temas e nas resoluções 1920×1080/1366×768. Nenhuma captura autenticada foi produzida. Isso não bloqueou a implementação, conforme instrução do usuário.

Pendências técnicas: revisar visualmente os modais e telas herdadas, ergonomia/contraste/teclado com sessão autorizada, aviso de tamanho dos bundles e auditoria das vulnerabilidades agregadas previamente informadas na instalação das dependências. O comando opcional de formatação automática não foi executado porque Prettier não está instalado localmente; nenhuma dependência de formatação foi adicionada.

[Arquivos alterados](migration-changed-files.md). [Matriz de Propostas](proposals-functional-parity.md). [Equivalência de navegação](navigation-equivalence.md).

Não houve alteração de backend, Prisma/schema/migrations, serviços, regras financeiras, router ou autenticação. Nenhum push, merge, deploy ou recurso externo. Interface antiga disponível para rollback. Migração de apresentação permanece exclusivamente na branch de desenvolvimento; não equivale a autorização de publicação.
