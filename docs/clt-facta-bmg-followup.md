# Complemento CLT — FACTA e BMG

Base publicada: `5d617985c897947b8e95d1b5ce978491bbd4043a`. Trabalho na main, sem PR, bancos operacionais, chamadas financeiras reais, migrations, credenciais ou alterações Oracle.

## FACTA — causas comprovadas no código

1. O catch compartilhado identificava a instituição pela modalidade CLT. O adapter e o apresentador agora mantêm FACTA como identidade operacional, inclusive em erros e históricos legados.
2. O reconhecimento de autorização ausente exigia uma barra antes do nome do endpoint. A resposta documentada usa o nome entre chaves; era tratada como falha técnica em vez de autorização expirada. O reconhecimento agora aceita esse formato, sem confundi-lo com HTTP 401/403 ou falha 5xx.
3. O refresh não explicitava a autorização comprovada pelos dados oficiais do trabalhador. Agora publica AUTHORIZED apenas depois da validação da resposta e do CPF do vínculo. Falta de vínculo ou margem não vira oferta ou autorização presumida.
4. A ação explícita AUTHORIZE agora lê a autorização existente primeiro. Uma resposta válida retorna vínculo/margem sem novo SMS. Apenas ausência/expiração reconhecida pode levar à solicitação; erros técnicos não autorizam esse envio. GETs continuam com no máximo uma renovação de OAuth após 401, sem replay de POST.
5. Erros preservam HTTP, endpoint sem query e classificação: autenticação, indisponibilidade, resposta inválida, recusa ou erro de integração. A virada de folha é indisponibilidade, não autorização negada. A interface compacta mostra a identificação e o motivo específico sanitizado.

Contrato confirmado: GET /gera-token com Basic, consultas Bearer; GET /consignado-trabalhador/autoriza-consulta para autorização/vínculos/margem; POST /solicita-autorizacao-consulta com formulário e averbador 10010 para CLT; operações disponíveis com averbador 10010 e convênio 3. O caminho INSS continua distinto. Não se comprovou a causa única do incidente de produção, pois não foram consultadas credenciais, dados ou respostas operacionais nesta execução.

Fontes oficiais consultadas:
- https://webservice.facta.com.br/documentacao/assets/Manual-do-WebService-FACTA-v2.0-CONSULTA-DADOS-TRABALHADOR.pdf
- https://webservice.facta.com.br/documentacao/assets/Manual-do-WebService-FACTA-v9.0-CREDITO-TRABALHADOR.pdf

## BMG — causas, fluxo e limites

O botão sumia durante WAITING_OTP e não havia renovação explícita após expiração. O endpoint nativo de envio também não tinha a reserva distribuída utilizada pelo coordenador, permitindo cliques concorrentes duplicados.

O contrato fornecido `C:/Users/kauai/Downloads/api_parceiros_consignado_1.yaml` documenta POST /v1/sms/otp para gerar um código/verificationToken, cinco minutos de validade, até três tentativas e geração de um novo código após esgotamento. POST /v1/sms/validar fornece session_token, com validade de trinta minutos. Não foi encontrado endpoint bancário separado de reenvio nem cooldown bancário específico além desse ciclo.

- Reenviar SMS é ação explícita com confirmação do operador de que o cliente autorizou o contato. Usa o mesmo endpoint bancário de geração, apenas após expiração ou três tentativas. Um OTP ainda válido é recuperado sem novo envio.
- Reserva existente por tenant/promotora/ator/cliente/ciclo impede duplicações entre instâncias. UNKNOWN não é liberado automaticamente. A chave histórica de solicitação foi preservada.
- Tentativas de validação são contadas por CAS no armazenamento cifrado existente. O máximo de três vem do contrato. A quota local de cinco solicitações por quinze minutos é proteção do Sentinel, não um limite atribuído ao BMG.
- Rotas internas autenticadas: POST /api/integrations/bmg/customer/resend-otp e /authorization-status. Não são novos endpoints bancários, não recebem tenant/ator confiáveis do body e não retornam tokens.
- O cartão distingue espera, expiração, limite e envio incerto. Faz acompanhamento somente de leitura a cada trinta segundos enquanto está visível; não reenvia nem valida código automaticamente. A resposta do envio não concede consentimento.
- Somente session_token da validação oficial permite GET /v1/consignado-privado/elegibilidade. A resposta documentada fornece CPF, elegível e mensagem, sem um campo de margem monetária CLT. O Sentinel não inventa margem a partir das ofertas. Simulações elegíveis continuam no serviço existente.
- Uma incerteza explicitamente identificada como pedido SMS pode ser reconciliada por autorização/eligibilidade oficial. Uma simulação financeira incerta continua bloqueada.

## Testes e limites da validação

Regressões focadas exercitam HTTP Express, envio/renovação, expiração, três tentativas, CAS, repetição de cliques, quota, tenant/ator, autorização existente FACTA, identificação FACTA, falhas HTTP 403/503 e indisponibilidade com HTTP 200, margem, atualização da interface e regressão V8. APIs bancárias e persistência são mocks/injeção serializada; não houve homologação bancária real nem uso de clientes operacionais.

A regressão legada `tests/facta_simulations.test.tsx` contém onze falhas INSS anteriores: origem ausente na portabilidade e incompatibilidade com a faixa de taxa da política atual. Foram reproduzidas com o método INSS extraído de git HEAD e sua igualdade ao método de trabalho verificada, desconsiderando apenas finais de linha. Os onze nomes/erros se repetiram. Evidência local sanitizada: `%LOCALAPPDATA%/SentinelConsig/facta-inss-baseline.log`. O teste CLT antigo foi atualizado para exigir leitura antes do pedido; os testes INSS não foram afrouxados. A suíte inteira não deve ser apresentada como aprovada.

Validação focada: 204 testes distintos aprovados em onze arquivos (203 no conjunto inicial e um caso adicional de apresentação, com os dois arquivos afetados reexecutados: 25/25). A regressão legada teve 33 aprovados e onze falhas INSS reproduzidas na base publicada. TypeScript/lint aprovado (tsc --noEmit). Build aprovado, com aviso de chunks maiores que 500 kB; git diff --check aprovado. Artefatos temporários de baseline ficaram fora do repositório e não entram no commit.

## Pendências consolidadas e reversão

FACTA/BMG: homologar com caso e contato autorizados, permissões comerciais, conectividade e respostas reais. Não declarar entrega efetiva do SMS apenas por retorno da API. Condições de reenvio durante um OTP válido dependem de confirmação adicional BMG e permanecem bloqueadas.

VCTEX/V8: mantidos os commits anteriores e suas limitações, descritas em docs/clt-final-pricing-review.md e docs/v8-clt-postman-contract.md. Nenhum adapter ou transporte VCTEX/V8 foi alterado neste complemento. A publicação não resolve nem oculta as onze falhas históricas INSS.

Push normal na main após as verificações; não consultar nem aguardar READY da Vercel. Reversão por git revert do commit, mantendo histórico, sessões e reservas de idempotência. Nenhuma mudança de schema é necessária.
