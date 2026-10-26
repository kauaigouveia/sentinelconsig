# Jornada CLT unificada — mapeamento antes da implementação

26/10/2026. Branch codex/clt-unified-journey, derivada do trabalho V8, sem publicação. Alterações V8 anteriores preservadas. Referência disponível: pedido textual; três imagens mencionadas não estavam no diretório do anexo.

## Contratos preservados

- Nossa Fintech/QI/BMP/J17/serviços retornados: check-authorization, vínculos, margem e ofertas; request-authorization somente em ação explícita, pois pode enviar SMS.
- FACTA: consulta autorizada de vínculos, matrícula opaca e margem; seleção explícita se necessária; solicitar autorização por SMS somente em ação específica.
- FINANTO: consulta/simulação existentes incluindo provedores retornados; criação de authorization-terms somente por ação específica.
- BMG: CPF/telefone da etapa cliente; enviar OTP e validar código explicitamente; nenhuma repetição automática; propostas não integram o novo acompanhamento.
- V8: credenciais existentes; consulta de consentimento/margem permitida pelo adaptador. Simulação automática da nova jornada fica bloqueada pela pendência de pré-cálculo; não criar/aceitar termos.
- Paraná, Presença e Happy: consentimentos, vínculos/eligibilidade e condições próprias; preservar componentes operacionais sob demanda dentro do acompanhamento, sem disparar seus POSTs por montagem. Não inventar adaptador UY3: usar somente rotas/serviços existentes.

## Arquitetura planejada

Novo workspace CLT no ponto de entrada real, mantendo FGTS e portal existentes. Cadastro único, condições comuns, ação principal única, acompanhamento progressivo por instituição e comparação de ofertas. Rota específica com autenticação/permissão/tenant, ID de execução e stream NDJSON; seleção de provedor validada e execução restrita ao tenant. Deduplicação local e no processo servidor para mesma execução; nenhuma garantia de exactly-once bancário ou entre instâncias. Reentrada usa consulta ao estado da execução sem refazer POST. Sem persistir dados pessoais em storage do browser, banco ou logs.

O acompanhamento separa status derivados de respostas de estado de transporte. Montagem, reabertura ou reconexão não iniciam chamada bancária. Erro de transporte interrompe acompanhamento e exige conferência, sem retry automático. Nenhuma contratação/aceite automático. Testes somente mocks e dados sintéticos; screenshots devem vir de renderização real, sem alegação de homologação bancária.

## Implementação realizada

- `SimulationView.tsx` encaminha CLT ao `CltJourneyWorkspace.tsx`; FGTS permanece no componente anterior. O portal existente foi preservado, não recebeu essa substituição visual nesta entrega.
- `cltJourneyRoutes.ts`: POST autenticado cria/reutiliza execução e envia snapshots NDJSON; GET recupera estado sem chamar bancos. Permissão simulations.create, bloqueio a sessões de parceiros nesta rota interna, tenant efetivo e ator autenticado. A rota não aceita tenant/ator fornecidos pelo navegador. Respostas são no-store.
- `cltJourneyService.ts`: descoberta local de conexões, provedores disponíveis, resultados independentes, projeção de dados e trava V8. Credenciais não são enviadas ao browser. O ID e fingerprint evitam execução concorrente do mesmo pedido no processo. Alterar payload mantendo ID retorna conflito.
- Happy é identificada pelo namespace privado CLT e seus fallbacks já existentes no HappyTokenManager, sem exigir configuração pública INSS. Bloqueios simulationAccessEnabled/happySimulationAccessEnabled são respeitados. IDs de execução ficam associados aos resultados por integração, inclusive após atualização contextual.
- `productSimulationService.ts`: filtro interno de provedor para operações contextuais; atualizações progressivas também ao receber condições de instituições da mesma integração. Sem filtro, os chamadores existentes mantêm os provedores anteriores.
- `src/lib/cltJourney.ts`: leitura incremental de frames e status, sem repetir requisições após erro. Estado do workspace fica em memória; não grava CPF/telefone em localStorage ou evidências.
- BMG usa telefone compartilhado, exibe OTP no cartão e não mostra formulário de proposta nessa jornada. SMS/validação continuam explícitos. Erros de vínculo CPF/telefone são preservados; não há contorno automático.
- Paraná/Presença/Happy preservam seus adaptadores e interações específicas. Callbacks projetam ofertas ao acompanhamento comum. Componentes são montados sob demanda; trocar entre cartões não recria os painéis já abertos. Não se presume redução de bundle, pois outros caminhos ainda importam módulos estaticamente. Identidade Happy reaproveita dados comuns sem repetir o formulário visual.
- No modo compartilhado Happy, a data/hora de autorização Dataprev não é inferida do relógio. O operador precisa informar a autorização real e confirmar que a evidência existe antes de iniciar a ação. Isso não cria/aceita consentimento e não substitui a validação bancária; o fluxo legado fora do workspace foi preservado.
- Comparação de até três condições e seleção local, sem contratação. Mobile usa fila horizontal de instituições e área de ofertas própria; desktop usa duas colunas. Claro/escuro usam classes existentes.

## Limites operacionais relevantes

Deduplicação e recuperação são locais ao processo e ao mesmo usuário/tenant. Retenção após conclusão: 30 minutos, com limpeza sob demanda e máximo de 500 execuções. Após cold start, troca de instância ou reinício, GET pode retornar 404. A UI orienta conferir o estado, sem refazer POST automaticamente. Não há alegação de exactly-once distribuído ou idempotência adicional do banco. Para publicação em múltiplas instâncias, homologar recuperação/buffering de stream no runtime e definir armazenamento compartilhado autorizado ou comportamento operacional para execução perdida, sem supor que memória de processo seja persistência.

O workspace é remontado por chave empresa/usuário, descartando estado anterior na troca de identidade. Não foi ampliado acesso ao portal: sua rota e interface legadas permanecem separadas. A trava V8 desta entrega é da nova jornada; o trabalho V8 legado preservado na branch continua não homologado e deve ser considerado na seleção/gating de qualquer publicação futura. Não publicar toda a branch supondo que a trava do workspace resolva os endpoints legados.

O stream tem limite de acompanhamento de 90 segundos; encerrar transporte não cancela uma operação já enviada ao provedor. Não reenviar automaticamente. Nova ação contextual é uma solicitação explícita, não reconexão automática. O endpoint agregador não é utilizado para screenshots: o preview bloqueia destinos e retorna somente fixtures.

Após interrupção ou resultado de transporte desconhecido, o workspace bloqueia novo disparo até recuperação do estado por GET. Se o processo perder a execução ou o banco informar timeout, a conferência operacional com o provedor continua necessária; consultar o snapshot não comprova ausência de efeito externo no banco. Quando uma integração representa várias instituições, a autorização contextual segue o alcance existente do adaptador e a interface informa isso antes da ação.

## Pendências por instituição

| Integração | Preservado | Pendente |
| --- | --- | --- |
| FACTA | Matrícula opaca/zeros, vínculos, margem, condições e autorização contextual | Homologar caso autorizado e múltiplos vínculos na nova jornada |
| Nossa Fintech / QI / instituições retornadas | Autorização consultada, vínculo/margem, condições progressivas, solicitação explícita de autorização | Confirmar instituições/consentimentos habilitados da conta real |
| FINANTO | Provedores e cálculos existentes, termos somente por ação específica | Homologar respostas/retornos assíncronos reais |
| BMG | Telefone único, OTP explícito, conflito CPF/telefone sem fallback, ofertas | Homologar SMS real somente com autorização, sem criação de proposta |
| Paraná | Consentimento, elegibilidade e condições do contrato no cartão | Continuidade real com receipts e parâmetros retornados |
| Presença | Consentimentos, vínculos, margem, condições no cartão | Continuidade real; email e confirmação do cliente continuam exigências específicas |
| Happy | Fluxo existente embutido, identidade comum, resultado no acompanhamento | Exigências próprias (agente/parceiro/autorização Dataprev) e homologação real; a nova jornada não inventa consentimento nem chama seus POSTs ao montar |
| V8 | Mesmas credenciais, consentimento/margem e seleção de consulta; juros não exigidos | Pré-cálculo/unidades contratuais. Nova jornada não envia SIMULATE/AUTHORIZE V8 |
| UY3 e outras | Instituições retornadas pelo integrador continuam dinâmicas | Nenhum endpoint UY3 direto foi inventado; suporte/habilitação efetivos dependem do integrador e da conta |

## Evidências visuais

Capturas reais de renderização do componente em preview local com fixtures, não sistema autenticado nem API real. Foram conferidos claro/escuro, desktop e largura CSS mobile de 390 px, sem transbordamento da página. Taxas/valores dos screenshots são exemplos sintéticos de outros bancos, não taxa V8 ou oferta de cliente. Imagens fora do Git em `%LOCALAPPDATA%/SentinelConsig/clt-journey-preview/`: cliente-desktop.jpg, cliente-escuro.jpg, cliente-mobile-claro.jpg, acompanhamento-desktop.jpg, acompanhamento-escuro.jpg, acompanhamento-mobile-claro.jpg, acompanhamento-mobile-escuro.jpg, comparacao-desktop.jpg, bmg-sms-desktop.jpg, bmg-sms-mobile.jpg.

## Escopo de arquivos desta entrega

Novos: server/services/cltJourneyRoutes.ts, server/services/cltJourneyService.ts, src/lib/cltJourney.ts, src/components/simulation/CltJourneyWorkspace.tsx, tests/clt_journey.test.ts, tests/clt_journey_ui.test.tsx, tests/clt_bmg_phone.test.tsx, tests/clt_provider_progress.test.ts, tests/clt_happy_consent.test.tsx, tests/clt_journey_discovery.test.ts e este documento. Modificados: server.ts, server/services/productSimulationService.ts, SimulationView.tsx, BmgCustomerAuthorization.tsx, ParanaCltSimulation.tsx, PresencaCltSimulation.tsx e HappyCltSimulationModal.tsx. Alterações V8 não commitadas e evidências anteriores foram preservadas na branch derivada; não são novas alterações deste lote.

## Resultado dos testes

99 casos entre a suíte ampliada e as checagens finais (resultados mais recentes por arquivo, sem somar repetições): 98 aprovados e 1 falha preexistente. As 7 checagens finais passaram. TypeScript, build e git diff --check aprovados após as alterações finais. Build apenas gerou cliente Prisma e artefatos Vite/esbuild, com DATABASE_URL sintética apontada a porta local sem banco. HTTP local com Express/Supertest, dados sintéticos, serviços injetados e fetch interceptado; sem PostgreSQL ou APIs bancárias reais.

Cobertura inclui concorrência de bancos, oferta antecipada dentro do mesmo integrador, autorização pendente, erros independentes, ID repetido/conflitante, recuperação sem POST, 401/403/404, troca de escopo, bloqueio de tenant, namespace Happy CLT, autorização Dataprev não presumida, BMG SMS/telefone/conflito, seleção/comparação e regressões FACTA/V8/Paraná/Presença/Happy.

Falha mantida: tests/happy_embedded.test.tsx, `offers common modalities when only Happy is enabled, without a separate Happy INSS launch`, procura texto antigo INSS Novo no seletor INSS. Teste e seletor não foram alterados: hashes HEAD/working tree iguais, respectivamente eb89614401dc2eb2daaacab7fd7a603100fbd1cf e 19a3e3ff8f4d1bf9ad7ccad7b61fec29dc7f18da. Não alterar INSS fora do escopo para esconder essa falha. Não foi executada suíte antiga de integração que acessa banco.

Relatórios JSON e logs fora do Git em `%LOCALAPPDATA%/SentinelConsig/`: clt-journey-tests-final.json (suíte ampliada), clt-journey-final-checks.json (checagens finais), clt-journey-typescript-final.log e clt-journey-build-final.log. A contagem considera cada arquivo na execução mais recente disponível, preservando os casos parametrizados.

Parecer: pronto para revisão e homologação isolada com autorização. Não pronto para publicação: homologar runtime/stream/recuperação em múltiplas instâncias, jornadas e consentimentos bancários reais, contrato V8 e revisão da falha legada. O portal permanece com a interface anterior. Nenhuma homologação bancária real foi executada.

Durante a implementação descrita acima não houve chamadas bancárias reais, acesso ao banco operacional, alteração de schema, migrations, commit, merge, push ou deploy. A autorização posterior de versionamento está registrada abaixo. Ruflo indisponível nas ferramentas da sessão; coordenação/evidências sanitizadas registradas neste documento, sem agentes autônomos.

## Preparação do versionamento autorizado

Foi selecionado um pacote de 18 arquivos exclusivamente da jornada, preservando fora do índice as alterações locais V8 administrativas/diagnósticas e relatórios transitórios. O código selecionado foi exportado do índice Git para validação isolada, sem .env operacional ou chamadas bancárias.

Nesse pacote: 87 testes, 86 aprovados e somente a falha histórica INSS/Happy descrita acima; TypeScript e build aprovados, além de git diff --check e revisão/varredura de padrões de credenciais. A contagem difere da rodada histórica de 99 porque o pacote não inclui os testes V8 locais ainda não versionados. No Windows, a validação usa o caminho canônico do diretório exportado para evitar a diferença entre o alias AppData e o diretório físico do aplicativo.

A branch herda commits V8 anteriores. A comparação virtual com origin/main detectou conflitos em server.ts, productSimulationService.ts, PartnerSimulationsView.tsx, CltCustomerDataCard.tsx, ProductSimulationModal.tsx e dois testes FACTA. Não foi executada integração das branches. Esses conflitos e as dependências V8 precisam de revisão antes de qualquer merge.

O runtime Vercel atual declara maxDuration de 60 segundos, enquanto o acompanhamento local tem limite de 90 segundos. Isso permanece pendência de homologação; não foram alteradas configurações de deploy para contornar essa limitação. Push/PR são destinados a revisão e homologação, sem merge ou promoção para produção.
