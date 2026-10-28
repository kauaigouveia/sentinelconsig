# VCTEX — autenticação e Hub de Integrações

## Escopo

Branch específica `codex/vctex-auth-integration-hub`, baseada na main `c1551d0`, que já contém o PR #4. Nenhuma mudança em Oracle, portas, firewall, schema, migrations ou credenciais. Não foram executados login bancário real, consultas de trabalhadores, termos ou simulações nesta entrega.

O responsável informou login real HTTP 200 via Oracle com `token.accessToken`. Essa evidência substitui a pendência histórica de formato, mas não é apresentada como uma nova homologação executada pelo Codex.

## Parser e diagnóstico

- Suporta `token.accessToken` e os aliases anteriores de token. Valores ausentes, malformados, múltiplos valores diferentes e aliases inválidos são rejeitados. Aliases com o mesmo valor não são ambíguos.
- `token.expires` e `token.type` não são registrados como valores nem usados para inferir escopos; o cache breve de autenticação existente foi preservado.
- Diagnóstico separa HTTP de login bem-sucedido, reconhecimento do token, disponibilidade observada do transporte e permissão CLT.
- `data.products.consignado === false` é evidência explícita de produto negado. Presença/objeto/true não confirma permissão. `access.restrictedAccess`, `access.restrictions` e `data.permissions` ainda não têm semântica CLT fornecida: não são interpretados por adivinhação. Não existe caminho que promova esses campos desconhecidos a CONFIRMED.
- Pergunta pendente à VCTEX: quais valores e estrutura de `data.permissions` e `access.restrictions` autorizam ou negam especificamente consulta e simulação CLT? O produto consignado inclui outras modalidades? Qual precedência das restrições?
- Somente nomes de campos de uma allowlist e resultados fixos são retornados. Não há token, CPF de login, senha, claims, permissões brutas ou corpo integral no diagnóstico/histórico.

## Uma única conexão

`/integracoes` possui a aba **VCTEX CLT**, que reutiliza `BankIntegrationsView`, o seletor de promotora e `VctexIntegrationTab`. O cadastro cifrado existente `integration:vctex:<promoter>:config` continua sendo a única fonte de credenciais.

GET `/api/integrations/vctex/config` agora inclui estado/histórico sanitizado; PUT no mesmo endpoint salva a mesma configuração; POST `/api/integrations/vctex/diagnostic` continua sendo a ação explícita administrativa de login. Todos preservam `integrations.manage`, empresa ativa e validação de promotora da empresa. Atualizar estado é somente leitura e não chama o banco. Não há endpoint público novo.

Diagnósticos são registros independentes cifrados em `SystemConfig`, com AAD empresa/promotora/chave. Alterar credenciais, habilitação ou transporte invalida sua associação à configuração atual. Isso evita reaproveitar sucesso antigo para uma conexão alterada. Leituras exibem até 30 verificações das últimas 100 examinadas; contagens de 24h são observadas, marcadas como parciais quando a amostra excede o limite. Nenhuma retenção anterior é apagada.

## Indicadores e interface

A VCTEX entra uma vez no catálogo monitorado, agregando as conexões de promotoras ativas somente da empresa selecionada. Uma conexão ativa falhando resulta em Offline; uma conexão sem prova suficiente resulta em Atenção; desabilitada não é online. Somente evidência autenticada, token reconhecido, transporte disponível e permissão CLT comprovada poderia resultar em Online. Atualmente a falta do mapeamento oficial de permissões mantém a classificação conservadora.

Evidência operacional VCTEX expira após 15 minutos (regra de frescor do monitoramento, não prazo de token ou termo bancário). As integrações legadas sem health check ou com evidência positiva superior a 24h ficam em Atenção; não se inventa token válido nem 100% de sucesso sem amostra. Nenhum fluxo bancário legado foi alterado.

Falha de carregamento/catálogo incompleto aparece como indisponível, nunca `0/0`. Os indicadores referem-se ao catálogo monitorado (C6, FACTA, BMG, Happy, VCTEX); outras abas preservadas não ganham telemetria fictícia. O histórico da VCTEX fica na sua aba, sem mistura com incidentes/logs legados.

O Hub é remontado por contexto usuário/empresa e as requisições são canceladas ao sair; o componente VCTEX descarta respostas da promotora anterior. Ações administrativas não são mostradas após falha de autorização da configuração.

## Validação e publicação

Testes locais usam dados sintéticos, HTTP simulado e armazenamento simulado. Cobrem parser, ambiguidade, isolamento, 401/403, falhas de autenticação/transporte, histórico cifrado, invalidação de evidência, contagem conservadora e interface. Regressão CLT e Hub executada com um worker. Resultados finais e commit estão no PR.

Não equivale a homologação bancária real, testes com PostgreSQL real ou revisão visual autenticada em produção. Não houve merge/deploy de produção. O histórico do diagnóstico começará após executar explicitamente essa ação na versão publicada; a leitura do Hub não gera uma nova chamada bancária.

Reversão: reverter o commit em uma branch de revisão. Não apagar registros de diagnóstico, configurações ou histórico operacional. Os serviços `sentinel-gateway` e `sentinel-vctex` e as rotas Oracle permanecem intocados.

## Arquivos desta correção

- `server/services/vctexContract.ts`: token aninhado, rejeição de ambiguidades e allowlist de nomes no diagnóstico.
- `server/services/vctexDiagnostic.ts`: contrato sanitizado e regras conservadoras de status/permissão.
- `server/services/vctexBankService.ts`: diagnóstico separado, persistência cifrada e leitura da evidência vigente.
- `server/services/vctexRoutes.ts`: reutilização do GET administrativo existente para estado/histórico.
- `server/services/integrationHubService.ts`: VCTEX no catálogo e métricas; ausência de prova não é online.
- `server.ts`: contexto efetivo de permissões/empresa e resposta do catálogo sem cache.
- `src/App.tsx`: remontagem do Hub por usuário/empresa.
- `src/components/admin/HubIntegracoes.tsx`: aba, indicadores, erro de carregamento e atualização após diagnóstico/configuração.
- `src/components/integrations/BankIntegrationsView.tsx`: identificação VCTEX CLT na configuração compartilhada.
- `src/components/integrations/VctexIntegrationTab.tsx`: estado, histórico, ações administrativas e configuração única.
- `tests/vctex_hub.test.ts`, `tests/vctex_hub_ui.test.tsx`: testes específicos novos.
- `tests/vctex_clt.test.ts`, `tests/ui_integrations_operational.test.tsx`, `tests/integration/hub_integracoes_phase4.test.ts`: regressão ajustada ao catálogo/diagnóstico e isolamento de eventos externos.
- `docs/vctex-auth-hub.md`, `docs/vctex-clt-oracle.md`: relatório e atualização da evidência histórica.

A regressão ampliada passou com **337 testes, zero falhas, 28 arquivos**. Os testes afetados pelo ajuste final de tipagem e isolamento do barramento foram reexecutados. TypeScript (`npm run lint`), build (`npm run build`) e `git diff --check` aprovados. O build apenas gerou Prisma Client e compilou frontend/backend, com URLs locais sintéticas não operacionais, sem migrations/seeds. Avisos de chunks grandes permanecem. Todas as validações de banco e gateway desta entrega usam mocks; não foi repetido o login real informado pelo responsável.
