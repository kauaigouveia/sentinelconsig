# Telegram · Sentinel Conecta

## Ativação

1. Em Hub de Integrações, no cartão Telegram, o PLATFORM_MASTER cadastra o token do @SentinelConectaBot no campo protegido e ativa o recebimento de vínculos.
2. O servidor usa APP_URL como endereço HTTPS público do webhook, JWT_SECRET (ou AUTH_SECRET) para criptografia e CRON_SECRET para autenticar o processamento agendado. O token não é persistido no navegador nem devolvido pela API.
3. Cada empresa habilita seus próprios avisos. A configuração da empresa não altera o token global.
4. No portal, Meu cadastro → Avisos pelo Telegram: gerar vínculo, abrir o bot, tocar em Iniciar, atualizar o vínculo e confirmar a conta apresentada.
5. A desconexão fica disponível na mesma tela.

## Avisos

- Saldo retornado: somente portabilidade/refinanciamento de portabilidade com saldo devedor positivo.
- Status cuja alçada configurada seja PARCEIRO ou CLIENTE.
- Cancelamento e pagamento por código ou categoria padrão.

Mensagens identificam a empresa (marca configurada, nome fantasia ou razão social), número da proposta, primeiro nome/iniciais do cliente, banco e status. Saldo é exibido no retorno; valor liberado, no pagamento. Não são enviados CPF, documentos ou credenciais.

## Processamento e isolamento

O endpoint GET /api/cron/telegram-notifications precisa ser chamado por um agendador autenticado. No plano Hobby da Vercel, o cron nativo não admite frequência de cinco minutos; por isso este endpoint não é cadastrado em vercel.json. Para processamento frequente, configure um agendador externo com Authorization: Bearer seguido do CRON_SECRET já cadastrado no servidor. Sem esse agendador, os avisos periódicos e as novas tentativas da fila não são processados automaticamente. O atendimento por webhook e as respostas imediatas da equipe não dependem desse agendamento.

O processamento consulta atualizações já registradas no Sentinel; não consulta o banco nem inicia sincronização de propostas. Os avisos começam após habilitação da empresa e vínculo do parceiro, sem disparo retroativo da carteira. Em cada ciclo é considerada a situação atual; uma mudança já superada não produz um aviso antigo.

Vínculos exigem sessão do portal, desafio aleatório de dez minutos e confirmação autenticada. Token e chats são criptografados com AES-256-GCM. O webhook exige o secret_token do Telegram e ignora grupos. Empresas, parceiros e propostas inativos/excluídos são filtrados novamente antes do envio.

SystemConfig mantém configuração global por ID fixo, configuração/cursor por empresa, vínculos por parceiro e fila por chave única. O envio usa aquisição atômica e deduplicação por proposta, parceiro, vínculo, histórico/status e saldo quando aplicável. O cursor e a fila são persistidos; não dependem de memória do processo.

429 confirmado recebe até cinco tentativas respeitando retry_after. Erros permanentes ficam FAILED. Falhas de rede/5xx ou confirmação ambígua ficam UNKNOWN; interrupção após aquisição pode deixar SENDING. Esses casos não são reenviados automaticamente para evitar duplicação. Não há garantia de exactly-once entre a API externa e o banco de dados. O código da fila não contém corpo da mensagem ou token.

Nenhuma migração é necessária. A ativação depende do token, do endereço público e do cron em execução. Não houve chamada real de envio ou alteração de webhook durante a implementação.

Referências oficiais: [Bot API](https://core.telegram.org/bots/api#setwebhook) e [deep links](https://core.telegram.org/bots/features#deep-linking).

## Bot próprio da empresa

A configuração Telegram oferece os modos SHARED e CUSTOM. O modo CUSTOM exige token e ativação próprios, obtém o nome de usuário diretamente do getMe e usa webhook exclusivo em /api/webhooks/telegram/company/:tenantId. Não há fallback para o bot compartilhado quando o próprio estiver ausente ou indisponível.

A posse do bot é reservada por identidade Telegram em um registro global único. O mesmo bot próprio não pode ser cadastrado por empresas diferentes. Tokens ficam criptografados; apenas usuários internos com integrations.manage da empresa podem cadastrar o próprio. O bot global continua restrito ao PLATFORM_MASTER.

Tickets, vínculos e rotas de conversa registram a identidade do bot. A troca para outro bot exige novo vínculo dos parceiros; envios antigos não são transferidos para o novo canal. O webhook do bot antigo é ignorado se ele deixar de ser o bot ativo da empresa. Na volta ao compartilhado, a empresa também precisa de vínculo compatível.

## Atendimento pelo Telegram

A empresa habilita Atendimento independentemente dos avisos de propostas. Após confirmar o vínculo no portal, o parceiro envia /start e escolhe Atendimento. Quando houver múltiplas empresas vinculadas ao mesmo bot e Telegram, escolhe explicitamente a empresa; a lista possui paginação.

O atendimento usa SupportConversation com channel=TELEGRAM e department=SUPPORT. Conversas abertas são reutilizadas pelo mesmo parceiro e empresa. Mensagens entram na Central de Atendimento, com eventos de atualização da fila. Respostas da equipe voltam pelo bot ativo da empresa, validando vínculo, identidade do bot e rota de conversa. O perfil SUPORTE e a administração MASTER/PLATFORM_MASTER/ADMIN têm acesso, além das permissões support.view/support.reply. Atribuições exigem perfil compatível.

Texto é suportado até 3.500 caracteres por mensagem. Para arquivos/imagens, o bot orienta utilizar o portal. Não há download de arquivos enviados ao bot. Respostas a mensagens de outro atendimento não são encaminhadas ao atendimento selecionado. Trocar empresa altera o contexto; Encerrar atendimento resolve a conversa atual.

A entrada é deduplicada por bot/chat/message_id, com recibo e gravação de conversa/mensagem em transação serializável. O estado do menu é criptografado. A sessão de conversa é revalidada contra empresa e parceiro ativos, integração e vínculo atual a cada mensagem. As respostas humanas são persistidas antes de enviar; 429 confirmado volta à fila do cron, erros ambíguos ficam UNKNOWN e não são repetidos automaticamente.

As opções de menu passam pelo webhook já utilizado. Quem já ativou a conexão não precisa registrar novos tipos de update para atendimento por texto; somente mensagens privadas são aceitas.


## Atualizacao: bot exclusivo para avisos

O atendimento Telegram foi desativado globalmente, inclusive para empresas com a opcao antiga salva. O webhook apenas identifica o Telegram para confirmar o vinculo no portal. Comandos de atendimento direcionam ao portal e removem o teclado antigo. Historicos existentes permanecem preservados; novas conversas e entregas de suporte pelo Telegram estao bloqueadas.

Os avisos agora contemplam qualquer status atual atualizado, mantendo mensagens especificas para saldo retornado, parceiro, cliente, pagamento e cancelamento. A varredura consolida o estado atual; nao garante aviso de cada transicao intermediaria entre execucoes.

Calculo de cinco dias uteis de CIP e despacho de mensagens sao rotinas distintas. Completar o prazo nao confirma retorno de saldo pelo banco. O agendador externo ainda precisa ser configurado para chamar GET /api/cron/telegram-notifications com Authorization Bearer CRON_SECRET a cada cinco minutos. Nenhum agendador externo foi provisionado por esta alteracao.


## Regras finais dos avisos

Enviar somente para o parceiro vinculado a proposta: etapas de responsabilidade PARCEIRO ou CLIENTE, saldo retornado de portabilidade com saldo positivo, pagamento e cancelamento. Etapas internas, de banco ou sistema nao geram aviso por si mesmas. Outros estados finais tambem nao geram aviso.

Mensagem: nome da empresa, banco, numero da proposta, valor liberado em BRL, nome completo e CPF formatado do cliente, etapa atual; saldo devedor adicional no retorno da portabilidade. CPF e nome sao usados apenas para compor a mensagem ao destinatario validado, sem gravacao do corpo na fila. Esta regra substitui a descricao anterior sobre qualquer status atualizado.


## Formato visual dos avisos

Cabecalho com nome da empresa em negrito. Valores de banco, proposta, valor liberado, cliente, CPF e etapa em negrito via parse_mode HTML, com escape dos campos dinamicos. CPF sempre mascarado como ***.XXX.XXX-**; valores invalidos aparecem como Nao informado. O formato vale para novas entregas, sem reenvio das mensagens ja entregues.


No aviso SALDO, Valor liberado usa releasedValue do REFIN_PORTABILIDADE explicitamente vinculado por relatedPortabilityId, na mesma empresa, parceiro e cliente. Se a propria proposta for REFIN_PORTABILIDADE, usa o valor dela. Sem refin vinculado, mostra Nao informado, sem usar o valor da portabilidade como substituto. Demais avisos preservam o valor da propria proposta.


## Deduplicacao de avisos por status

A entrega registra o ultimo status enviado por empresa, proposta e parceiro. Se o status atual ja foi enviado, o aviso pendente e descartado mesmo com novo vinculo Telegram, alteracao de valor/saldo ou novo registro de historico para a mesma etapa. Entregas antigas confirmadas tambem sao reconhecidas quando correspondem ao fingerprint atual. Outro status elegivel pode gerar novo aviso. O marcador e atualizado somente apos resposta positiva do Telegram; continua sem garantia de exactly-once em falhas ambiguas de rede.


## Consulta de propostas pelo parceiro

No bot, enviar /start, /menu ou /consultar. O teclado oferece Consultar proposta, escolha de empresa/cadastro quando houver varios vinculos, Numero da proposta e CPF do cliente. A pesquisa e exata por numero ou CPF normalizado. Mais de um resultado apresenta selecao numerada das 20 propostas mais recentes; para outras, pesquisar pelo numero.

Cada mensagem revalida bot ativo, empresa habilitada/ativa, parceiro ativo e vinculo confirmado do chat privado. Toda busca/detalhe aplica tenantId e partnerId; numeros de outra empresa/parceiro nao sao retornados. Mudanca ou revogacao do vinculo invalida o contexto. CPF no retorno permanece mascarado. Consulta aceita qualquer etapa atual, independentemente dos filtros dos avisos automaticos.

Estado criptografado por bot/chat expira em 10 minutos; guarda somente IDs de resultados, vinculos e fase, sem CPF pesquisado nem texto enviado. Recibo por message_id evita processar novamente o mesmo update; recibo e estado gravados em transacao Serializable antes da resposta. Se a resposta Telegram falhar apos o commit, o parceiro pode repetir a pesquisa com nova mensagem. Consulta e imediata via webhook e nao depende do cron; nao altera status nem marcadores de notificacao automatica e nao reativa atendimento humano.


## Valores de portabilidade na consulta

Toda mensagem inclui o tipo da proposta com nome legivel. Na consulta de PORTABILIDADE, Valor liberado vem do refin explicitamente vinculado, independentemente da etapa; Saldo devedor vem da portabilidade consultada. Na consulta do REFIN_PORTABILIDADE, o liberado e da propria proposta e o saldo e da portabilidade explicitamente vinculada (mesma empresa, parceiro e cliente), com fallback ao saldo do proprio refin. Valores ausentes aparecem como Nao informado. Nao se infere vinculo por CPF e nao se calcula retorno de saldo por prazo.
