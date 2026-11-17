# Sentinel Conecta — consulta de margem CLT e resultado individual por banco
Data: 17/11/2026

## Solicitação
O parceiro precisa visualizar no Telegram as condições dos bancos e os motivos por instituição, inclusive no FGTS. Na CLT, a consulta deve iniciar por vínculos/margem oficiais, seguida por simulação de margem cheia e possibilidade de escolher outra parcela, valor ou prazo. No INSS Novo, o Finanto não deve desaparecer do relatório quando não houver oferta, e deve aparecer com seu nome e tabela quando existir cotação.

## Fluxo CLT implementado
1. Escolha **CLT → Consultar margem e simular** ou **Dados do cliente**.
2. Envie **CPF, nome e telefone**, um por mensagem. O bot não pede prazo/parcela/valor antes de consultar.
3. Confira o resumo mascarado e confirme **Consultar margem CLT**. Esta confirmação utiliza `PartnerSimulationService.run(...,'REFRESH')`, via integrações autorizadas da própria empresa, incluindo as consultas oficiais de vínculos, margem e autorização. Não dispara SMS nem cria autorização automaticamente (`observeOnly:true`, `automaticAuthorization:false`).
4. O bot informa os retornos por **banco e instituição**, incluindo margem oficial quando o adaptador a devolver; margem de uma instituição não é tratada como margem de outra.
5. Havendo pelo menos uma margem positiva, oferece:
   - **Simular margem cheia**: usa `autoConditions:true`, prazo não fixado (`term:0`) e cálculo bancário pelo motor existente. As próprias APIs decidem tabelas e margem aplicável; não se presume parcela única para toda a operação.
   - **Escolher parcela ou valor**: pergunta modo (PARCELA/VALOR), quantia e prazo, e consulta novamente o motor com os parâmetros exatos do parceiro.
   - **Atualizar margem CLT**: reconsulta os estados de autorização e os vínculos.
6. Se nenhum banco confirmar margem positiva, não dispara cálculo de margem cheia nem aceita valor arbitrário como margem; informa o motivo por banco e libera atualização.

A Happy retorna consultas CLT pela Dataprev. Seu simulador exige parâmetro financeiro explícito: quando o parceiro escolhe margem cheia, o sistema **não envia valor zero** nem inventa uma margem para essa integração. A Happy fica identificada como pendente de simulação personalizada; com parcela/valor informado, o fluxo existente é utilizado.

## FGTS — resultados compreensíveis
- Exibe instituição **QI Tech, BMP, J17, FACTA** ou outra devolvida pela integração, sem agrupá-las em um contador anônimo.
- Identifica **autorização pendente**, **não elegível**, **dados ausentes**, **processamento pendente** e **falha técnica**, sem tratar todos como rejeição de crédito.
- Mostra o **canal de autorização** quando informado: SMS/OTP, canal bancário, autorização de consulta no aplicativo FGTS, ou o link HTTPS efetivamente devolvido pela integração.
- O bot nunca cria link de autorização. Só apresenta URLs HTTPS recebidas pelo adaptador, sem credenciais nem destinos locais, e orienta o parceiro a conferir o domínio.
- Não envia SMS nem registra consentimento por conta própria.
- No FGTS, o estado `balance.status=completed` com `eligible=false` passa a ser identificado como **inelegível**; quando a autorização é explicitamente indicada na resposta, informa que depende de autorização; outros retornos continuam como processamento pendente. Não presume consentimento só porque uma oferta não apareceu.

## INSS Novo — FINANTO
- Resultados do provider `FINANTO` são exibidos como Finanto, incluindo a tabela, quando há oferta positiva.
- Quando a API não devolver oferta, o parceiro verá se **o produto não está configurado**, **não possui tabela compatível**, **a idade/prazo não atende ao roteiro**, **houve falha técnica** ou **nenhuma condição financeira positiva foi calculada**.
- O FINANTO continua usando as mesmas regras, taxas, prazos e integração HTTP que o Portal. Não há promessa de valor igual sem conferir tenant, versão da tabela, taxa e modalidade. A captura de tela do Portal (tabela FINANTO 1,85% a.m., 108 meses) não foi usada para inventar cotação no bot.

## Segurança e integridade
- O parceiro precisa ter Telegram vinculado e acesso ativo ao Portal na mesma empresa.
- Valida vínculo antes/depois das chamadas bancárias; dados de consulta em sessão criptografada por 10 minutos.
- Quota de 10 confirmações de consultas a cada 15 minutos por parceiro/empresa agora inclui consultas de margem, atualizações, margem cheia e valores personalizados, além do replay de mensagem existente.
- Formata apenas os campos públicos conhecidos: banco, estado, mensagem sanitizada, mecanismo de autorização, URL HTTPS disponibilizada e valores da oferta. Não envia resposta bancária bruta, credenciais, CPF ou NB completo.
- Somente cotações positivas são registradas no histórico de simulações do parceiro. Consulta de margem não é registrada como oferta aprovada.
- Não há mudança em banco de dados, migrações, credenciais, webhook, comissão ou motor financeiro.

## Limites
- Um banco pode não retornar margem se faltar autorização, vínculo oficial, configuração ou seleção de matrícula. Nessas situações, o bot não finge possuir um resultado da Dataprev.
- Para bancos com prazo condicionado a parâmetros próprios, o cálculo por margem cheia pode não se aplicar a todos os produtos; o parceiro poderá escolher o valor e prazo quando houver margem positiva e elegibilidade.
- Link, SMS ou autorizações bancárias só aparecem quando explicitamente disponíveis; o bot não executa automaticamente atos que exigem aceite do titular ou atuação da mesa.
- A disponibilidade do Finanto também depende do tenant e das tabelas bancárias ativas. Se a API devolver uma falha, não haverá valor estimado inventado.
- A homologação com dados reais/autorizados e integração bancária é necessária após deploy. Os testes automatizados utilizam respostas simuladas, não executam contratos bancários reais.

## Homologação recomendada
1. Em chat privado vinculado, usar **CLT → Consultar margem e simular**; confirmar que antes da consulta não pede valor nem prazo.
2. Conferir margem por banco e link/mecanismo de autorização, quando disponível; cancelar antes de confirmar e verificar que não houve chamada bancária.
3. Simular margem cheia e comparar valores com os mesmos parâmetros no Portal; escolher prazo/valor e repetir.
4. No **FGTS**, verificar se QI, BMP, J17, FACTA e outros retornos aparecem por instituição com pendência individual, sem inventar links.
5. Em **INSS Novo**, verificar se FINANTO aparece como oferta ou como banco sem resultado com justificativa, e comparar com a mesma empresa, taxa 1,85% e prazo 108 meses que aparecem no Portal.
6. Testar limites de consulta, expiração, autorização revogada, cancelamento e o histórico do parceiro.
