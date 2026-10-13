# Sentinel Consig — nova identidade e experiência

Pesquisa e implementação: 13/10/2026.
Direção aprovada pelo usuário: temas claro e escuro, aplicação direta no sistema.

## Identidade

- Nome: Sentinel Consig, com assinatura visual `sentinel.`.
- Símbolo vetorial próprio: um S formado por duas direções, representando fluxo
  de operação e acompanhamento. Arquivo `public/branding/sentinel-mark-v2.svg`.
- Azul profundo `#102B3A` para navegação e contraste.
- Verde petróleo `#087D74` para ações e verde suave `#64D3B9` para destaque escuro.
- Superfícies claras `#F0F4F7` / `#FFFFFF`; escuras `#0B1B28` / `#142938`.
- Tipografia Plus Jakarta Sans, números tabulares em tabelas, hierarquia de
  títulos, rótulos e dados. Componentes financeiros mantêm formatos brasileiros.
- Logos e favicon personalizados das empresas continuam sendo resolvidos pelo
  domínio. A nova marca é o padrão da plataforma, não substitui logos próprios.

## Comparativo pesquisado

Foram consultadas páginas oficiais de produtos. Isto compara funcionalidades
publicadas, não constitui avaliação prática de contas ou planos contratados.

| Referência | Recursos publicados | Aplicação no Sentinel |
|---|---|---|
| [Livecred](https://www.livecred.com.br/) | Esteira, simulador, portal do parceiro, WhatsApp, comissões e pendências | Organização conjunta de operação e atendimento. O Sentinel já possui esses módulos; a repaginação melhora o acesso e a apresentação. |
| [Bitrix24](https://helpdesk.bitrix24.com/open/20739996) | Funis com etapas e permissões por equipe | Navegação por atividade e próximas ações. A esteira existente continua disponível; favoritos e filtros salvos reduzem a repetição de navegação. |
| [Pipefy](https://www.pipefy.com/platform/) | Fluxos, integração de departamentos e automação de processos | Painel com etapas que ultrapassaram SLA e acesso à fila de trabalho. Automação avançada continua nos módulos existentes e nas evoluções sugeridas abaixo. |
| [HubSpot](https://www.hubspot.com/products/sales/sales-reports) | Análise comercial e relatórios centralizados no CRM | Ritmo de produção, participação de bancos e visibilidade de resultados, mantendo acesso ao BI existente. |

## Implementado nesta entrega

1. Sistema visual compartilhado para a operação, temas, formulários, tabelas,
   componentes, modais, financeiro, administração e integrações.
2. Menu redesenhado, com busca de telas e favoritos respeitando os módulos
   disponíveis no perfil. A configuração de bancos agora se chama
   **Integrações bancárias**, no menu Integrações.
3. Barra de trabalho com navegação recente, favorito da tela atual e densidade.
4. Preferências por domínio, empresa e usuário; apenas caminhos de módulos são
   guardados nos recentes/favoritos, sem CPFs nem buscas de clientes.
5. Painel operacional redesenhado com dados existentes: volume pago, propostas
   ativas, SLA, pendências, gráfico de cadastros, gargalos e participação de bancos.
6. Período do gráfico: 7, 14 ou 30 dias. Os cartões representam a carteira
   disponível e não são apresentados como projeções financeiras ou previsões.
7. Visualizações salvas nas propostas: banco, status, produto, parceiro, promotora,
   digitador, alçada, SLA e ordenação. Até 8 por usuário neste navegador.
   O campo de busca livre não é armazenado nessas visualizações.
8. Acesso operacional e do parceiro com a nova composição e alternância de tema.
9. Portal do parceiro com menu próprio, painel de movimentações e próximos passos.
10. Atendimento com fila mais compacta, mais espaço para conversa e linguagem
    visual compartilhada. Regras de mensagens e integrações continuam nos serviços.
11. Estados vazios, foco visível, link para pular ao conteúdo, comportamento móvel
    e contraste compartilhados.

Favoritos, recentes, densidade e visualizações salvas são preferências locais
do navegador. Não há sincronização dessas preferências entre dispositivos.

## Evoluções sugeridas — não implementadas nesta entrega

Estas sugestões exigem definição do fluxo, das permissões e dos dados necessários.
Não há botão simulando uma função que ainda não existe.

| Prioridade | Evolução | Resultado esperado | Dependências |
|---|---|---|---|
| Alta | Distribuição de atendimentos por disponibilidade e capacidade da mesa | Equilibrar carga e reduzir espera | Disponibilidade dos atendentes, limites por fila e registro de atribuição |
| Alta | Checklist por banco e modalidade dentro da proposta | Reduzir pendências documentais | Regras validadas por instituição e permissões de edição |
| Alta | Funil completo do parceiro: simulação → digitação → pagamento | Medir conversão em cada etapa | Vínculo preciso entre simulação e proposta; retorno real do banco |
| Média | Linha do tempo única de cliente, proposta e atendimento | Reduzir alternância entre módulos | Associação dos eventos, arquivos e conversas ao cadastro correto |
| Média | Lembretes operacionais configuráveis por SLA | Antecipar atrasos e retomadas | Regras por empresa, consentimento de canais externos e agenda |
| Média | Painéis configuráveis por função | Priorizar dados da mesa, gestão e financeiro | Catálogo de indicadores e autorização por perfil |
| Média | Preferências sincronizadas entre dispositivos | Retomar o mesmo espaço de trabalho | Persistência no servidor por usuário/empresa |

## Operação e implantação

O redesign não exige assinatura de ferramentas pesquisadas nem serviço pago novo.
A autorização de propostas, limites de integrações e isolamento entre empresas
continuam sendo responsabilidade dos serviços existentes no servidor.

O acesso operacional foi conferido visualmente nos temas claro e escuro, e o
acesso do parceiro foi conferido na prévia local. As capturas estão em
`docs/branding/`. A revisão visual completa das telas autenticadas depende de
uma sessão de usuário; compilação e checagem de tipos não substituem essa revisão.


## Revisão estrutural após feedback do usuário

O usuário rejeitou a primeira versão por manter a disposição das telas e reduzir
as cores dos ícones. A nova revisão altera a composição:

- Navegação em duas etapas: barra de áreas com ícones coloridos e painel contextual.
- Nome interno completo **Sentinel Consig**, com remoção de “Consig · Workspace”.
- Área central em uma superfície independente, com bordas arredondadas.
- Simulações e propostas usam cartões de operação por padrão, mantendo a lista
  como alternativa para consulta densa e ações existentes.
- Filtros passam para uma coluna própria; indicadores ficam em um painel separado.
- Fila da mesa também passa a oferecer cartões, na ordem cronológica existente.
- Atendimento passa a ter fila, conversa e contexto do parceiro em três colunas,
  quando houver largura suficiente.
- Módulos de gestão, administração, financeiro e integrações recebem um painel de
  ferramentas relacionadas, respeitando as permissões do perfil.
- Propostas no portal usam o mesmo padrão de cartões e filtros.
- Contraste escuro, textos e ícones voltam a ter destaque, com azul e violeta nas
  ações e cores semânticas para status e áreas.

`layout-preview.html` e `src/layout-preview.tsx` são uma prévia local independente
com dados explicitamente ilustrativos. Não fazem autenticação, chamadas de banco
ou envio de propostas e não fazem parte da entrada de produção do Vite.
As capturas de revisão em `docs/branding/` são da prévia estrutural, não de uma
sessão autenticada com dados reais. O sistema usa os mesmos componentes de
cartões, filtros e indicadores, ligados aos registros autorizados do ambiente.
