# Nova área de trabalho — novembro de 2026

O sistema usa uma única apresentação, com navegação horizontal por áreas e ferramentas. A página Meu dia reúne carteira, atividade e próximos passos. A navegação respeita permissões e mantém as logos de cada empresa.

Propostas e simulações apresentam registros em toda a largura, com filtros recolhíveis. No celular, iniciam em cartões; a tabela continua disponível. Clientes alterna diretório e ficha no celular. Financeiro mantém busca e ações visíveis e recolhe filtros adicionais. Formulários, diálogos, atendimento, administração, integrações e esteira compartilham a base visual clara ou escura.

O portal do parceiro recebeu cabeçalho, navegação horizontal, início e superfícies internas do novo modelo. Login e recuperação de acesso compartilham a composição responsiva.

## Limpeza

Foram removidas as folhas exclusivas das apresentações anteriores, menus laterais e seletores antigos, galerias e entradas de prévia aposentadas. Folhas de controles compartilhados permanecem porque ainda atendem componentes operacionais. Banco de dados, autenticação, permissões e integrações bancárias foram preservados.

## Prévia e validação

Execute Vite e abra `/workspace-preview.html`. Use `view=/propostas`, `view=/simulacoes`, `mode=partner`, `mode=login`, `theme=dark` ou `modal=new`. No portal, `partnerTab` aceita `dashboard`, `propostas`, `perfil` e `atendimento`.

A prévia monta componentes reais com dados fictícios e bloqueia gravações. Ela não integra o grafo autenticado de produção e não comprova conectividade bancária.

A revisão em navegador cobriu 320, 390, 820 e 1440 px, incluindo início, propostas, simulações, clientes, financeiro, cadastro, login e portal. Os casos medidos não apresentaram transbordamento horizontal de página, cabeçalho ou conteúdo principal. A navegação pode ser rolada horizontalmente no celular.

Os testes cobrem navegação, permissões, logos próprias, sessão do parceiro, filtros, ações, paginação, colunas, diálogos e isolamento da prévia. `workbench-behavior-baseline.json` registra controles e expressões do commit anterior à substituição para verificar preservação operacional. O valor inicial da apresentação dos registros mudou intencionalmente para considerar a largura da tela.

A validação usa dados locais. Não substitui homologação de todas as operações com sessão real nem confirma implantação em produção.
