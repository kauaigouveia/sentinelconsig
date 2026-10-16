# Navegação guiada das simulações

Seleção simplificada em produtos (INSS, CLT, FGTS e solicitação manual); INSS abre escolha de modalidade com retorno aos produtos. Seletor com diálogo acessível, foco inicial, retorno de foco, Escape e contenção de Tab.

Formulários INSS, Port+Refin, CLT/FGTS e portal organizados em Cliente, Condições/Contrato e Ofertas. Etapas anteriores podem ser acessadas pelos botões Voltar e indicador. Continuar valida os controles visíveis antes de avançar. Campos de outras etapas ficam montados, ocultos e desabilitados; requisições continuam usando o estado existente. Não há persistência de dados pessoais em localStorage. Contratos, fórmulas, endpoints e habilitação de bancos permanecem os existentes.

Alterar produto reabre o seletor acima do formulário. Fechar a seleção retorna ao preenchimento atual. CLT e FGTS ficam montados separadamente para preservar seus rascunhos em memória; o formulário INSS não recarrega tabelas ao retornar à mesma modalidade. Uma mudança de modalidade ainda invalida condições vinculadas à anterior. Voltar durante digitação retorna às ofertas. Solicitação manual e fluxos Happy também permitem alterar produto. Planilhas possuem retorno à lista de simulações.

Consultas de autorização mostram seus links nos resultados; vínculos continuam nas condições. Ofertas continuam sendo calculadas somente por ação explícita. Portal mantém o histórico recolhido em uma seção própria. C6 CLT permanece suspenso.

Checagem TypeScript realizada; nenhum teste automatizado ou consulta real ao banco executado nesta alteração. Conferência interativa em produção permanece pendente.

Rascunhos internos ficam vinculados ao contexto da empresa/usuário: a tela remonta ao mudar esse contexto. Navegar entre as etapas não equivale a uma nova consulta; consultar ofertas continua sendo uma ação explícita. Retornos a uma etapa com dados alterados invalidam as condições conforme os controles existentes.
