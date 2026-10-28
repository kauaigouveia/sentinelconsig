# Falhas persistentes CLT — revisão após 234ffd8

## Versão e causas verificáveis

Antes das alterações, main e origin/main estavam em 234ffd839403c4944ea6ee4316eb5e8edd5e0d16. O domínio de produção apontava para esse SHA, deployment READY. As correções anteriores estavam publicadas; não há evidência de que o problema fosse apenas cache.

1. FINANTO ainda tinha descoberta, despacho CLT, ações e consolidação ativos. Removidos do fluxo operacional. As rotas recusam o identificador para novas operações; observações e execuções antigas não voltam a chamar FINANTO. Serviços próprios de outros produtos e registros históricos são preservados.
2. QI Tech na FINANTO era um mapeamento explícito do adapter FINANTO (provedor 950002); não se comprovou troca de respostas da Nossa. Autorizações FINANTO/QI não são evidência de autorização Nossa/QI. Novas ofertas FINANTO não entram na consolidação CLT.
3. V8 filtrava múltiplas consultas antes de distinguir as próprias das externas. Agora a seleção automática considera somente consultas próprias e não terminais. O snapshot cifrado e o formulário recebem a referência quando há correspondência única. Mais de uma consulta ativa própria continua exigindo escolha; não se seleciona a primeira por suposição.
4. A interface sempre mostrava seleção manual e criação de consulta, inclusive quando já existia uma referência única. Agora deduplica referências DATA/OFFER, vincula automaticamente e retira a criação redundante.
5. A recuperação descartava o identificador de execução na inicialização e exigia escolha no histórico. Um recarregamento real da página agora retoma por GET o identificador opaco da mesma empresa e usuário. Fechar e abrir uma nova jornada mantém o comportamento de formulário limpo. Nenhum dado pessoal é salvo em sessionStorage.
6. A mesclagem de snapshots agora se limita à mesma execução raiz, evitando manter ofertas de outro atendimento ao recuperar uma execução diferente.

## V8: automação comprovada e impedimento real

A documentação oficial continua listando consult_id, operationalSystem, deviceModel, deviceName e deviceType para authorize:
https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento

A consulta documental pelo conector oficial não trouxe regra que permita omitir deviceModel/deviceName ou utilizar valores genéricos. Nome do computador não é exposto pela API web utilizada; modelo de desktop costuma vir vazio. Esses campos não são inventados. Portanto, a autorização totalmente automática de WAITING_CONSENT **não foi desbloqueada**: depende de dados reais faltantes ou confirmação documental da V8 sobre valores aceitos. Nenhuma autorização foi executada durante o desenvolvimento.

Consulta própria com confirmação oficial CONSENT_APPROVED/WAITING_CONSULT/WAITING_CREDIT_ANALYSIS/SUCCESS reaproveita o registro existente. SUCCESS com margem válida segue para configurações e cálculo elegível pelo mecanismo já reservado. O teste cobre uma consulta própria ao lado de uma consulta externa sem selecionar a referência errada.

## Nossa QI/UY3: o que pode ser concluído

O sistema utiliza POST /clt-loan/v1/check-authorization por instituição e só avança quando a resposta oficial confirma AUTHORIZED. A recuperação independente de QI e UY3, margem e oferta foi reproduzida por HTTP com APIs simuladas e persistência simulada. Nenhum novo link foi emitido nessa recuperação.

Não houve consulta real ao caso relatado, acesso a registros operacionais ou captura de sua resposta bancária. A causa externa do status ainda pendente permanece **não comprovada**. Não se inventou outro endpoint, webhook ou equivalência entre autorizações de canais diferentes. O cartão agora mostra o status e horário da última verificação oficial, permitindo distinguir informação antiga de uma resposta recente. Se o endpoint retornar PENDING, o sistema continua pendente; é necessária resposta sanitizada da consulta original para identificar o motivo no banco.

## Limites operacionais

O polling controlado e a recuperação persistente existentes foram preservados. O cron sem navegador continua diário e limitado; não se declara acompanhamento contínuo de alta frequência fora da jornada aberta. Resultados de POST incertos não são reenviados. Não houve migrations, mudanças de credenciais, consultas bancárias reais ou alterações de gateways.

## Validação e reversão

Os testes incluem rotas HTTP reais com serviços bancários simulados, interface, retomada após reload, separação de execuções e instituições, FINANTO bloqueada e regressões dos demais bancos. Isso não equivale a homologação com API bancária ou PostgreSQL real nesta etapa.

Reversão: revert do commit desta correção e publicação normal, sem apagar histórico, reservas de idempotência ou dados operacionais.
