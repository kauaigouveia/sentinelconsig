# Repaginação do Sentinel Consig

## Telas alteradas

| Área | Mudança |
| --- | --- |
| Início | Ações por tarefa, busca e indicadores da carteira carregada. |
| Propostas | Busca principal, filtros em painel separado, tabela com colunas essenciais por padrão e preferências preservadas. |
| Cadastro de proposta | Formulário com campos identificados como padrão; planilha avançada opcional. Alternar a apresentação preserva os valores preenchidos. |
| Simulações | Quatro áreas com descrições, filtros separados dos registros e acesso às solicitações, digitação, planilhas e resultados. |
| Clientes | Diretório e ficha em áreas distintas; no celular, lista e ficha alternam com retorno explícito. |
| Atendimento | Acesso por fila: aguardando atendimento, em andamento, concluídos e histórico. |
| Financeiro | Acessos a receber, a pagar e vencidos, preservando o cálculo dos indicadores e os filtros de período. |
| Administração | Busca de configurações, menu lateral e diretório de ferramentas com botões acessíveis. |
| Integrações | Separação entre acompanhamento e escolha de banco/canal; seleção rápida e diretório de conexões. |
| Portabilidade | Filas com descrições de prazo e retorno, mantendo as regras e valores existentes. |
| Esteira | Navegador de etapas e cartões com novo espaçamento. |
| Demais módulos | Estilos compartilhados de controles, painéis, navegação e tabelas; tarefas com organização por colunas. |

Logos, rotas, fontes de dados e permissões existentes foram preservadas. A mudança de apresentação não substitui regras bancárias nem altera contratos, migrações ou políticas de acesso.

## Prévia navegável

Execute `npx vite --host 127.0.0.1` e abra `/workspace-preview.html`.

O menu dessa página agora abre os componentes reais das telas internas. O parâmetro `view` seleciona a rota, por exemplo: `/workspace-preview.html?view=%2Fpropostas&theme=light`.

A entrada é exclusiva de desenvolvimento. `previewEnvironment.ts` fornece dados fictícios, intercepta chamadas de API e rejeita gravações. Ela não é importada pelo grafo da aplicação autenticada. Fontes não representadas pela prévia apresentam indisponibilidade; a prévia não demonstra conectividade real com bancos. O cadastro pode ser aberto com `modal=new`.

Para o sistema completo com sessão autenticada, use `npm run dev` e a entrada normal da aplicação.

## Validação

- 106 testes relacionados passaram nos conjuntos executados: início, escopo e ativação da interface, clientes, financeiro, administração, simulações, atendimento, esteira, CIP, integrações, cadastro e preferências de colunas.
- `npm run lint` passou.
- `npm run build` passou, incluindo geração do Prisma Client, Vite e servidor. Permanece o aviso de tamanho dos bundles.
- Prévia desktop de propostas, clientes, simulações, financeiro, administração e formulário de cadastro renderizada e inspecionada.
- A verificação de todos os fluxos com sessão autenticada e a revisão visual de todos os módulos secundários em desktop e celular ainda não foram concluídas.
- Não houve publicação em produção.
