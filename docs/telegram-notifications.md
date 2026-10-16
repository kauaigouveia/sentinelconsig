# Telegram · Sentinel Conecta

## Ativação

1. Em Hub de Integrações, no cartão Telegram, o PLATFORM_MASTER cadastra o token do @SentinelConectaBot no campo protegido e ativa o recebimento de vínculos.
2. O servidor usa APP_URL como endereço HTTPS público do webhook, JWT_SECRET (ou AUTH_SECRET) para criptografia e CRON_SECRET para autenticar o processamento agendado. O token não é armazenado no navegador nem devolvido pela API.
3. Cada empresa habilita seus próprios avisos. A configuração da empresa não altera o token global.
4. No portal, Meu cadastro → Avisos pelo Telegram: gerar vínculo, abrir o bot, tocar em Iniciar, atualizar o vínculo e confirmar a conta apresentada.
5. A desconexão fica disponível na mesma tela.

## Avisos

- Saldo retornado: somente portabilidade/refinanciamento de portabilidade com saldo devedor positivo.
- Status cuja alçada configurada seja PARCEIRO ou CLIENTE.
- Cancelamento e pagamento por código ou categoria padrão.

Mensagens identificam a empresa (marca configurada, nome fantasia ou razão social), número da proposta, primeiro nome/iniciais do cliente, banco e status. Saldo é exibido no retorno; valor liberado, no pagamento. Não são enviados CPF, documentos ou credenciais.

## Processamento e isolamento

O cron /api/cron/telegram-notifications executa a cada cinco minutos. Ele consulta atualizações já registradas no Sentinel; não consulta o banco nem inicia sincronização de propostas. Os avisos começam após habilitação da empresa e vínculo do parceiro, sem disparo retroativo da carteira. Em cada ciclo é considerada a situação atual; uma mudança já superada não produz um aviso antigo.

Vínculos exigem sessão do portal, desafio aleatório de dez minutos e confirmação autenticada. Token e chats são criptografados com AES-256-GCM. O webhook exige o secret_token do Telegram e ignora grupos. Empresas, parceiros e propostas inativos/excluídos são filtrados novamente antes do envio.

SystemConfig mantém configuração global por ID fixo, configuração/cursor por empresa, vínculos por parceiro e fila por chave única. O envio usa aquisição atômica e deduplicação por proposta, parceiro, vínculo, histórico/status e saldo quando aplicável. O cursor e a fila são persistidos; não dependem de memória do processo.

429 confirmado recebe até cinco tentativas respeitando retry_after. Erros permanentes ficam FAILED. Falhas de rede/5xx ou confirmação ambígua ficam UNKNOWN; interrupção após aquisição pode deixar SENDING. Esses casos não são reenviados automaticamente para evitar duplicação. Não há garantia de exactly-once entre a API externa e o banco de dados. O código da fila não contém corpo da mensagem ou token.

Nenhuma migração é necessária. A ativação depende do token, do endereço público e do cron em execução. Não houve chamada real de envio ou alteração de webhook durante a implementação.

Referências oficiais: [Bot API](https://core.telegram.org/bots/api#setwebhook) e [deep links](https://core.telegram.org/bots/features#deep-linking).
