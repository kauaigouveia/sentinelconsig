# Presença Bank — primeira etapa: conexão e consulta CLT

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

## Contratos conferidos no MCP

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
- INSS não ativado: o próprio MCP informa que o exemplo de retorno da simulação foi inferido de outro produto. SIAPE, FGTS e Hapvida permanecem para próximas etapas.
- Grupos USUÁRIOS, TABELAS (administração), PARCEIROS, Permissões, DashboardsV2 e CADASTRO permanecem excluídos. Consulta de ofertas CLT usa exclusivamente o endpoint de simulação, sem importar cadastros administrativos do banco.
- O endpoint de assinatura de termo próprio não foi implementado. Nenhum SMS ou aceite automático é enviado pela aplicação; a geração de termo segue o comportamento do endpoint do banco.
- Falhas retornam HTTP e orientação genérica, sem repassar mensagens brutas que possam expor dados pessoais/credenciais. Diagnóstico detalhado de códigos poderá ser adicionado com catálogo confirmado.
- Sem migrations, seeds, testes em produção ou alteração de regras financeiras existentes.

## Verificação local

Suítes seguras executadas: tests/presenca_api.test.ts, tests/presenca_ui.test.tsx, tests/parana_clt.test.ts, tests/parana_clt_ui.test.tsx, tests/ui_simulations_operational.test.tsx, tests/happy_embedded.test.tsx e tests/brl_input.test.tsx. Resultado: 38 testes aprovados em sete arquivos. Após o último ajuste, os 12 testes específicos Presença foram reexecutados e aprovados.

`npm run lint` (tsc --noEmit): aprovado. `npm run build`: aprovado (Prisma generate, Vite e esbuild), com aviso de chunks acima de 500 kB. `git diff --check`: aprovado. Diff revisado sem alterações em Prisma, migrations ou regras financeiras existentes. O build não executa migrations. A verificação funcional com o banco continua pendente.

Conferência autorizada pendente: cadastrar credenciais de uma conexão habilitada, testar autenticação, realizar o consentimento com cliente autorizado, consultar seus vínculos/margem e comparar ofertas com o portal Presença. Nunca interpretar HTTP 200 isolado como aprovação.
