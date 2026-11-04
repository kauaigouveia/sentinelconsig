# Migração global para a paleta azul

A paleta anterior foi substituída por tokens únicos em `src/styles/tokens.css`. Temas claro/escuro, ação com fallback white label, foco de 2px e cores semânticas separadas. Nenhuma alteração na resolução de tenant.

## Mudanças visuais
- Login: fundo azul-marinho/azul-gelo, formulário legível e ação contrastante.
- Shell: superfícies azuis, navegação menos repetitiva, cabeçalho compacto, filtros e rodapé consistentes.
- Propostas e Kanban: tabelas, filtros, etiquetas e modais usam os mesmos tokens.
- Simulações: jornadas, resultados, planilhas e cartões bancários migrados sem mudar parâmetros ou cálculos.
- Pendências, CRM, financeiro, gestão, administração e demais módulos: cores locais substituídas, sombras coloridas e gradientes removidos.
- Portal do Parceiro: tema e marca preservados, formulários, painel, propostas e atendimento usam a paleta comum.
- Gráficos: séries da paleta, grades discretas e hachuras acima de quatro séries; donut mantém proporções originais.
- Estados de sucesso, alerta, erro e informação mantêm rótulos/ícones existentes e cores semânticas dessaturadas.

## Evidências e escopo
80 capturas de componentes reais com mocks sintéticos, dez superfícies × dois temas × quatro larguras nominais. `depois/azul-capturas.json` registra as dimensões CSS medidas. 1366 nominal corresponde a1365 por limitação de zoom/DPI. A captura nativa pode incluir área excedente. Antes/depois em `comparacao.html`; imagens anteriores ausentes não foram inventadas. Login anterior foi capturado na entrada real; login novo também está disponível no harness isolado, cujo cabeçalho afeta o enquadramento.

44 combinações de contraste passaram: texto >=4,5:1 e contornos funcionais >=3:1. Bordas decorativas de baixa opacidade não substituem contornos funcionais. A cor customizada de empresa é preservada e ganha tinta derivada contrastante; cobertura de216 cores sintéticas. Não se afirma que cada pixel de cada estado das46 rotas foi homologado manualmente.

Inventário `blue-color-inventory.json`: zero cores fixas em TSX/CSS de apresentação;52 ocorrências retidas em configurações de marca/status, defaults e dados sintéticos de serviços. Logos de instituições e imagens não foram recoloridos. Foram removidos34 seletores de overrides para antigas classes de cores, agora ausentes dos componentes. Zero gradientes e `!important` no TSX/CSS migrado.

O baseline semântico de166 módulos vem de `b0af51d`; exclui apenas classes, estilos e pintura e continua verificando expressões, controles, permissões e chamadas. O formulário Nossa Fintech recebeu somente o delta visual na área de stage; alterações preexistentes de13 contratos foram preservadas fora da publicação.

## Validação
- Rodada segura completa local:48 arquivos,492 testes aprovados; zero reprovados.
- Dois testes adicionais cobrem44 contrastes e proporções/hachuras do donut; resultado da rodada final registrado na entrega.
- TypeScript aprovado; build aprovado (aviso já existente de chunks grandes).
- Nenhum banco real, migração, seed ou chamada bancária utilizado.
-194 de195 arquivos protegidos permanecem idênticos ao baseline. A exceção é `integrationHubService.ts`, do ajuste pontual do catálogo previamente autorizado, em commit separado `b0af51d`.

## Hub previamente autorizado
Catálogo de11 instituições, distinção entre configurada/habilitada/verificada, atualização de leitura a cada60s somente visível e Saúde das APIs consolidada sem ampliar permissões. O refresh consulta registros internos: não autentica bancos nem gera verificações bancárias automáticas. Alguns diagnósticos existentes não persistem health logs; login bem-sucedido não certifica operação CLT. Ver `../integrations-hub-consolidation.md`.

## Limites e reversão
Não houve homologação com credenciais reais, todas as empresas, todos os modais e todas as46 rotas autenticadas. Marca/status cadastrados e imagens podem manter cores próprias. As exceções de configuração permanecem documentadas. Backend financeiro, permissões, rotas, schema e migrations não fazem parte da migração visual.

Publicação normal deve preservar o commit remoto de Speed Insights. Rollback por revert dos commits desta entrega, após revisão e validação; sem operações de banco. Não usar reset destrutivo nem force push.
