# Turnstile no Portal do Parceiro — Sentinel Consig

## Escopo da implementação

- Interface: src/components/partner-portal/PartnerPortalLogin.tsx
- Endpoint público (somente Site Key): GET /api/partner-portal/security/turnstile
- Endpoint protegido: POST /api/partner-portal/auth/login
- Validação backend: server/services/partnerTurnstile.ts
- Testes: tests/partner_turnstile.test.ts
- Sem alterações em banco, migrações, DNS ou integrações bancárias.

## Configuração na Vercel

Adicionar nas variáveis de ambiente do projeto sentinelconsig, inicialmente em Preview e depois em Production:

- TURNSTILE_SITE_KEY: identificador público do widget Cloudflare
- TURNSTILE_SECRET_KEY: chave privada do widget Cloudflare (Sensitive)
- TURNSTILE_PARTNER_ENABLED: true (ligar somente depois de configurar as duas chaves)

Não colocar TURNSTILE_SECRET_KEY no Git, no navegador ou em mensagens. Não utilizar prefixo VITE_ para secrets.

O endpoint público não transmite o Secret. Se a proteção estiver ativada mas faltar chave, o login falha fechado em vez de permitir bypass.
Se a proteção estiver desativada (padrão), o login atual permanece disponível. Depois de editar variáveis na Vercel, publicar novo deployment para propagá-las.

## Hostnames aceitos

No widget Cloudflare, permitir os hostnames efetivos do portal:
- sentinelconsig.com.br
- Subdomínios de empresas que utilizem o Portal do Parceiro
- O endereço de Preview, somente para testes reais

O backend exige sucesso do Siteverify, action partner_login e hostname igual ao host do login. Tokens são temporários e destinados a uso único.

## Validação e ativação

1. Confirmar que login atual não foi afetado com TURNSTILE_PARTNER_ENABLED ausente/false.
2. Para ensaio de Preview, adicionar hostname do preview ao widget e configurar chaves e flag no ambiente Preview.
3. Sem token, verificar erro HTTP 400; token vencido ou incorreto também deve falhar.
4. Simular indisponibilidade do Siteverify: deve falhar HTTP 503, sem liberar acesso.
5. Com token válido, verificar login com credenciais corretas e rejeição de senha incorreta.
6. Verificar empresas e subdomínios, layout móvel e recuperação de token.
7. Após testar, publicar e ativar em Production.

Para reverter sem código, alterar TURNSTILE_PARTNER_ENABLED para false e redeploy.

## DNS e Cloudflare WAF

O Turnstile funciona sem migrar o DNS. A proteção de domínio por proxy da Cloudflare será uma segunda fase separada: inventário DNS, hostnames wildcard e certificados TLS da Vercel, e testes de webhooks/APIs para evitar desafios em integrações automáticas.
