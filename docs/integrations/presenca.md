# Presença Bank — conexão, CLT/FGTS e dados de benefícios INSS

## Escopo entregue

- Hub de Integrações → Presença Bank, utilizando a seleção interna de promotora existente.
- Login/senha protegidos com AES-256-GCM no SystemConfig existente, sem alteração de schema. Chave derivada do segredo de autenticação do servidor; nunca enviada ao navegador.
- Configuração independente por tenant, promotora e ambiente. Alterar ambiente não herda credenciais. Configuração inicialmente desativada; ativação CLT requer confirmação de liberação pelo banco.
- Simulações → CLT: painel na mesma tela, visível somente quando há conexão habilitada. As conexões são resolvidas internamente; nomes de promotoras não aparecem na consulta.
- Termo por link → informação de aceite pelo cliente → vínculos ativos → margem do vínculo escolhido → ofertas CLT v6.
- Cada etapa exige contexto criptografado e temporário de 15 minutos, ligado a usuário, tenant, CPF e configuração da conexão. Os contextos ficam somente na memória do componente.
- Parcela limitada pela margem retornada. Valores monetários usam CurrencyInput/BRL existente. Sem cálculo de taxa ou valor por estimativa.
- Ofertas negativas, de teste, de outro tipo de crédito e com parcela acima da margem não são exibidas.
- Permissões: integrations.view para metadados; integrations.manage para salvar/testar; simulations.create para consultas. Rotas internas não aceitam perfis/sessões de parceiro.

## Segunda etapa: consulta de antecipação FGTS

- Habilitação FGTS independente de CLT, por tenant/promotora/ambiente; inicialmente desativada inclusive para conexões já existentes.
- Painel dentro de Simulações → FGTS, sem abrir outra tela, visível somente com conexão habilitada. Reutiliza autenticação e token já implementados.
- POST /v3/operacoes/fgts/simulacao/agrupamento com cpf e cdc=false; consulta todas as tabelas válidas retornadas nas conexões habilitadas.
- POST /v3/operacoes/fgts/simulacao uma vez por tabela, com cpf, cdc=false e tabelaId obtido no retorno autenticado. Contexto criptografado de 15 minutos vincula tabela, CPF, usuário, empresa e conexão; IDs enviados pelo navegador não substituem a tabela de origem.
- Cada consulta é uma requisição independente, com tempo limite e progresso. Falhas não interrompem as demais tabelas. É possível interromper e retomar apenas pendentes/falhas; resultados concluídos são preservados.
- HTTP 429 respeita Retry-After, com até duas esperas automáticas limitadas a 120 segundos cada; depois a falha fica registrada para retomada manual. Não existe repetição automática de contratação.
- Retornos incluem valorLiquido, saldoTotal, prazo e parcelas com dataRepasse/valor. Mostra valores BRL e **saques antecipados**, sem tratar o prazo como parcelas mensais ou inventar uma parcela fixa. Ordenação por valor liberado, sem afirmar que a comparação está completa quando há falhas/tabelas inconsistentes.
- Não utiliza rentabilidade como taxa do cliente; utiliza taxaJuros da tabela. Tabela solicitada e id da resposta de simulação são preservados separadamente, pois os exemplos recebidos não garantem igualdade desses IDs.
- Não permite CDC, contratação via POST /v2/operacoes/fgts, gravação de proposta, persistência de oferta selecionada ou sincronização nesta etapa.
- Contratos FGTS extraídos do material enviado pelo usuário (etapas 01 e 02, incluindo respostas). Sem chamada bancária real pela implementação.

## Contratos conferidos no MCP

### Consulta de dados INSS (sem simulação Presença)

- Endpoints confirmados no Swagger: GET /v2/consultas/inss/{cpf}/beneficios e GET /v2/consultas/inss/{cpf}/beneficio/{beneficio}/detalhe. Os contratos de resposta desta consulta foram fornecidos pelo usuário; exemplos pessoais não foram incorporados ao código/testes.
- Habilitação própria `inssLookupEnabled`, desligada por padrão, independente de CLT/FGTS. Credenciais e token reutilizados somente na mesma conexão da empresa/promotora/ambiente.
- No formulário INSS: buscar pelo CPF → selecionar benefício → consultar detalhes → confirmar preenchimento. Dados disponíveis preenchem nome, nascimento, benefício, espécie, renda, data de concessão e UF. Campos continuam editáveis e valores ausentes não apagam dados manuais.
- Margem residual, de cartão e de cartão benefício são exibidas separadamente. Apenas no Novo, ação explícita permite usar margem residual positiva como parcela desejada. A margem não é tratada como renda nem aprovação de crédito.
- Conta/agência de pagamento do benefício não são reutilizadas como conta de crédito. Campos bancários não são devolvidos pelo DTO da consulta.
- Contexto criptografado vincula usuário, empresa, CPF, benefício e conexão por 15 minutos. Divergência de CPF/benefício no detalhe é rejeitada; sem fallback para outra conexão. CPF fica no corpo da requisição interna, não na URL do navegador. Nenhum resultado persiste automaticamente cadastro de cliente/proposta.
- Esta etapa não libera o endpoint v5 de ofertas INSS nem originação; a lacuna da resposta de simulação INSS continua registrada abaixo.

Fonte: https://mcp.soupresenca.com.br/mcp (`presenca-docs`), ferramentas list_products e get_product_flow, produto clt. Consultado em 15/10/2026. MCP fornece documentação; não é utilizado pelo runtime da aplicação.

Host confirmado: https://presenca-bank-api.azurewebsites.net

| Etapa | Método / endpoint | Contrato utilizado |
| --- | --- | --- |
| Autenticação | POST /login | JSON login/senha → token + expireAt; Bearer somente no servidor |
| Consentimento | POST /consultas/termo-inss | cpf/nome/telefone/produtoId=28 → autorizacaoId + shortUrl em sign.presen.ca |
| Vínculos | POST /v3/operacoes/consignado-privado/consultar-vinculos | cpf → id[]; modo síncrono, sem opt-in de webhook |
| Margem | POST /v3/operacoes/consignado-privado/consultar-margem | cpf/matricula/cnpj → margem e dados do tomador |
| Ofertas | POST /v6/operacoes/simulacao/disponiveis | produtoId=28, valorSolicitado=0, quantidadeParcelas=0, parcela desejada; endereço em strings vazias e dados bancários null |

No CLT, v6 é a versão atual; v5 é legada. Isso não implica alteração de versão nos outros produtos. Elegibilidade do vínculo indica vínculo ativo, não aprovação de crédito. A informação de assinatura fornecida pelo operador não é tratada como comprovação técnica de consentimento: o banco deve autorizar as consultas seguintes.

## Limites e pendências explícitas

- Não validado com credenciais/sessões reais, nem realizado consentimento ou consulta de cliente pela equipe de implementação. Testes automatizados usam fetch simulado e banco em memória.
- Homologação: endereço antigo deixou de autenticar segundo relato do usuário. O MCP lista o host atual acima, sem confirmar servidor atual de homologação. Credenciais de homologação podem ser salvas desativadas; chamadas bloqueadas. Não há fallback para produção.
- Sem originação, assinatura automática, cancelamento, contratação, documentos, seleção persistente de oferta, vínculo com identificador externo, sincronização de status/valores ou webhook nesta etapa. Portanto não é integração bancária completa.
- Ofertas INSS do Presença não ativadas: o próprio MCP informa que o exemplo de retorno da simulação foi inferido de outro produto. A consulta de benefícios/detalhes descrita acima está implementada com habilitação própria. SIAPE e Hapvida permanecem para próximas etapas.
- Grupos USUÁRIOS, TABELAS (administração), PARCEIROS, Permissões, DashboardsV2 e CADASTRO permanecem excluídos. Consulta de ofertas CLT usa exclusivamente o endpoint de simulação, sem importar cadastros administrativos do banco.
- O endpoint de assinatura de termo próprio não foi implementado. Nenhum SMS ou aceite automático é enviado pela aplicação; a geração de termo segue o comportamento do endpoint do banco.
- Falhas retornam HTTP e orientação genérica, sem repassar mensagens brutas que possam expor dados pessoais/credenciais. Diagnóstico detalhado de códigos poderá ser adicionado com catálogo confirmado.
- Sem migrations, seeds, testes em produção ou alteração de regras financeiras existentes.

## Verificação local

Rodada de dados INSS: **35 testes aprovados em oito arquivos** — presenca_inss_lookup, presenca_inss_lookup_ui, presenca_inss_prefill, presenca_api, presenca_ui, presenca_fgts, presenca_fgts_ui e ui_simulations_operational. O teste de preenchimento usa o formulário real com transporte simulado; verifica nascimento, benefício, espécie, nome, aplicação explícita de margem em BRL e edição posterior. Typecheck, build local e diff aprovados, mantendo o aviso de chunks acima de 500 kB. Consulta com credenciais e cliente reais não executada/não validada.

Rodada FGTS: tests/presenca_fgts.test.ts, tests/presenca_fgts_ui.test.tsx, tests/presenca_api.test.ts, tests/presenca_ui.test.tsx e tests/ui_simulations_operational.test.tsx: **27 testes aprovados em cinco arquivos**. Cobertura de tabelas múltiplas, CPF, ativação independente, preservação de configuração, isolamento de tenant/usuário, contexto adulterado/vencido, conexão alterada, parcelas anuais, valores inválidos/negativos, retomada de falhas, interrupção e Retry-After. Typecheck, build local e diff aprovados; build mantém aviso de chunks acima de 500 kB. Fluxo bancário real FGTS não validado.

Rodada inicial CLT (histórico): tests/presenca_api.test.ts, tests/presenca_ui.test.tsx, tests/parana_clt.test.ts, tests/parana_clt_ui.test.tsx, tests/ui_simulations_operational.test.tsx, tests/happy_embedded.test.tsx e tests/brl_input.test.tsx. Resultado naquela entrega: 38 testes aprovados em sete arquivos, com reexecução dos então 12 testes específicos Presença.

`npm run lint` (tsc --noEmit): aprovado. `npm run build`: aprovado (Prisma generate, Vite e esbuild), com aviso de chunks acima de 500 kB. `git diff --check`: aprovado. Diff revisado sem alterações em Prisma, migrations ou regras financeiras existentes. O build não executa migrations. A verificação funcional com o banco continua pendente.

Conferência autorizada pendente: cadastrar credenciais de uma conexão habilitada, testar autenticação, realizar o consentimento com cliente autorizado, consultar seus vínculos/margem e comparar ofertas com o portal Presença. Nunca interpretar HTTP 200 isolado como aprovação.
