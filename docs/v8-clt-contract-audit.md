# V8 DIGITAL CLT — auditoria completa do contrato

Data: 24/10/2026. Branch: `codex/clt-facta-v8-fix`; ponto de partida `193e7c8f278296add790703e17b3274048923af8`. A revisão anterior foi relida, mas as conclusões abaixo resultam da leitura atual das páginas oficiais completas e do código. **Parecer: BLOQUEADO.** Há correções locais comprovadas, mas o material público ainda não fecha o contrato necessário à homologação integral.

## 1. Método, fontes e limites

Foram lidas as 11 páginas CLT encontradas nos links da página indicada pelo usuário. O leitor web inicialmente não conseguiu abri-la; foi usado HTTPS público direto, com resposta 200 em todas as páginas, e parsing do HTML sem executar scripts. O conector documental V8 foi usado como índice complementar, não como única fonte. Nenhum endpoint bancário autenticado foi consultado. Não foram lidas credenciais locais nem usados clientes reais como fixtures.

O inventário com URLs, títulos, âncoras e SHA-256 do HTML está em `v8-clt-contract-sources.json`. Trechos de exemplos públicos foram sanitizados nas evidências locais, fora do Git; nomes/documentos desses exemplos não foram reutilizados nos testes. Um hash documenta o conteúdo consultado, não certifica estabilidade futura do contrato.

Fontes oficiais:

- [S1 — Visão geral][S1]
- [S2 — Autenticação CLT][S2]
- [S3 — Webhooks CLT][S3]
- [S4 — Consentimento][S4]
- [S5 — Configurações, pré-cálculo e simulação][S5]
- [S6 — Criação da proposta][S6]
- [S7 — Listagem e detalhe de operações][S7]
- [S8 — Pendências][S8]
- [S9 — Cancelamento][S9]
- [S10 — Status e webhooks][S10]
- [S11 — Checklist][S11]

“Documentado” neste relatório significa que um campo, endpoint ou comportamento está publicado na página apontada. Não significa chamada testada, habilitação da conta, schema completo ou confirmação de obrigatoriedade quando a página não a declara.

## 2. Respostas às quatro pendências

| Pendência | Conclusão comprovada | Informação ainda ausente |
| --- | --- | --- |
| A — juros de 1,8% a.m. | Configurações descrevem `monthly_interest_rate` como string; a simulação usa number. A descrição informa periodicidade mensal. | Nenhum exemplo CLT não nulo define `1.8` versus `0.018`, nem confirma escalas iguais, juros nominais/efetivos ou arredondamento. **Não resolvida.** [Configurações][S5config] e [resultado][S5response]. |
| B — pré-cálculo | Há POST em host Azure, com `consult_id` e `config_id`; a página orienta executá-lo entre configurações e simulação final. | Não há schema autenticado de sucesso, identificador resultante, validade nem regra explícita de rejeição do POST final sem essa etapa. O checklist a omite. **A ordem recomendada é clara; a obrigatoriedade técnica não está confirmada.** [Endpoint][S5pre], [uso][S5use], [checklist][S11]. |
| C — dinheiro e campo inativo | O webhook exemplifica margem como string decimal `350.00`; a listagem de operações contém decimais com ponto. O payload de simulação mostra ambos os valores financeiros como number, com zero no exemplo genérico. | As páginas CLT não declaram explicitamente BRL/reais versus centavos nem a regra de omitir, null ou zero para o campo inativo. Um exemplo com todos os valores zerados não resolve essa semântica. **Formato decimal documentado; unidade e regra condicional não confirmadas.** [Webhook][S3], [listagem][S7], [payload][S5body]. |
| D — consentimento | Gerar termo, guardar id, apresentar autorização ao trabalhador, registrar aceite legítimo, acompanhar status e aguardar SUCCESS/margem antes de simular. | O aceite não tem resposta estruturada; `consult_id` aparece no caminho e novamente na lista de parâmetros, sem esclarecer duplicação no body. Faltam evidências/timestamps de validade e regras completas de revogação. O Sentinel ainda não implementa a jornada de novo termo/aceite. **Jornada documental identificada; implementação completa permanece pendente.** [Termo][S4], [status][S10]. |

A escala descrita na documentação FGTS não foi aplicada ao CLT. O código continua omitindo a taxa normalizada, em vez de exibir um percentual por suposição.

## 3. Fluxo completo e sequência

1. Obter credenciais e confirmar o host de autenticação da conta/ambiente; gerar token OAuth. [S2]
2. Registrar callbacks de consulta/margem e operação; responder ao teste de registro com 2xx. É o preparo recomendado da integração completa; não há prova publicada de que a ausência de callback cause rejeição síncrona de toda simulação. [S1], [S3], [S11]
3. Se não existe consulta autorizada utilizável, gerar termo com os dados legítimos do trabalhador/signatário e guardar seu `id`. A criação do termo não equivale a aceite. [S4]
4. Apresentar o texto de autorização ao trabalhador e capturar sua manifestação real; somente então registrar autorização. Não deduzir aceite da ação do operador nem fabricar dados do dispositivo do trabalhador. [S4]
5. Acompanhar consulta por GET e/ou webhook. WAITING_CONSENT exige aceite; CONSENT_APPROVED ainda não equivale a margem concluída; WAITING_CONSULT e WAITING_CREDIT_ANALYSIS permanecem pendentes. FAILED e REJECTED interrompem a continuidade correspondente. Apenas SUCCESS com margem permite avançar segundo a referência oficial. [S4], [S10]
6. Consultar configurações, escolher `config_id` e prazo disponível. [S5config]
7. Executar pré-cálculo na posição indicada pelo guia, depois de esclarecer seu contrato de sucesso/host/obrigatoriedade com a V8. Não tratar a omissão do checklist como autorização para dispensá-lo. [S5pre][S5use]
8. Solicitar a simulação completa, guardar `id_simulation` e apresentar somente valores/custos cuja interpretação esteja confirmada. [S5body][S5response]
9. Havendo contratação autorizada em outra etapa, criar operação com `simulation_id` e guardar `id`/`formalization_url`. Depois acompanhar status e tratar pendências/cancelamento quando cabível. Essas operações não foram implementadas nem executadas nesta auditoria. [S6], [S7], [S8], [S9]

## 4. Endpoints, métodos e autenticação

`BFF` abaixo significa `https://bff.v8sistema.com`. Nas chamadas bancárias autenticadas, o token deve ir em `Authorization: Bearer <token>`. JSON é o formato de troca; `Content-Type: application/json` é usado pelo adaptador para POST JSON. Não há lista geral completa de headers obrigatórios por operação nas páginas CLT; não foram inventados headers de IP, assinatura ou idempotência. `Accept: application/json` é escolha do cliente, não exigência expressa do contrato. [S1], [S2], [S5]

| Etapa | Método e destino publicado | Corpo/query e retorno | Fonte |
| --- | --- | --- | --- |
| Token | POST `/oauth/token`; exemplo CLT usa host `api.v8digital.com` | Form-urlencoded; token Bearer, expires_in, scope | [S2] |
| Callback margem | POST BFF `/user/webhook/private-consignment/consult` | Campo `url`; teste e confirmação por eventos | [S3] |
| Callback operação | POST BFF `/user/webhook/private-consignment/operation` | Campo `url`; eventos created/updated | [S3] |
| Gerar termo | POST BFF `/private-consignment/consult` | Dados de trabalhador/signatário; retorna `id`, HTTP 200 | [S4][S4create] |
| Listar termos/margem | GET BFF `/private-consignment/consult` | Datas/paginação/provider e filtros; `pages` + `data[]`, HTTP 200 | [S4][S4list] |
| Autorizar | POST BFF `/private-consignment/consult/{consult_id}/authorize` | Identificador/dispositivo; sucesso descrito apenas em texto, HTTP 200 | [S4][S4authorize] |
| Configurações | GET BFF `/private-consignment/simulation/configs` | Sem query obrigatória publicada; `configs[]`, HTTP 200 | [S5][S5config] |
| Pré-cálculo | POST `https://v2-bff-prod-front.yellowisland-b252a8a0.eastus.azurecontainerapps.io/private-consignment/simulation/pre-calculate-installments` | `consult_id`, `config_id`; sucesso sem schema confirmado | [S5][S5pre] |
| Simular | POST BFF `/private-consignment/simulation` | Seis campos descritos abaixo; HTTP 200 | [S5][S5body] |
| Criar proposta | POST BFF `/private-consignment/operation` | Borrower + simulation_id; retorna id/formalization_url | [S6] |
| Listar/detalhar | GET BFF `/private-consignment/operation`, GET `.../{idOperation}` | Datas/página/provider na lista; dados e status na resposta | [S7] |
| Corrigir pagamento | PATCH BFF `/private-consignment/operation/{idOperation}/pendency/payment-data` | `bank` com dados PIX | [S8] |
| Upload | POST BFF `/file/upload/private_consignment` | Formatos PDF/JPEG/PNG/JPG; resposta key/file_name; nome do campo multipart não publicado | [S8] |
| Reapresentar documentos | PATCH BFF `/private-consignment/operation/{idOperation}/pendency/documents` | `documents[]` com type/side/key | [S8] |
| Cancelar | POST BFF `/private-consignment/operation/{idOperation}/cancel` | cancel_reason, cancel_description condicional, provider QI | [S9] |

### 4.1 Token e ambientes

Campos expressamente requeridos: `grant_type=password`, `username`, `password`, `audience`, `scope=offline_access`, `client_id`. `Content-Type: application/x-www-form-urlencoded`. Não usar JSON para esse token. Resposta de exemplo: `access_token`, `token_type=Bearer`, `expires_in=86400`, `scope=offline_access`; 86400 é exemplo, não validade universal. [S2]

**Divergência nova:** o exemplo CLT usa `Host: api.v8digital.com`; `V8BankService` utiliza `https://auth.v8sistema.com/oauth/token`. A autenticação de outro produto diz que o host é fornecido com as credenciais. O guia CLT não esclarece se o host do exemplo é atual, alternativo ou ilustrativo. Não foi mudado o serviço compartilhado para evitar afetar outras modalidades sem confirmação. [S2]

Não foi encontrada matriz CLT de produção/homologação, URLs de sandbox, credenciais de teste ou provider alternativo. O host Azure contém “prod” no nome, o que não prova política formal de ambientes. A integração preserva o bloqueio de homologação sem URL confirmada; não faz fallback silencioso para produção.

### 4.2 Criar termo — inventário completo publicado

`borrowerDocumentNumber: string`, `gender: male|female`, `birthDate: string`, `signerName: string`, `signerEmail: string`, `signerPhone: {phoneNumber, countryCode, areaCode}`, `provider: QI`. O exemplo de data usa YYYY-MM-DD. A página não marca individualmente todos esses campos como required/opcionais nem documenta signatário substituto e suas condições. Não é seguro tratar campos sem anotação como opcionais. [S4create]

Exemplo sintético consolidado dos campos descritos, **não testado contra o banco**:

```json
{
  "borrowerDocumentNumber": "00000000000",
  "gender": "male",
  "birthDate": "1990-01-01",
  "signerName": "Pessoa Sintetica",
  "signerEmail": "synthetic@example.invalid",
  "signerPhone": { "phoneNumber": "999999999", "countryCode": "55", "areaCode": "11" },
  "provider": "QI"
}
```

O CPF acima é deliberadamente inválido, destinado apenas à descrição de formato, nunca a chamada real. **Inconsistência:** o JSON original omite `provider` e contém vírgula final; a descrição exige QI. O exemplo consolidado segue a lista de campos e não certifica a validação do servidor. O retorno publicado é `{ "id": "string" }`; outra seção descreve esse id como UUID. [S4create]

### 4.3 Acompanhar consulta e registrar aceite

GET: `startDate`/`endDate` ISO 8601, `limit` inteiro >=1, `page` inteiro >=1 e `provider=QI` são marcados obrigatórios. `search` e `status` são opcionais. O limite 50 do Sentinel é escolha local, não máximo documentado. [S4list]

Resposta: `pages: {current, hasNext, hasPrev, limit, total, totalPages}` e `data[]: {id, partnerId, documentNumber, availableMarginValue, status, description, name}`. A lista identifica consulta/consentimento; não publica CNPJ, matrícula ou uma lista de vínculos selecionáveis. `partnerId` é identificador bancário, não o tenantId/promoterId local nem matrícula. Não inventar um vínculo FACTA para esse retorno. [S4list]

Autorizar: URL contém `consult_id`; a seção de parâmetros lista `consult_id`, `operationalSystem` (grafia oficial), `deviceModel`, `deviceName`, `deviceType=mobile|desktop|tablet`. Ela não define JSON canônico nem esclarece se consult_id também deve ir no body. Não publica schema de sucesso, audit receipt, id de versão do texto ou data de expiração. [S4authorize]

O texto-modelo menciona consulta por 30 dias e pedido em até 45 dias após assinatura. Isso não fornece algoritmo de validade do recurso HTTP. Não igualar esses períodos a createdAt, ao filtro startDate nem a uma validade de 30 dias do UUID. A assinatura/autorização pode ocorrer depois da criação do termo; a listagem nem sequer inclui esses timestamps no schema publicado. [S4authorize]

### 4.4 Margem e eventos

Evento `private.consignment.consult.updated`: `timestamp`, `consultId`, `status`, `availableMarginValue`, `admissionDateMonthsDifference`, `simulationLimit`. O exemplo usa margem `"350.00"`. O documento diz que margem/meses/limites ficam null fora de SUCCESS. [S3]

`simulationLimit`: `monthMin`/`monthMax` representam faixa de meses; `installmentsMin`/`installmentsMax`, limites de parcelas; `valueMin`/`valueMax`, valores da operação. Não substituir prazo por tempo de vínculo, nem inferir que esse objeto também virá no GET. O adaptador atual não recebe/persiste esses callbacks. Só usa prazos de configs e margem da listagem; limites adicionais do webhook ainda não entram em sua validação. [S3]

Os callbacks de registro usam `webhook.test` e `webhook.registered`; a aplicação deve responder 2xx. Não está descrita assinatura/verificação criptográfica para eventos CLT. Não seria seguro criar receptor que confiasse apenas em consultId ou CPF do payload para decidir tenant. [S3], [S10]

**Exemplo inconsistente:** a seção intitulada falha de margem contém evento de saldo com outro provider, incompatível com o restante do fluxo CLT. Não foi reutilizado como contrato de erro CLT. [S3]

### 4.5 Configurações e pré-cálculo

GET configs: `configs[]` com `id`, `slug`, `monthly_interest_rate:string`, `limit_days_to_disburse:number`, `number_of_installments:string[]`, `created_at`, `updated_at`. O prazo vem da configuração; o guia não publica máximo universal de 120 nem todos os critérios de elegibilidade. `limit_days_to_disburse` não é descrito como TTL do pré-cálculo. [S5config]

Payload completo publicado para pré-cálculo:

```json
{
  "consult_id": "00000000-0000-4000-8000-000000000001",
  "config_id": "00000000-0000-4000-8000-000000000003"
}
```

Há método, URL, JWT e esses dois identificadores. Não há prazo, parcela ou valor líquido no payload publicado. Não há schema de resposta de sucesso; a própria página condiciona seu mapeamento à validação autenticada. A evidência 401 sem Authorization é uma observação da documentação, **não chamada executada nesta auditoria**. Não autoriza inferir resposta, cálculo, validade ou estado persistido. [S5pre][S5use]

### 4.6 Simulação final

Os seis campos publicados são:

```json
{
  "consult_id": "00000000-0000-4000-8000-000000000001",
  "config_id": "00000000-0000-4000-8000-000000000003",
  "installment_face_value": 1423.98,
  "disbursed_amount": 0,
  "number_of_installments": 24,
  "provider": "QI"
}
```

Esse exemplo sintético mostra o **comportamento atual do adaptador**. Os nomes, tipos e significados são documentados; zero como regra para o campo inativo continua sendo hipótese não confirmada. No modo líquido o código inverte os campos, também sem confirmação dessa condição pelo guia. Não foram inventadas opções de null/omissão. Não há flags required individuais, faixas ou catálogo de erros de validação desse POST. [S5body]

Inventário completo do exemplo de resposta publicado: `id_simulation`, `partner_id`, `number_of_installments`, `monthly_interest_rate`, `disbursement_amount`, `installment_value`, `operation_amount`, `issue_amount`, `disbursed_issue_amount`; `disbursement_option` contém `iof_amount`, `total_pre_fixed_amount`, `cet`, `contract_fee_amount`, `disbursement_date`, `first_due_date`, `issue_amount`, `disbursed_issue_amount`, `assignment_amount`, `final_disbursement_amount` e `installments[]`. Cada parcela contém `installment_number`, `calendar_days`, `workdays`, `business_due_date`, `due_date`, `due_principal`, `has_interest`, `post_fixed_amount`, `pre_fixed_amount`, `tax_amount`, `total_amount`, `principal_amortization_amount`. [S5response]

Diferenças internas do guia: a descrição cita `first_installment_date` e IOF string no topo; o exemplo usa `disbursement_option.first_due_date` e IOF number aninhado. Não há CET anual no exemplo, apesar da apresentação da página o mencionar. O Sentinel não deve fabricar essas propriedades nem converter CET/juros sem escala confirmada. Atualmente só mapeia líquido, emissão/bruto, parcela, prazo e simulationId; custos e datas ficam incompletos. [S5response]

### 4.7 Operação, acompanhamento, pendências e cancelamento

POST operação: o exemplo raiz contém `simulation_id` e `borrower`. Em borrower: `name`, `email`, `phone:{area_code,country_code,number}`, `political_exposition`, `address:{city,state,number,street,complement,postal_code,neighborhood}`, `birth_date`, `mother_name`, `nationality`, `document_issuer`, `gender`, `person_type`, `marital_status`, `individual_document_number`, `document_identification_date`, `document_identification_type`, `document_identification_number`, `bank:{transfer_method,pix_key,pix_key_type}`. Gênero male/female, pessoa natural, documento rg/cnh; estado civil enum e formatos de telefone/CEP estão descritos. Complemento é explicitamente opcional; demais required individuais não estão inteiramente definidos. [S6]

O texto descreve `provider`, mas o JSON o omite; também há vírgula final e parêntese sobrando na URL. Precisamos de exemplo canônico válido, em vez de deduzir hierarquia/obrigatoriedade. Retorno 200: `id`, `formalization_url`. Erro 400 documentado para esta operação: `type=proposal_not_eligible`, `status`, `title`, `detail`, `instance`. Não assumir que isso é o catálogo do POST de simulação. [S6]

GET operações: `startDate`, `endDate`, `limit`, `page`, `provider=QI`; a página mostra objeto de operação, sem envelope claro da lista. Detalhe GET usa idOperation. Campos descrevem valores, status, contratos, borrower, endereços, dados bancários e histórico. Não registrar PII desses objetos em memória técnica. Há divergência entre `history` descrito como string e array no exemplo. [S7]

Pendência de pagamento: `bank:{transfer_method:pix,pix_key,pix_key_type}`; titularidade deve corresponder ao tomador. Tipo aleatório aparece como `random` nesta página, enquanto criação usa descrição textual de chave aleatória: confirmar enum canônico. Upload retorna lista `{key,file_name}`; documentos aceitos PDF/JPEG/PNG/JPG. Reapresentação: `documents:[{type,side,key}]`, side front/back/both. O guia associa CNH/OUTROS/RG a códigos, mas mistura descrição e tipo: confirmar schema antes de implementar. [S8]

Cancelamento: `cancel_reason`, `provider=QI`; `cancel_description` somente quando motivo `invalid_data:other`. O catálogo completo de motivos e a resposta não estão publicados nessa página. Contratos aguardando pagamento ou pagos não devem ser cancelados segundo o texto. Nenhuma chamada de criação/correção/cancelamento foi implementada nesta etapa. [S9]

## 5. Comparativo com o código

| Área | Evidência no Sentinel | Avaliação |
| --- | --- | --- |
| Token | `v8BankService.ts`, `token` | Form-urlencoded/password/scope, token cache e criptografia por tenant/promotora corretos em estrutura; host diverge do exemplo CLT. Não alterado por ser compartilhado. |
| Isolamento | `config`, chave tenant+promotora, AAD; `V8CltSimulationService.run` | Consulta de configurações restrita ao tenant, promotoras disponíveis e contexto vigente; CPF exato e consulta selecionada são revalidados. Mocks passaram; não equivalem a validação real do provedor. |
| Consentimento novo | `run`, ação AUTHORIZE | Retorna AUTHORIZATION_REQUIRED sem chamadas. Seguro contra aceite implícito, mas não implementa criar termo, apresentar texto e registrar aceite legítimo. |
| GET consulta | `run`, listagem e paginação | Método/campos coerentes com guia. Janela local de 30 dias pode ocultar consulta válida assinada após criação. Limite de dez páginas falha explicitamente; não usa resultado parcial silencioso. |
| Status/margem | `run`, blocos SUCCESS/FAILED/REJECTED | Não simula em pendência ou sem margem positiva. SUCCESS não resolve sozinho a validade temporal do consentimento. |
| Vínculo | Retorno DATA com v8.consultId/promoterId | Não inventa matrícula/CNPJ; o GET público não retorna vínculos por empregador. Falta definição para múltiplos vínculos da mesma pessoa na V8. |
| Configurações | `run`, GET configs | Removido query provider não listado pelo guia; usa endpoint mínimo documentado. Taxa continua omitida por escala desconhecida. |
| Dinheiro | Função local number | Corrigida: números JSON e strings decimais com ponto não passam pelo parser de milhares BRL. Preserva magnitude/precisão recebida, sem x100/÷100. Mantida compatibilidade legada para strings explicitamente com vírgula, sem usá-las como fixture oficial. |
| Pré-cálculo | `request` allowlist | Não implementado. A ordem documental pede a etapa; contrato de sucesso/necessidade técnica continua bloqueante. Não foi liberado envio de token para host Azure por tentativa e erro. |
| Simulação | `run`, POST simulation | Campos/IDs e retorno básico correspondem ao guia; política zero para campo inativo e escala monetária ainda não confirmadas. Não se declara payload integralmente homologado. |
| Resultado | `ProductSimulationService.run`, função v8 e publishRows | V8 é linha independente, preserva ofertas de outros provedores e tem seleção no fluxo interno/Portal. Sem nova configuração habilitada, pode não produzir linhas. |
| Custos/contratação | `ProductSimulationRow`, sem operação V8 | Não há CET/datas completas nem criação/sincronização de proposta V8. Guardar simulationId não equivale a ter contrato vinculado e sincronizado. |
| Erros/logs | `failure`, cltPublicMessage | Respostas públicas sanitizadas; log com códigos/HTTP e IDs técnicos, sem token/CPF/payload. permission_denied é tratado defensivamente, mas não consta no catálogo CLT público lido. |

### Por que V8 pode não aparecer ou não oferecer simulação

- Na main publicada, a funcionalidade V8 CLT permaneceu deliberadamente fora. A presença da configuração V8 não significa dispatcher CLT publicado.
- Na branch auditada, ausência de configuração tenant/promotora ou conexão desativada produz nenhuma linha V8. CLT desabilitado, credenciais incompletas e homologação sem host geram estados explicativos.
- Promotora selecionada fora do escopo, consulta estrangeira/antiga, múltiplas consultas sem escolha, ausência de consentimento, margem inválida e indisponibilidade de prazo impedem oferta.
- Habilitação de permissões da conta, host de token e contrato bancário não foram verificados em API real.
- A janela de datas é uma política de busca local, não uma validação documental de validade. Receber eventos/limites e selecionar vínculo corretamente ainda exige fechar os contratos ausentes.

## 6. Correções realizadas nesta etapa

1. `server/services/v8CltSimulationService.ts`: preservação de números JSON e strings decimais; correção de conversão indevida de `1.234` e suporte a precisão recebida maior que duas casas; endpoint configs sem parâmetro extra não descrito.
2. `tests/v8_clt_simulation.test.ts`: margem decimal coerente com webhook; casos numéricos/string com mais casas; compatibilidade localizada separada; ausência de inferência de taxa e query não documentada. Exemplos com taxa 1.8/0.018 são deliberadamente contrastantes para comprovar que nenhuma escala é presumida, não exemplos oficiais de taxa válida.
3. Este relatório e `docs/v8-clt-contract-sources.json`.

Não foram alterados FACTA, outros adaptadores, frontend, serviço V8 compartilhado, schema ou migrations. A main e as branches FACTA/rodapé foram preservadas. Não houve merge, push ou deploy.

## 7. Validação

- Suíte direcionada: **110 aprovados, zero reprovados**, incluindo **43 testes V8**, isolamento por tenant/promotora, autenticação/configuração com mocks, consentimentos, erros, paginação, retorno de ofertas e preservação das outras integrações.
- Regressão separada: **102 aprovados, 12 falhas preexistentes**. Total sem sobreposição: **212 aprovados, 12 falhas históricas, zero novas falhas**.
- As 12 falhas foram comparadas por nome e primeira linha do erro com a evidência da main: onze fixtures FACTA INSS/portabilidade e um seletor antigo CLT/FGTS. Nenhuma foi alterada para esconder falhas.
- TypeScript, build completo e diff-check aprovados. Build usa somente geração do cliente Prisma, Vite e esbuild; não aplica migrations. URL do processo de build substituída por destino sintético local sem banco disponível.
- Dados sintéticos, mocks/fetch interceptado, um worker. Nenhuma chamada bancária autenticada. **Homologação com API real: não executada.** O parser usa number JavaScript; preserva o valor recebido sem introduzir arredondamento próprio, mas não oferece aritmética decimal exata além da precisão IEEE-754.

## 8. Perguntas objetivas para a V8

1. Em CLT/QI com taxa de 1,8% a.m., quais valores exatos aparecem em monthly_interest_rate de configs e simulation? Confirmar escala de cada um, nominal/efetiva, CET mensal/anual, precisão e arredondamento com um exemplo sintético completo.
2. Pré-cálculo é obrigatório para os modos parcela e líquido? O POST final pode ser executado diretamente após SUCCESS/configuração? Qual erro sinaliza a falta dessa etapa?
3. Qual host canônico do pré-cálculo em produção/homologação e qual audience/permissão OAuth? Enviar request/response de sucesso, significado dos limites/valores, ID resultante, validade, estado persistido e condições para repetir a chamada.
4. Todos os valores financeiros e margem estão em BRL/reais, centavos ou outra unidade? Qual regra de omissão/null/zero do campo inativo, e precedência quando parcela e desembolso são positivos? Enviar exemplos de ambos os modos.
5. O token CLT deve usar api.v8digital.com, auth.v8sistema.com ou host fornecido por conta? Quais URLs/credenciais de homologação e permissões de consulta/configs/simulação?
6. Enviar schemas canônicos de criar/autorizar termo: provider obrigatório e localização, consult_id no body ou só no caminho, campos de dispositivo exigidos, prova/versão do aceite, datas de assinatura/expiração/revogação. Como verificar validade com o schema atual do GET e qual data startDate filtra?
7. Como a V8 representa múltiplos vínculos do mesmo CPF e garante o vínculo escolhido? A consulta limita por vínculo ou retorna relação adicional? Como obter simulationLimit sem depender exclusivamente do webhook, e como validar autenticidade/tenant dos eventos?
8. Confirmar divergências de IOF, datas e CET, enum PIX aleatório, envelope da listagem e catálogo de erros específico de simulação. Nenhuma dessas perguntas foi enviada a terceiros nesta etapa.

Para desbloquear: resposta oficial versionada ou contrato OpenAPI com exemplos sintéticos suficientes; depois testes de contrato atualizados e, somente com autorização, homologação da conta em ambiente isolado. Não é seguro declarar APTO PARA HOMOLOGAÇÃO integral enquanto dinheiro, taxa, autenticação e a etapa anterior ao POST final não estiverem fechados.

[S1]: https://docs.v8sistema.com/guide/crédito-privado-clt/visão-geral-do-fluxo-clt
[S2]: https://docs.v8sistema.com/guide/crédito-privado-clt/autenticação
[S3]: https://docs.v8sistema.com/guide/crédito-privado-clt/webhooks
[S4]: https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento
[S5]: https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt
[S6]: https://docs.v8sistema.com/guide/crédito-privado-clt/criação-da-proposta-crédito-clt
[S7]: https://docs.v8sistema.com/guide/crédito-privado-clt/listar-operações-crédito-clt
[S8]: https://docs.v8sistema.com/guide/crédito-privado-clt/resolvendo-pendências
[S9]: https://docs.v8sistema.com/guide/crédito-privado-clt/cancelar-operação-clt
[S10]: https://docs.v8sistema.com/guide/crédito-privado-clt/referência-de-status-e-webhooks-clt
[S11]: https://docs.v8sistema.com/guide/crédito-privado-clt/checklist-de-integração-clt
[S4create]: https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento#endpoint-para-gerar-o-termo-de-consentimento
[S4list]: https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento#endpoint-para-listar-os-termos-de-consentimento-gerados-pelo-usuário
[S4authorize]: https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento#endpoint-para-autorizar-o-termo-de-consentimento
[S5config]: https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt#endpoint-consultar-as-taxas-disponiveis
[S5pre]: https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt#endpoint-pré-calcular-parcelas
[S5use]: https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt#uso-no-fluxo
[S5body]: https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt#body-da-requisição-1
[S5response]: https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt#resposta-1
