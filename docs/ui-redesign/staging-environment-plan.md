# Homologação isolada — proposta, sem criação de recursos

**Etapa cancelada pelo usuário em 14/10/2026.** Documento mantido como histórico; não provisionar recursos nem tratar homologação como condição para continuar desenvolvimento. Autorização vigente: `progressive-migration.md`.

14/10/2026 · Sentinel Consig. Não é infraestrutura provisionada.
Requisitos: custo zero, duas empresas fictícias, isolamento de banco/sessões/serviços externos, sem cópia de dados reais e sem alterações em produção.

## 1. O que foi identificado

| Área | Evidência no repositório | Limite da confirmação |
|---|---|---|
| Vercel | vercel.json reescreve /api para api/index.js e frontend para index.html; função 1024 MB/60s; cron diário /api/cron/partner-simulations | Plano, projeto remoto, região e variáveis implantadas não foram consultados na conta |
| Build | npm run build: prisma generate + Vite + esbuild; vercel-build inclui prisma migrate deploy | Não usar vercel-build nesta etapa; nenhuma migration executada |
| Banco | prisma/schema.prisma usa PostgreSQL, DATABASE_URL e DIRECT_URL; src/lib/prisma.ts e .env.example indicam configuração preparada para Neon | .env.local contém somente chave de integração OIDC da Vercel; não há URL local de banco para provar qual instância está ativa |
| Sessão | cg_session_id HttpOnly, secure conforme HTTPS, SameSite=Lax, path /; token aleatório persistido no banco; portal usa cg_partner_session_id próprio | Não alterar autenticação. Novo banco precisa de sessões próprias; não copiar Session/PartnerPortalSession |
| Tenant | UserTenantMembership, TenantDomain e resolução de contexto/host; Header limpa cache e recarrega na troca | Não inferir tenant pelo nome da instância de WhatsApp; validar A→B→A e acesso direto no ambiente isolado |
| Realtime | Pusher por padrão; provider sse também existente | Sem credenciais Pusher de produção; SSE isolado ou mocks durante teste |
| Bancos | C6, FACTA, BMG, HAPPY/BYX, FINANTO, Nossa Fintech; gateway FACTA na Oracle | Configurações podem vir do banco e prevalecer sobre env. Deixar env sem chaves não é garantia de ausência de chamadas |
| WhatsApp | EvolutionService, webhook com tenant/segredo, PUBLIC_APP_URL com fallback de produção; ops/evolution e deploy/oracle-facta existentes | Não conectar número real, instância real ou gateway de produção à homologação |
| Storage/backup | Azure Blob e backupStorageService; defaults de conta/container e provider Azure em production | Não reutilizar container, credencial, IAM, backup nem endpoint produtivo |
| Outras saídas | IA, automações/HTTP/webhooks, ViaCEP, DNS e notificações existentes | Não foi identificado aqui um transportador SMTP central de envio. Auditar os caminhos antes de habilitar; não presumir que e-mail esteja isolado |
| Inicialização | startServer/setupApiRoutes/eventBus e bootstrap; TEST_MODE evita startServer automático | TEST_MODE não é um bloqueador universal de efeitos externos nem configuração pronta de staging |

Segredos não foram exibidos ou copiados. Não foram feitas consultas ao banco de produção ou alterações de conta/projeto.

Consulta DNS somente leitura: staging.sentinelconsig.com.br já possui resolução A (pode ser wildcard). Portanto não foi considerado “disponível”. Antes de cadastrar, verificar domínio/wildcard e projeto de destino na conta responsável; não mover o registro atual.

## 2. Opções e custos estimados

| Opção | Custo adicional estimado | Adequação |
|---|---|---|
| Local totalmente isolado no computador | R$0 de serviços contratados, usando recursos existentes; energia/conectividade existentes não estimadas | Caminho mais controlável para iniciar. PostgreSQL exclusivo, Node/Vite separados e rede sem saídas externas. Não fornece URL pública staging inicialmente |
| Render Free para aplicação + novo projeto Neon Free | US$0/mês dentro das cotas e sem upgrade/pagamento automático | Opção candidata para URL HTTPS pública depois de revisão técnica e autorização. Não há garantia de uptime/desempenho gratuito ilimitado |
| Novo projeto Vercel + novo projeto Neon | Neon Free US$0 dentro das cotas; Vercel depende do plano atual e uso permitido | Vercel Hobby é pessoal/não comercial, portanto não presumir elegibilidade gratuita para o SaaS financeiro. Não recomendar compra/upgrade sem consentimento |
| Reutilizar VPS/gateway/WhatsApp atual | Não recomendado nesta proposta | Interferiria no orçamento de recursos e na infraestrutura produtiva; não cumpre a separação solicitada |

Fontes oficiais consultadas:
- [Neon Pricing](https://neon.com/pricing): Free US$0; atualmente 1 GB de storage e 100 CU-hours mensais por projeto; projeto novo, sem derivar/duplicar dados de produção.
- [Render Free](https://render.com/docs/free): web service gratuito com domínio/TLS; 750 horas mensais por workspace; suspensão após 15 min ocioso e retomada com atraso; filesystem efêmero. Limites de banda/build podem cobrar com forma de pagamento cadastrada; sem método de pagamento suspende/desabilita quando excede. Não manter cartão para essa opção de custo zero. Postgres gratuito do Render expira em 30 dias: NÃO utilizá-lo como banco permanente de staging.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): restrição a uso pessoal/não comercial. Plano efetivo ainda desconhecido.

Preços/limites são os consultados nesta análise, não promessa de gratuidade eterna. Para manter custo zero, parar/suspender ao atingir cotas, não ativar upgrade nem usar VPS produtiva como alternativa.

## 3. Recomendação

Preparar primeiro homologação local totalmente isolada, mediante autorização específica para banco/migrations/seed locais. Depois, se necessário acesso remoto, avaliar Render Free + projeto Neon Free novo, ambos separados, com cotas e saídas externas bloqueadas por código de staging/mocks. A criação de recursos, migrations e deploy continuam proibidos nesta entrega.

A opção local deve usar diretório/volume PostgreSQL novo e porta dedicada (ex.: 55432), usuário e senha exclusivos, aplicação em porta própria (ex.: 5181/5182). Bind 127.0.0.1 inicialmente. Não iniciar com o .env produtivo nem copiar credenciais. Banco nunca publicado na internet. Contêiner com rede isolada ou PostgreSQL local equivalente, sem usar contêiner/volume anterior.

Para versão hospedada: projeto aplicação separado; auto-deploy desativado; deploy manual de commit aprovado. Usar primeiro hostname próprio do provedor para validar. Só depois cadastrar staging.sentinelconsig.com.br e eventuais hostnames alfa-staging/beta-staging após conferir DNS e aprovar os registros. Não acessar a URL staging atual supondo que já é homologação.

## 4. Banco e dados fictícios

- Projeto/instância PostgreSQL NOVO, database e role exclusivos. Neon: projeto independente, não branch de produção nem clone.
- DATABASE_URL pooled somente da homologação; DIRECT_URL direto somente da homologação. Mesma base staging, credenciais sem privilégios sobre produção.
- Conferir host/porta/database/role em preflight antes de migrations; bloquear destino que não esteja em allowlist staging. Não usar conexão produtiva como fallback.
- Migrations apenas após autorização, contra destino comprovadamente isolado. Sem copiar dados reais, dump produtivo, sessões, tokens, documentos ou configurações de integração.
- Seed determinístico idempotente com empresas Alfa Homologação e Beta Homologação, vínculos e domínio/alias próprios; contas com e-mails .test e credenciais temporárias distintas via secrets.
- MASTER e GESTOR em cada tenant, operador comum por tenant. USUARIO NÃO existe no enum atual: usar DIGITADOR como papel base ou perfil customizado de permissões existentes com rótulo “Usuário de teste”; não criar enum nem promover MASTER a PLATFORM_MASTER.
- Um usuário com memberships explícitos nas duas empresas para testar alternância A→B→A. Usuários de apenas uma empresa para testar negação à outra; conta opcional PLATFORM_MASTER de teste somente para fluxos de plataforma autorizados, fora da migração atual.
- Propostas/clientes/parceiros/status/produtos/bancos de exemplo gerados do zero; sem dados da galeria reutilizados como dados de produção; sem CPF válido de cliente real.

## 5. Variáveis e efeitos externos

Variáveis já reconhecidas a configurar EXCLUSIVAMENTE no ambiente staging:
- DATABASE_URL, DIRECT_URL: destinos exclusivos staging.
- AUTH_SECRET e JWT_SECRET quando usado: segredos novos, sem reaproveitar produção.
- INITIAL_MASTER_EMAIL/INITIAL_MASTER_PASSWORD: só contas fictícias, caso o bootstrap seja autorizado/necessário.
- APP_URL, FRONTEND_URL, ALLOWED_ORIGINS, PUBLIC_APP_URL: staging/local explícitos; não permitir origem produtiva como fallback.
- REALTIME_PROVIDER/VITE_REALTIME_PROVIDER: sse ou mock isolado. Não fornecer PUSHER_* ou VITE_PUSHER_* produtivos.
- C6_AUTO_SYNC_ENABLED/FACTA_AUTO_SYNC_ENABLED=false: ajudam a desativar rotinas, mas NÃO substituem bloqueio universal.
- CRON_SECRET novo ou ausência deliberada com cron externo removido da configuração exclusiva staging; não compartilhar cron de produção.
- BACKUP_PROVIDER=local na opção local; storage temporário separado. Storage cloud/desenho de mock específico antes de habilitar documentos hospedados; nunca Azure produtivo.
- Credenciais e gateways bancários, WhatsApp/Evolution, IA, SMTP/HTTP externo: ausentes e sem configuração produtiva no seed.

Nomes adicionais como APP_ENV=staging e EXTERNAL_EFFECTS=disabled seriam uma **proposta nova de bloqueio**, não flags atualmente implementadas. Exigem implementação/revisão e autorização separada de backend antes de iniciar uma homologação hospedada segura. Esta etapa NÃO alterou backend para adicionar essas flags.

Bloqueio necessário: falhar fechado em rotas de simular/contratar/sincronizar bancos, conectar/enviar WhatsApp, webhooks, envio de e-mail, automações externas, uploads Azure e IA. Mocks devem devolver respostas fixas claramente marcadas como teste; jamais encaminhar ao provider real se o mock falhar. Revisar chamadas GET que possam causar sincronização/escrita/saída externa.

Local: negar egress exceto componentes isolados necessários. Hospedado: sem pressupor firewall de egress disponível no plano gratuito; bloqueio aplicativo e adapters de teste são obrigatórios. Ausência de chaves isoladamente não satisfaz esse requisito.

Segredos: Secret Variables do serviço hospedado ou armazenamento seguro do SO para local. Nunca prefixar secrets com VITE_, gravar no Git/fixtures/logs, ou colocar em diretório OneDrive/backup sincronizado. Valores VITE_ são públicos no bundle.

## 6. Acesso seguro e validação

HTTPS no remoto, cookies HttpOnly/SameSite existentes host-only; banco de sessões separado; CORS/CSRF somente origins staging autorizadas. Sem ampliar cookie Domain para .sentinelconsig.com.br. Portal continua com cookie/sessão próprios.

Na opção local, navegador acessa apenas loopback; exposição remota não automática. Na hospedada, proteção de acesso do provedor quando disponível; manter login real do Sentinel com contas fictícias, rate limiting e nenhum usuário produtivo. Proibir indexação ajuda a evitar descoberta, mas não é controle de acesso.

Antes de disponibilizar: confirmar destinatário de DB, credenciais e ingress/egress, testar falha fechada de integrações, crons desativados, isolamento de storage, logs sem dados pessoais e ausência de recursos produtivos no config.

Roteiro autenticado: MASTER/GESTOR/operador, permissões customizadas restritas, A→B→A, abrir URL direta, refresh/back/forward, cache e realtime sem dados cruzados, criação/edição/Excel/documentos em fixtures staging, negativas de acesso. Não executar contratação nem operação destrutiva sem autorização específica de teste isolado.

## 7. Autorizações necessárias antes de execução

1. Aprovar opção e isolamento (local recomendado inicialmente; hospedada opcional com cotas).
2. Autorizar criação do banco exclusivo e migrations/seed somente nesse destino comprovado.
3. Autorizar bloqueios/mocks de backend de staging necessários, sem mudar comportamento produtivo.
4. Se remoto: autorizar recursos externos, secrets/projeto, DNS e deploy manual do commit aprovado.

Até isso acontecer: apenas desenvolvimento frontend, checagem estática e testes locais sem banco/efeitos externos. Nenhum recurso, migration, seed ou deploy foi criado/executado nesta análise.
