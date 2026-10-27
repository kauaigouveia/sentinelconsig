# VCTEX CLT — implementação e habilitação controlada

Fonte: **Documentação de API VCTEX CLT, 1.0.11, 30/09/2026, 47 páginas**, fornecida pelo responsável. As 47 páginas foram extraídas e lidas; a página de autenticação foi também conferida visualmente. O PDF pessoal e as extrações locais não integram o commit.

## Limites da entrega

Código preparado para revisão, **não homologação bancária**. Nenhuma consulta de CPF, criação de termo, simulação ou contratação real foi executada. Não há migrations, schema, novas dependências ou infraestrutura contratada. As alterações CLT não concluídas em `codex/clt-consult-first` permanecem em seu checkout, fora deste pacote. Base: `396136fd6bf4e20dfa28ffb62b3a7af2cd361bc7`.

O host Oracle respondeu **404** à única requisição de conectividade `POST https://gateway.sentinelconsig.com.br/vctex`, **sem chave, credenciais ou destino bancário**. Isso não comprova a instalação da rota nem sua autenticação. Não houve login VCTEX real: a rota precisa estar instalada e as credenciais autorizadas disponíveis no backend. Não foram extraídas credenciais de produção nem alteradas configurações remotas.

## Arquitetura e fluxo

1. Central de Integrações: VCTEX por empresa/promotora ativa; credenciais AES-256-GCM com AAD incluindo tenant, conexão e chave. Metadados não devolvem CPF de login, senha ou token. Ambiente único documentado: produção; desabilitado por padrão.
2. O cadastro único fornece CPF, nome, telefone e e-mail para a VCTEX. Não envia nascimento/sexo ou parâmetros financeiros não previstos. O início não exige parcela ou prazo.
3. O backend resolve identidade exclusivamente do snapshot cifrado da execução pertencente ao usuário/empresa, após validar permissão de simulação, empresa ativa e conexão autorizada. IDs bancários fornecidos pelo navegador não são aceitos para consultar qualquer pré-operação arbitrária.
4. Toda requisição, **inclusive login**, passa pelo transporte Oracle autenticado. Sem URL/chave válidas, falha antes de `fetch`. Nunca há fallback direto. Hosts, métodos e caminhos permitidos são validados dos dois lados; sem redirecionamentos ou encaminhamento de cookies.
5. A consulta inicial por CPF é reservada no banco: **o GET pode criar uma pré-operação ao expirar a anterior**, conforme p. 4. Polling não utiliza essa rota.
6. `not_found` permite criar o termo interno uma vez, com telefone E.164 e dados reais do cadastro. O link é recuperado por listagem filtrada pelo CPF e correspondência exata de ID/CPF; só HTTPS é apresentado. O PDF afirma que esse link **não é enviado por SMS automaticamente** (p. 5). Assinatura é realizada pelo trabalhador fora do Sentinel, na URL oficial retornada.
7. Acompanhamento usa somente o ID cifrado registrado. Só `finished`, autorização vigente e dados dentro da validade permitem usar vínculos. Margens e motivos permanecem separados por vínculo. Consulta de taxas exclui ofertas inativas.
8. Depois de elegível, calcula automaticamente **uma** oferta ativa do primeiro vínculo com taxas, sem inventar valores/prazos nem multiplicar combinações. Mais vínculos/tabelas e simulação personalizada são escolhas explícitas. Seguro acompanha a oferta; prazo/parcela personalizados são validados com limites e margem antes do POST.
9. Reservas de criação/cálculo usam a tabela existente `SystemConfig`, transação/unique e CAS cifrado. Não há dependência de mutex em memória para idempotência. POSTs não são repetidos automaticamente. Respostas 4xx definitivas ficam registradas sem replay; falha de rede/5xx mantém `UNKNOWN`. Criação 409/incerta tenta reconciliar por CPF, sem novo POST de criação. Novo ciclo após expiração conhecida exige ação explícita.
10. Polling cliente sequencial de 10 até 60 segundos, interrompido no terminal, ao sair ou após falha. Não há recálculo recorrente de ofertas. Conexões múltiplas exigem seleção, sem escolher credenciais arbitrariamente.
11. Ofertas persistidas são calculadas pelo servidor e anexadas ao histórico cifrado da execução, com comparação multibancos. Fechar/trocar contexto limpa o cadastro visual, cancela leitura e invalida respostas atrasadas. Recuperação do último ID desta sessão é **explícita**, sem restauração automática de CPF. Não exclui histórico durável.

## Endpoints do contrato utilizados

Todos os caminhos abaixo usam `https://www.appvctex.com.br`, **via Oracle**:

| Método e caminho | Uso | PDF |
|---|---|---|
| POST `/api/authentication/login` | `{cpf,password}`; Bearer nas chamadas seguintes | 2–3 |
| GET `/api/consignado/pre-operation/document-number/{cpf}` | Localizar/reconciliar; tem possível efeito de criação após 24 h | 4–5 |
| POST `/api/consignado/pre-operation` | Termo interno `{worker:{name,documentNumber,email,phoneNumber}}` | 5–6 |
| GET `/api/consignado/pre-operation?documentNumber=...` | Recuperar `onboardingURL` do ID correspondente | 12–13 |
| GET `/api/consignado/pre-operation/{id}` | Estado, autorização, validade, vínculos/margens | 8–10 |
| GET `.../{id}/employment/{employmentId}/available-rates` | Ofertas ativas e limites | 15 |
| POST `.../{id}/employment/{employmentId}/simulate/full` | `{offerId,withInsurance}` | 16 |
| POST `.../{id}/employment/{employmentId}/simulate/installments` | `{offerId,installments,installmentAmount,withInsurance}` | 16 |

Rotas internas: `GET /api/integrations/vctex/connections`, `GET/PUT .../config`, `POST .../diagnostic`, `POST .../start`, `GET .../observe`, `GET .../rates`, `POST .../simulate`. Conexões usam `promoterId`; ações operacionais também usam `executionId` próprio. Configuração/diagnóstico exigem `integrations.manage`; simulação exige `simulations.create`. Sem sessão 401, sem permissão 403, execução alheia 404.

## Estados e erros

| Estado | Comportamento |
|---|---|
| `started`, `creating_authorization_term` | Aguardar geração, recuperar link quando disponível |
| `awaiting_signature` | Apresentar/copiar link; nunca inferir assinatura pelo POST |
| `signed`, `awaiting_authorization` | Acompanhar banco |
| `authorized`, `awaiting_contracts` | Consultando vínculos; não usar dados antecipadamente |
| `awaiting_validation`, `awaiting_credit_engine` | Verificando elegibilidade/crédito |
| `finished` | Validar autorização e expiração, consultar taxas, liberar cálculo |
| `authorization_failure` | Termo inválido/vencido; não calcular |
| `processing_failure` | Falha técnica terminal |
| `eligibility_denied_by_provider`, `ineligible_by_internal_policy` | Inelegível, sem cálculo |
| Estado desconhecido | Preservar estado bruto, não presumir sucesso |

Erros documentados: 400 CPF inexistente/óbito; 404 pré-operação ausente; 409 `pre_operation_already_created` e erros de termo externo; 422 `pre_operation_expired_employment`/termo excluído; 500 `internal_error`. Não transportar mensagens brutas contendo CPF. O usuário recebe status/código sanitizado. Timeout/incerteza não vira uma nova solicitação automática. O endpoint externo permanece sem ação pública no Sentinel.

## Valores financeiros

`fee` da tabela é decimal: `0.0399 → 3,99% a.m.` (p. 15). `monthlyRate` da simulação já é percentual: `3.999 → 3,999% a.m.` (p. 17). Valores originais são mantidos nos campos financeiros selecionados, sem guardar o payload pessoal completo. O comparador usa o percentual da simulação.

Valor líquido = `finalDisbursedAmount`, bruto = `issueAmount`, intermediário = `disbursedIssueAmount`, IOF = `iof`, seguro = `insuranceAmount`. Não recalcula líquido, taxa ou CET. CET anual somente de `cet` retornado; CET mensal ausente aparece como “Não informado”. Datas e indicação de seguro são preservadas. Os exemplos sintéticos não são defaults financeiros.

## Diagnóstico do login

O PDF não contém o JSON de resposta do login. O parser está isolado, aceita um único token reconhecível (`access_token`, `accessToken`, `token`, na raiz ou em `data`) e rejeita ausências/ambiguidades. Isso é compatibilidade provisória, **não confirmação documental desses nomes**. Cache de token é breve e separado por tenant/conexão/credenciais; não existe endpoint de refresh inventado. Somente GET por ID pode renovar autenticação uma vez após 401; POST e lookup por CPF não são repetidos.

O diagnóstico retorna somente HTTP e nomes de campos, mais indicação de reconhecimento pelo parser; não devolve valores, claims, comprimentos, credenciais ou mensagens bancárias. HTTP 200 no login não comprova permissão CLT. Após habilitar a Oracle, confirmar o contrato real por esse diagnóstico e atualizar os testes sem incorporar tokens. Nenhuma requisição real de trabalhador é necessária para o diagnóstico.

## Habilitação operacional — ainda não executada

1. Responsável Oracle revisa os serviços atuais e `deploy/oracle-vctex/install.sh`; executa o instalador **dedicado** somente com porta 3101 livre, diretórios/unit inexistentes e layout Nginx esperado. Não reinstalar `deploy/oracle-facta/install.sh`: isso sobrescreveria o serviço FACTA. O novo serviço liga apenas em `127.0.0.1:3101`, força saída IPv4 e adiciona só `/vctex`; não altera firewall, IP ou rotas FACTA/Daycoval. O arquivo secreto existente é lido privadamente.
2. Verificar `systemctl is-active sentinel-vctex`, `nginx -t` e que POST sem chave retorna 403. `/health` ou 404 não prova operação do novo serviço.
3. Backend autorizado: `VCTEX_GATEWAY_URL=https://gateway.sentinelconsig.com.br/vctex` e `VCTEX_GATEWAY_SECRET` com a chave interna existente, nunca `VITE_`, chat, PR ou repositório. **Nenhuma variável foi alterada nesta entrega.**
4. Na Central, selecionar empresa/promotora, abrir VCTEX, cadastrar CPF de login/senha autorizados e salvar. Confirmar ambiente produção; conexão inativa por padrão antes da configuração.
5. Executar uma vez o diagnóstico administrativo de autenticação. Registrar somente HTTP e nomes de campos. Se parser não reconhecer, adaptar ao contrato efetivamente observado, sem tentativa de consulta de trabalhador.
6. Só depois, com caso explicitamente autorizado, testar termo assinado pelo trabalhador, estados, vínculos, taxas e uma simulação limitada. Não criar operação de crédito. Nenhum desses testes bancários reais está concluído.

## Pendências e compatibilidade

- Gateway real `/vctex` e diagnóstico autenticado pendentes (404 na verificação sem chave; variáveis VCTEX/chave não disponíveis neste processo).
- Confirmar habilitação CLT da conta com a VCTEX; login não basta.
- Termo externo: PDF pp. 6–8 prevê NSU, assinatura ISO e IP real, validade de 28 dias; a allowlist comporta `/external`, mas **não há botão/rota pública para fabricar ou enviar evidência não verificada**. A entrega usa o termo interno (30 dias). Uma jornada externa exige origem verificável do documento assinado antes de ativação.
- As páginas 18–47 foram revisadas para separar formalização: criação de operação, KYC, documentos, mudança de conta, cancelamento, averbação e pagamento **não estão expostos no adapter/gateway desta entrega**. Não há contratação automática.
- Divergência futura do PDF: p. 28 menciona PATCH de conta bancária; p. 29 documenta POST `change-bank-account`. P. 25 também apresenta KYC como não exposto e enumera subestados. Não implementar essas operações por suposição.
- Timeout/criação não reconciliada exige investigação; não apaga reservas nem autoriza reenvio. Não há rotina de expurgo nova. Histórico permanece cifrado sob a política existente de retenção.
- Recuperação visual lista apenas o último ID da sessão atual; uma listagem completa de histórico pertence ao trabalho multibancos separado ainda preservado.

## Reversão

Não houve implantação remota. Reverter este commit/PR em branch própria remove a integração sem tocar schema/migrations. Não apagar configurações/histórico ou reservas em produção automaticamente. Se o serviço Oracle vier a ser instalado, parar/desabilitar **somente** `sentinel-vctex`, retirar apenas a localização `/vctex` após revisão do diff Nginx e validar `nginx -t` antes de reload. Não restaurar o arquivo Nginx inteiro sobre alterações posteriores nem remover o segredo compartilhado.

## Validação

Regressão: **269 testes aprovados, zero reprovados, em 22 arquivos**, sequenciais com `--maxWorkers=1 --no-file-parallelism`. Destes, 41 testes são de contrato/serviço/gateway VCTEX e três da interface VCTEX. Os demais cobrem cadastro/consulta sem parcela, jornada, persistência em mock, discovery, deadlines, progresso, telefone BMG, conexões por promotora, FACTA e V8. TypeScript (`npm run lint`) e `git diff --check` aprovados. Gateway Node passou em `node --check`; instalador passou em `bash -n` sem execução. Build final (`npm run build`) aprovado: Prisma Client gerado, frontend Vite e servidor esbuild compilados, sem conexão a banco (URLs sintéticas locais não operacionais). Avisos Vite de chunks grandes permanecem como limitação de empacotamento do projeto.

Testes usam exclusivamente HTTP simulado, armazenamento transacional em mock e fixtures sintéticas. Não foi executada validação VCTEX com PostgreSQL real ou APIs bancárias reais. A verificação Oracle sem chave é conectividade real; não é autenticação VCTEX nem homologação bancária. TypeScript/build não comprovam tráfego upstream real. Nenhuma migration, seed, banco operacional, merge, deploy ou alteração de credenciais foi executada.
