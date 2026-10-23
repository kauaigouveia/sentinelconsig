# Chat 3.0 — correções da homologação

Validação local em 23/10/2026, na branch `codex/sentinel-3-chat`. Sem publicação, acesso operacional, alteração de schema ou execução de migrations.

## Correções

- `server/services/supportService.ts`: o autor externo é validado em `PartnerPortalAccess`, pelo acesso ativo, parceiro e tenant. `SupportMessage.senderId` permanece nulo para mensagens do parceiro porque sua FK referencia `User`. O nome confiável do acesso é preservado como snapshot histórico; não se cria usuário interno artificial. O schema atual não possui FK persistente para o acesso externo; seu identificador aparece somente nos metadados internos do evento, não no broadcast público.
- No mesmo serviço, toda atribuição explícita exige usuário ativo da mesma empresa antes de qualquer update/evento. Permanecem as restrições adicionais de Telegram e mesa de simulação, a autorização do solicitante e a desatribuição explícita com `null`.
- `server.ts` e `server/realtime.ts`: SSE administrativo revalida sessão, empresa, papel e permissões antes de cada entrega e heartbeat de 25 segundos. A validação ignora o cache da requisição de abertura. Falhas encerram a conexão sem entregar o evento. Abas do mesmo contexto compartilham somente consultas em andamento; decisões não são armazenadas em cache.
- O teste de eco duplicado usa relógio controlado e verifica tanto eco antes da confirmação HTTP quanto confirmação antes do eco; duplo acionamento gera um único POST.

## Serviços reais: 66 verificações aprovadas

HTTP em loopback, callbacks das rotas atuais, middlewares reais pertinentes, serviços atuais e Prisma real. Não foi importado o bootstrap completo do servidor. Integrações e destinos externos foram bloqueados; dados e sessões são sintéticos.

Destino verificado pelo guard antes das conexões: cluster `sentinel_rebuild_ad4813e784917e9e`, PostgreSQL 16.15, `127.0.0.1:50650`, banco `sentinel_rebuild_verify`, usuário exclusivo `sentinel_rebuild_app`, system identifier `7699572611181861424`, diretório `integration-test/rebuild-v1/data` sob o LOCALAPPDATA do usuário. Nenhuma migration foi executada nesta homologação.

| Grupo | Aprovados | Cobertura |
| --- | ---: | --- |
| HTTP básico | 11 | 401, 404 entre empresas, mensagens internas/externas, leitura, conclusão/reabertura, atribuição, avaliação, modelos/filtros e download de anexo sintético |
| Matriz de autoria e atribuição | 45 | Dois acessos do mesmo parceiro, autoria confiável, histórico após renomear acesso, usuários estrangeiros/inexistentes/inativos/IDs inválidos, três canais e duas filas, regras de perfil, 403, desatribuição e ausência de escrita/evento nas rejeições |
| Transporte SSE real | 9 | Entrega interna/portal, duas conexões, isolamento, envelopes sem conteúdo, reconexão, envio externo, permissões, revogação de portal/admin e nova sessão sintética |
| Reprodução após correção SSE | 1 | HTTP 401 após revogação, stream encerrado e nenhum evento entregue após revogação |

Antes da correção SSE, a mesma reprodução comprovou HTTP 401 com conexão antiga ainda recebendo eventos. Após a correção, a conexão encerra; em ociosidade, a detecção ocorre no heartbeat. Cada entrega exige autorização atualizada. Há custo adicional de consulta por evento/contexto de sessão e por heartbeat; não foi realizado ensaio de carga de produção.

## Testes simulados e verificações estáticas

132 testes aprovados em 14 arquivos, um worker, incluindo regressão do Chat, portal, transportes, payloads, isolamento e Propostas. Dependências externas e Prisma são mocks nesses testes: não substituem os 66 checks reais acima. Os dois cenários de deduplicação passaram em cinco repetições adicionais (10 execuções); os demais testes foram deliberadamente filtrados nessas repetições, não ficaram pendentes na execução completa.

Comandos seguros executados no checkout:

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm run build
git diff --check
node node_modules/vitest/vitest.mjs run tests/ui_support_operational.test.tsx -t 'deduplicates an echoed message' --maxWorkers=1 --no-file-parallelism
```

O build usa URL sintética somente no processo, sem arquivo `.env` operacional. `prisma generate` gera o cliente; não aplica migrations nem se conecta ao banco de negócio. Logs completos ficam fora do repositório.

## Interface e limitações

O App completo e o Portal do Parceiro foram abertos no navegador com fixtures HTTP reais, em desktop e iframe de 390 × 844 que carrega o App completo, nos modos claro e escuro. Foram conferidos fila/conversa, navegação móvel, autores, compositor e painel de detalhes. A captura do navegador retornou `Unable to capture screenshot`; não há imagens fabricadas nem aprovação visual baseada apenas na árvore de acessibilidade.

Alternativa verificável enquanto o harness local estiver ativo:

- Interno: `http://127.0.0.1:50814/_lab/login/internal/a`
- Portal: `http://127.0.0.1:50814/_lab/login/partner/a`
- Celular após escolher o login: `http://127.0.0.1:50814/_lab/mobile` ou `http://127.0.0.1:50814/_lab/mobile?partner=1`

Essas entradas definem cookies sintéticos de teste: não comprovam o fluxo de senha/login da aplicação. O shell usa respostas sintéticas para APIs não relacionadas. As evidências DOM/acessibilidade e os scripts de homologação estão em `%LOCALAPPDATA%\SentinelConsig\chat-corrections-validation`, junto com os JSON dos testes. Não são arquivos de produção nem configuração persistente da aplicação.

Pusher real permanece **não validado**, pois não existe aplicativo de teste autorizado. Seus contratos foram verificados somente com mocks. Não houve envio real para Telegram/WhatsApp, armazenamento externo de anexos, nem notificações; nesses canais foi validada a atribuição com banco real. O teste de anexo cobre o download de bytes sintéticos pelo HTTP local, não uma integração de storage em produção.

Ruflo não foi exposto nesta sessão. A execução foi feita pelo Codex e as evidências foram registradas localmente; sincronização sanitizada no Ruflo permanece pendente.

## Parecer e reversão

Os bloqueios reproduzidos foram corrigidos e aprovados na homologação local com PostgreSQL e SSE reais. A branch pode seguir para revisão técnica. A homologação completa para publicação ainda depende da aceitação visual e da validação do Pusher real quando houver ambiente autorizado. Não há autorização de publicação nesta etapa.

Para reverter estas correções após o commit local, usar `git revert <SHA-do-commit-de-correcoes>` na branch de refatoração, preservando a refatoração anterior. Não há reversão de schema ou de banco a executar. O harness e ambos os clusters foram preservados; encerramento do harness não deve parar PostgreSQL nem remover evidências.
