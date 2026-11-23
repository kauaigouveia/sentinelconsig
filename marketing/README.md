# Sentinel Consig — Website comercial

Site comercial independente da plataforma operacional. Produção esperada: `https://sentinelconsig.com.br`; login da plataforma: `https://app.sentinelconsig.com.br`.

## Infraestrutura

Vercel projeto independente apontando para a pasta `marketing/` deste monorepositório; HTML/CSS/JS estáticos e função serverless `api/lead.js`. Não acessa o banco de dados do aplicativo nem altera autenticação, propostas ou simulações.

## Leads

O formulário envia `POST /api/lead`. Necessário configurar na Vercel `RESEND_API_KEY` (Sensitive, Production) e, opcionalmente, `LEADS_TO_EMAIL` (Production, padrão `comercial@sentinelconsig.com.br`). Remetente verificado: `notificacoes@sentinelconsig.com.br`. Sucesso só é informado após aceitação pela API Resend. Agendamento significa solicitação de data, não confirmação de horário.

## Segurança

Validação no servidor, sanitização HTML, consentimento, honeypot, limitação de taxa best-effort por instância e validação de origem. Para produção com volume maior, recomenda-se rate limiting centralizado e Cloudflare Turnstile. Sem preços publicados até aprovação comercial. Nunca comitar credenciais.

## Checklist

- Conferir DNS/SSL e redirects de www.
- Validar POST da função com dados sintéticos e entrega do e-mail.
- Revisar textos legais com responsável jurídico e atualizar dados cadastrais de controle.
- Definir preços, SLAs, usuários e recursos de cada plano em proposta.
