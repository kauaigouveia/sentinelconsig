# V8 DIGITAL CLT — fluxo operacional e consentimento preparado

27/10/2026. Branch `codex/clt-consult-first`, base remota `03194ed`. Inclui o pacote anterior `9ac7416`. Escopo autorizado: implementação, commit, push nessa branch e PR; sem merge, publicação, configuração operacional ou chamada bancária real.

## Implementado

- Removida a dependência das allowlists antigas de usuário/empresa/CPF. `v8CltPilot.ts` mantém o nome por compatibilidade, mas agora revalida usuário ativo, empresa ativa, vínculo/membership, papel e permissão de simulação. Permissões personalizadas de outra empresa não são herdadas. Parceiros externos não acessam a rota operacional interna.
- Removido `canSimulate=false`. A função consulta contrato técnico vigente por empresa/conexão. Com unidade BRL confirmada, POST direto confirmado e referência/validade/revisor registrados, permite simular sem desbloqueio manual de cada caso. Se pré-cálculo for exigido ou permanecer desconhecido, informa a dependência e não envia valores por tentativa.
- Registro administrativo de contrato CLT separado das credenciais, no namespace existente SystemConfig. GET exige `integrations.view`; PUT exige `integrations.admin` e grava auditoria com o revisor autenticado. Não há mudança automática em produção. A referência registrada precisa corresponder a uma confirmação real; o sistema não verifica automaticamente a autenticidade de um ticket bancário.
- V8 participa da primeira consulta multibancos. Não exige parcela inicial; criação de consulta solicita os dados adicionais documentados em seu cartão. Não aceita termos nem envia SMS automaticamente.
- Todas as consultas são vinculadas localmente a empresa, conexão e CPF. Resultados de consultas externas não vinculadas não têm ID, nome ou margem expostos, mesmo quando a mesma credencial bancária é reutilizada. O cálculo reconsulta o banco, exige SUCCESS e margem positiva, valida configuração/prazo atuais e deriva a parcela somente da margem retornada, com arredondamento para baixo.
- Configurações em `GET /private-consignment/simulation/configs?provider=QI`. Nenhum ID/tabela permanente foi fixado. Payload final envia somente `installment_face_value` OU `disbursed_amount`; não envia taxa como entrada. Escala da taxa retornada só é aplicada quando confirmada; caso contrário preserva o valor bruto. CET retornado em campos reconhecidos é apresentado bruto e rotulado sem unidade confirmada, não convertido por suposição. IOF e primeiro vencimento documentados são preservados quando retornados.
- Reservas transacionais cifradas precedem POSTs de criação, autorização e simulação. Concorrência entre processos não implica repetição. UNKNOWN/falha de persistência não é retomada como novo POST. Ofertas recuperadas são identificadas como recuperadas; sua validade não é inventada. Configuração atualizada/revisão diferente participa da identidade do cálculo.
- Estados WAITING_CONSENT, CONSENT_APPROVED, WAITING_CONSULT, WAITING_CREDIT_ANALYSIS, SUCCESS, REJECTED e FAILED mantêm mensagens específicas. Uma rejeição de vínculo é inelegibilidade. Erro V8 não interrompe os outros bancos. Ofertas continuam progressivas e comparáveis.

## Consentimento do trabalhador

O operador prepara um acesso curto em `/consentimento-v8#...` para uma consulta própria WAITING_CONSENT. O fragmento não é enviado em URL HTTP e é removido do histórico ao abrir a página. O estado fica cifrado no banco, vinculado à consulta, empresa, conexão, versão/hash do termo e validade do acesso. A página usa o texto validado sem inventar redação jurídica.

O backend **não considera o link ou o checkbox prova de identidade**. O registro exige um `WorkerIdentityVerifier` de servidor com CPF coincidente, sujeito, método e verificação recente. A sessão autenticada do operador é explicitamente rejeitada no aceite. O payload do navegador não pode fornecer essa identidade. Termo/versão, manifestação expressa, dados reais do dispositivo e user-agent são conferidos; evidências cifradas são gravadas antes do POST. Não há nome/modelo de aparelho inventado: campos ausentes bloqueiam o envio. O sistema operacional inicial vem da API real do navegador e os campos do dispositivo devem ser confirmados pelo trabalhador, conforme o contrato aprovado.

O provedor é reconsultado imediatamente antes do aceite: consulta rejeitada não é autorizada e um aceite já registrado não é repetido. `/authorize` exige um contexto interno específico de consentimento, separado do contexto do operador. O endpoint bancário não é um proxy livre.

**Pendência crítica explícita:** não existe, neste repositório/configuração, um verificador independente do trabalhador homologado para a V8. `registerV8WorkerConsent` recebe esse adaptador por injeção e usa negação por padrão. A ligação feita no servidor não fornece um adaptador fictício. Portanto a interface/backend estão preparados e testados com um verificador sintético, mas o aceite real continua bloqueado até integrar um método aprovado. Configurar texto/checkbox ou metadados administrativos não supera esse bloqueio.

## Fontes e pendências externas

- [Termo, criação da consulta e autorização](https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento): payload de criação e campos de dispositivo publicados. A página fornece um modelo de termo; isso não comprova a versão jurídica aplicável nem a suficiência da prova de identidade do trabalhador.
- [Configurações, pré-cálculo e simulação](https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt): configurações, campos financeiros e resposta. A regra de omitir o campo financeiro inativo também foi informada pelo responsável a partir de Postman, não homologada pelo Codex.
- [Checklist CLT](https://docs.v8sistema.com/guide/crédito-privado-clt/checklist-de-integração-clt).

Antes de chamadas reais/publicação completa, confirmar:

1. Texto vigente, versão, duração/revogação e evidências aceitas de consentimento. Homologar o verificador independente e a origem dos campos de dispositivo; não usar aprovação do operador.
2. Unidade monetária CLT e possibilidade de POST direto. Se pré-cálculo for obrigatório, fornecer seu contrato de sucesso, host/autenticação e dependências antes de implementar o adaptador. O estado `required` bloqueia o POST final.
3. Unidade de juros/CET para exibição percentual. A taxa não é entrada nem pré-requisito para pedir ofertas; sua unidade desconhecida não é usada como bloqueio financeiro.
4. Referência segura de um caso autorizado para homologação real. Não executar nenhuma chamada automaticamente após push ou preview.
5. Política de renovação de consultas/consentimentos expirados e validade das ofertas recuperadas. Reservas incertas não devem ser apagadas para forçar reenvio. Consultas externas preexistentes não são importadas automaticamente para outra empresa.

## Validação e limites

- Regressão ampla: 234 testes, 233 aprovados e uma falha histórica do seletor INSS/Happy (`INSS Novo`). Nenhuma nova falha. Teste e seletor permanecem iguais à main publicada.
- Subconjunto final reexecutado após ajustes: 99/99 aprovados. Não somar esses testes sobrepostos à contagem da regressão.
- PostgreSQL real descartável: 11/11 aprovados, cluster `sentinel_rebuild_ad4813e784917e9e`, banco `sentinel_rebuild_verify`, 127.0.0.1:50650, com guard de identidade/diretório/porta/usuário/banco antes de qualquer fixture. Cobertura inclui concorrência real, ciphertext, recuperação e retenção de UNKNOWN. HTTP bancário e identidade do trabalhador são simulados. Nenhuma migration.
- TypeScript (`npm run lint`), build e `git diff --check` aprovados. Build apenas gera cliente Prisma e bundles, com URL sintética no processo; não aplica migrations/seeds.
- Frontend revisado com checklist React: sem polling novo, sem POST automático de aceite ao montar página, limpeza de fetches de leitura, estado por empresa/execução e verificações reais no backend. Não foi executada homologação autenticada/browser completa deste novo fluxo público nem API bancária real.
- Evidências fora do Git: `%LOCALAPPDATA%/SentinelConsig/v8-complete-regression.json`, `v8-complete-final-tests.json`, `v8-complete-postgres.json`, `v8-complete-build.log`.

## Arquivos principais

Backend: `v8CltContract.ts` (contrato), `v8CltOperation.ts` (reservas de escrita), `v8CltConsent.ts` (acesso/termo/evidência), `v8CltPilot.ts` (RBAC operacional), `v8CltSimulationService.ts` (contrato bancário), `v8Routes.ts` (administração), `cltJourneyRoutes.ts`, `cltJourneyService.ts`, `server.ts`.

Frontend: `V8CltContractPanel.tsx`, `V8IntegrationTab.tsx`, `V8CltActions.tsx`, `V8WorkerConsentPage.tsx`, `V8CltConsultation.tsx`, `CltJourneyWorkspace.tsx`, `src/main.tsx`.

Testes: `v8_clt_workflow.test.ts`, `v8_clt_simulation.test.ts`, `v8_clt_pilot.test.ts`, `clt_journey_postgres.test.ts`. Os demais testes da jornada, FACTA, isolamento, rodapé e atendimento pertinentes foram repetidos. Schema, migrations, configuração Vercel, dependências e credenciais não integram o diff.

**Parecer:** preparado para revisão em PR rascunho. Não declarar homologação bancária, aceite real operacional nem prontidão para publicação completa. Há caminho condicional de simulação implementado e testado; os requisitos externos acima não foram preenchidos com suposições. Nenhum merge/deploy de produção foi realizado.
