# Sentinel Consig — Site comercial

Website de apresentação, planos sob consulta, solicitação de contratação e pedido de demonstração, separado da aplicação operacional.

## Endereços de produção

- **Site comercial**: https://sentinelconsig.com.br
- **Redirecionamento www**: https://www.sentinelconsig.com.br
- **Aplicação operacional (Vercel)**: https://app.sentinelconsig.com.br

## Deploy atual: Cloudflare Workers

A Vercel não autorizou a criação de um segundo projeto pela conexão existente. Por isso, o site foi publicado no **Cloudflare Worker** `sentinelconsig-commercial` sem alterar código, DNS wildcard ou serviço da aplicação operacional.

- Rotas da zona Cloudflare: `sentinelconsig.com.br/*` e `www.sentinelconsig.com.br/*`.
- CNAME apex e www: proxy Cloudflare ativado; CNAME wildcard continua DNS-only apontando à Vercel.
- Código-fonte completo do Worker implantado: `marketing/cloudflare-worker.js`.
- Documento original da página: `marketing/index.html`; a atualização da página precisa ser refletida no objeto `assets` do Worker.
- Conteúdo estático incorporado no próprio Worker: HTML, SVG e páginas legais. Sem dependência de CDN para servir a página, exceto fontes opcionais do Google.

## Formulários comerciais

`POST /api/lead` aceita `kind=demo` ou `kind=contract` com nome, empresa, e-mail, telefone, plano e consentimento. Demonstração requer data e período de preferência, que **não equivalem a reserva confirmada**.

Os registros são persistidos no D1 separado `sentinel-commercial-leads`, database UUID `bd20f560-3b80-4dde-a97e-dfd04f8142bb`, binding `LEADS_DB`. Tabela: `leads`, criação em `marketing/cloudflare-schema.sql`.

O Worker tem binding `COMMERCIAL_EMAIL` restrito a `kauaigouveia@gmail.com` (destino já verificado no Email Routing) para tentativa de notificação. A entrega **não foi homologada**. O código também aceita `RESEND_API_KEY` como binding secret opcional para encaminhar o lead via Resend com destinatário `comercial@sentinelconsig.com.br`. O registro é persistido antes da tentativa de envio e não se perde se a notificação falhar. Verificar `notified` / `notification_error` na tabela.

Para consultar leads:
```sql
SELECT created_at, kind, name, company, email, phone, plan, preferred_date, preferred_period, status, notified, notification_error
FROM leads
ORDER BY created_at DESC LIMIT 100;
```

## Segurança

- Dados validados no servidor e SQL parametrizado.
- Honeypot, bloqueio de origem cruzada e controle de taxa best-effort em memória por instância.
- Sem endpoints públicos de consulta ou exclusão de leads.
- Backoffice: consultar D1 pelo painel autenticado da Cloudflare; não existe painel público.
- O formulário não recebe documentos, CPF, NB, contratos nem dados de clientes.
- Para alto tráfego, habilitar Turnstile e rate limiting persistente.
- Validar LGPD e textos legais com responsável antes de campanhas pagas.

## Arquivos alternativos

`marketing/api/lead.js` e `marketing/vercel.json` são alternativas **não usadas na produção atual** caso seja criado um projeto comercial independente na Vercel. Nesse caso, configurar `RESEND_API_KEY` na Vercel; sem ela o endpoint retorna indisponibilidade. Não apontar o domínio para a Vercel sem validar os formulários.

## Validações pendentes

O upload do Worker, as rotas e o DNS foram confirmados pela API Cloudflare; testes de navegador externo e entrega efetiva de e-mails dependem de uma verificação posterior. A proposta comercial define valores, usuários, recursos e contratos; não há checkout nem assinatura automática nesta versão.

## Identidade e animações (23/11/2026)

Website agora usa o arquivo **oficial da aplicação** `public/branding/sentinel-wordmark-dark-v6.png` (SHA de blob reutilizado no diretório `marketing/branding/official-wordmark-v6.png`), com favicon `sentinel-favicon-v6-32.png`. Não redesenhar nem gerar outra marca. A Cloudflare entrega cópia binária exata no Worker e reflete a versão atual de `marketing/index.html`. Animações de hero, glow, painel, barras e estados; `prefers-reduced-motion` respeitado. Indicadores são fictícios e continuam identificados como ilustrativos.
