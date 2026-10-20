# Diagnóstico Port/Refin Nossa Fintech

A API do Sentinel consulta GET /inss/v1/rebates_parceiro e depois POST /port-refin/v1/simulation para cada tabela compatível.

O endpoint do Sentinel pode responder HTTP 200 contendo resultados individuais com status 500. Isso não representa simulação bem-sucedida. Falha global na busca de tabelas retorna HTTP 502 com o status original do provedor no corpo.

A mensagem de cada falha agora identifica a etapa e o código da tabela, quando aplicável, e aproveita os campos textuais message/detail/error do provedor, com redação de CPF, e-mail e Bearer. HTML não é exibido como diagnóstico. Os logs registram somente etapa, status e código da tabela, sem payload, token ou credenciais.

Investigação em 20/10/2026: os logs de produção mostraram respostas locais 200 às 09h34/09h35 e 502 às 09h37 (America/Bahia). Os registros antigos não continham os detalhes do provedor, portanto não permitem determinar a causa do HTTP 500 informado na tela. Não houve reprodução autenticada nesta investigação; não havia sessão de navegador conectada disponível.

Após publicar, repetir a mesma simulação e consultar os avisos [NossaFintech PortRefin]. Não trocar endpoints, tipos do payload ou tabelas por suposição; confrontar a resposta real com a documentação antes de alterar a integração. Não repetir automaticamente POSTs em erro 500.

## Formulário do Hub

O teste Port/Refin do Hub deve enviar `originalBank`, `paidInstallments` e `benefitType`, além dos dados financeiros e nascimento. O formulário anterior omitia esses campos e era barrado pela política local com a mensagem de banco de origem/parcelas pagas, antes de chamar a API. Foram incluídos os seletores de banco e espécie e o campo de pagas, sem inferir pagas a partir do prazo refinanciado.

A validação permanece no servidor e é antecipada no formulário. Os avisos de simulação ficam no cartão de simulação; o botão Testar autenticação continua chamando exclusivamente `/test-connection`. Erros individuais exibem `row.error` quando disponível. Editar os parâmetros descarta o resultado anterior, e os campos ficam bloqueados durante a consulta.
