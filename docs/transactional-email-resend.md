# Sentinel Consig — e-mail transacional (Resend Free)

**Escopo**: avisos de criação de usuário interno e de redefinição administrativa de senha.
O envio é exclusivamente do backend; nenhuma credencial é enviada ao navegador, ao e-mail ou ao Git.

## Arquitetura

- **Recebimento**: Cloudflare Email Routing (mantido). MX do domínio raiz continuam na Cloudflare; não alterar.
- **Envio**: Resend Email API (HTTP) a partir da Vercel, sem dependência de SMTP/portas externas.
- **Remetente**: `Sentinel Consig <notificacoes@sentinelconsig.com.br>`.
- **Resposta**: `suporte@sentinelconsig.com.br` (encaminhado ao Gmail verificado pela Cloudflare).
- **Envio em background**: usa o `waitUntil` existente na Vercel após commit e auditoria do evento; a falha do e-mail não desfaz a criação/redefinição.
- **Idempotência**: `Idempotency-Key` SHA-256 para evitar envio duplicado do mesmo evento.

## Ativação — depende de acesso à conta Resend do proprietário

1. Criar conta gratuita em https://resend.com/ e adicionar **sentinelconsig.com.br** em Domains, com envio transacional apenas.
2. Copiar **exatamente** os registros DNS fornecidos pelo Resend (DKIM, SPF e MX para o subdomínio de envio, conforme exibidos). Adicioná-los na zona Cloudflare como **DNS only**.
   - **Não remover/substituir** os três registros MX da raiz `sentinelconsig.com.br` (Cloudflare Routing).
   - **Não criar um segundo SPF** na raiz. Resend normalmente autentica o subdomínio de bounce; usar somente os registros exigidos no painel.
   - Preservar `_dmarc`, os registros CNAME do site, `gateway`, `whatsapp` e a delegação SSL `_acme-challenge`.
   - Não inventar valores DKIM: são específicos da conta Resend.
3. Confirmar **Verified** para o domínio no painel Resend.
4. Criar uma chave Resend com permissão apenas para envio. Salvar o segredo exclusivamente em **Vercel → Sentinel Consig → Environment Variables → Production**:
   - `RESEND_API_KEY` = chave secreta do Resend (tipo **Sensitive**);
   - `TRANSACTIONAL_EMAIL_ENABLED` = `true` (**somente após** domínio verificado e testes);
   - Não criar variáveis `VITE_*` nem expor chaves no chat, README ou navegador.
5. Fazer novo deploy do projeto, verificar `npm run lint`, `npm test -- tests/transactional_email.test.ts` e enviar mensagens de teste com conta própria.
6. Monitorar **Resend → Emails** (entrega, bloqueios, 429, reputação) e o log sanitizado do app para falhas. Plano gratuito consultado em novembro/2026: até **3.000 e-mails/mês e 100/dia**.

## Eventos automáticos

| Evento | Destinatário | Conteúdo |
| --- | --- | --- |
| Criação de usuário interno | E-mail cadastrado do usuário | Aviso de acesso criado e link para a plataforma |
| Reset administrativo de senha | E-mail cadastrado do usuário | Alerta de segurança com instrução de contatar suporte |

Não enviar senha temporária, hash, token, CPF, NB, contrato, margem, saldo ou informações financeiras. Parceiros externos usam estrutura de autenticação diferente e **não** recebem estes avisos por esta implementação.

## Segurança operacional

- Feature flag `TRANSACTIONAL_EMAIL_ENABLED` é **false por padrão**; sem chave ou flag, nenhum request externo é disparado.
- O provedor é chamado com timeout de 7 s, apenas para um e-mail válido; remetente e `Reply-To` são fixos.
- Não há endpoint público de disparo, nem HTML informado pelo usuário.
- Uma falha no Resend não afeta as propostas, autenticação, criação de usuários nem atualizações bancárias.
- Os registros do Cloudflare Email Routing são independentes do Resend. Desativar a flag interrompe novos envios imediatamente em novas instâncias, sem afetar o recebimento.
- Não habilitar alertas de operações/produção em massa sem controle de volume, consentimento e isolamento multiempresa.

## Validação e conclusão

A integração de código **não constitui teste real de envio**. O envio para terceiros exige: conta Resend criada, domínio verificado, chave configurada na Vercel, flag habilitada e teste de entrega aprovado. Até concluir esses itens, não declarar a função de envio como operacional.
