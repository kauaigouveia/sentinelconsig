# PR #1 — preparação para revisão, 26/10/2026

> Registro histórico: o responsável posteriormente autorizou publicação direta na infraestrutura existente. O escopo atual e os bloqueios V8 preservados estão em [publicação controlada](clt-production-release.md). A homologação isolada abaixo continua não executada.

**Parecer da etapa anterior: NÃO APTO PARA MERGE; PR em rascunho.** A ausência de preview isolado foi confirmada pelo responsável. Não foi realizada homologação autenticada na Vercel com banco sintético e bancos simulados. A validação local não substitui essa etapa.

## Integração da main

Base remota incorporada à branch do PR: `6e10f4c91d07076ae5d105bd4af4706dd2abcfb8`. O histórico anterior da branch foi preservado. Sete conflitos resolvidos: `server.ts`, `productSimulationService.ts`, `PartnerSimulationsView.tsx`, `CltCustomerDataCard.tsx`, `ProductSimulationModal.tsx`, `facta_clt_route.test.ts`, `facta_clt_selection_ui.test.tsx`.

Mantidos matrícula FACTA textual, seleção por empregador e matrícula, zeros iniciais, conversor BRL do portal, autenticação, permissões e escopo por empresa. Campos V8 vazios são omitidos no formulário legado/portal, preservando a regressão FACTA-only da main. Rodapé e demais alterações publicadas da main foram incorporados; não são uma nova publicação nesta etapa.

## Inventário V8

Dependências históricas herdadas: `f4ed5b26` (adaptador/resultado CLT), `193e7c8` (revisão documental), `098b6bf` (despacho/seleção da conexão e consulta). Incluem o adaptador V8, despacho compartilhado, seletores internos/portal, categorias de resultado, descrição administrativa e testes/documentação. A correção FACTA `fc0291fc` possui equivalente já publicado.

O código de simulação V8 continua sem homologação bancária. `V8CltSimulationService.canSimulate()` retorna **false** no backend, sem chave de ativação fornecida pelo navegador ou por variável de ambiente. `run(SIMULATE)` devolve a pendência somente para conexão local habilitada/configurada, antes de OAuth/consulta bancária; `request` bloqueia também o POST `/private-consignment/simulation`. Isso cobre o dispatcher usado pelos caminhos legado, portal e jornada. Testes do contrato inativo substituem explicitamente essa política por mock; não comprovam liberação real.

Na jornada unificada, V8 permanece em REFRESH: consentimento e margem, sem simular, pré-calcular, aceitar termos ou criar proposta. Juros não são entrada obrigatória; sua unidade e a relação entre pré-cálculo e simulação continuam pendentes de homologação, sem regras presumidas. FGTS V8 permanece fora dessa trava CLT.

Alterações administrativas/diagnósticas V8 que já estavam locais foram copiadas e verificadas por SHA-256 antes da integração. Elas não fazem parte deste pacote de preparação e devem permanecer locais após sua restauração.

## Persistência, concorrência e limite da garantia

- Reutilizada a tabela existente `SystemConfig`, com prefixo reservado `runtime:clt-journey:v1:` e empresa não nula. Nenhum schema ou migration novo.
- Snapshots e aliases cifrados em AES-256-GCM; AAD vincula empresa, executor e UUID. Derivação separada a partir do segredo de autenticação existente. Nenhum CPF/nome/telefone em claro na chave do registro ou no valor persistido. Resultados passam por projeção explícita antes de persistir/transmitir.
- Transação e constraint única reservam execução e intenção. Compare-and-set do ciphertext reserva RUNNING antes de chamar bancos. Instâncias diferentes não dependem de Map, cache ou mutex local para autorizar execução.
- UUID repetido nunca reinicia operação. Intenções idênticas simultâneas também convergem para o mesmo UUID; um alias persistido permite recuperar mesmo que o primeiro frame se perca. Após conclusão confirmada existe uma janela de deduplicação de 30 segundos para novos UUIDs; somente um novo POST explícito depois da janela pode iniciar outra tentativa. UNKNOWN não expira em repetição.
- Escritas dos snapshots são serializadas e confirmadas antes de transmitir cada atualização. Falha de persistência aborta o orçamento de chamadas e não libera nova execução automaticamente.
- Após interrupção de uma execução RUNNING, GET transforma a reserva vencida em UNKNOWN. Não retoma nem reclama a execução abandonada. Isso evita duplicação automática, mas **não constitui exatamente uma vez no banco externo**: pode ter havido processamento remoto antes de uma falha de rede. Exige conferência operacional antes de nova tentativa.
- sessionStorage guarda exclusivamente UUID por empresa/usuário. Remontagem/reload faz GET autenticado; nunca POST automático. Troca de escopo cancela o transporte e limpa dados do formulário. GET revalida sessão, permissão e habilitação de simulação do tenant.
- NDJSON é transporte progressivo, não armazenamento. Nenhum polling automático foi introduzido; recuperação adicional é explícita.

## Timeout

Removido o stream artificial de 90 segundos. A jornada usa orçamento de 40 segundos para chamadas externas, inferior aos 60 segundos de `vercel.json`, preservado. AsyncLocalStorage propaga cancelamento aos transportes Nossa/FINANTO/FACTA (incluindo gateway)/BMG/V8 sem compartilhar sinal entre empresas. Chamadas subsequentes são impedidas após cancelamento. Retentativas de autenticação/reenvio dos adapters Nossa e FACTA não são executadas nesse contexto; o comportamento legado fora da jornada permanece.

O handler aguarda todas as operações dentro da própria invocação; não deixa uma IIFE bancária destacada após responder. A reserva tem prazo de 50 segundos para recuperação conservadora após morte do processo. O tempo de banco/criptografia/transporte ainda precisa ser medido no preview; 40 segundos é orçamento de rede, não garantia absoluta contra indisponibilidade prolongada do PostgreSQL ou do runtime.

## Evidências e distinção dos testes

Consolidado de 22 arquivos de teste, considerando a última execução de cada arquivo e sem somar repetições: **186 testes, 185 aprovados, 1 falha histórica**. Inclui 8 testes com Prisma/PostgreSQL real no cluster descartável; demais testes usam banco mock e/ou HTTP bancário simulado. A falha histórica está em `happy_embedded.test.tsx`, caso `offers common modalities when only Happy is enabled, without a separate Happy INSS launch`, que procura `INSS Novo` sem passar pela seleção de produto atual. O teste e `SimulationFlowSelectorModal.tsx` são byte a byte idênticos à main (blobs `eb89614401dc2eb2daaacab7fd7a603100fbd1cf` e `19a3e3ff8f4d1bf9ad7ccad7b61fec29dc7f18da`). Não se alterou esse teste para mascarar a divergência.

Regressões adicionais de propostas, permissões, SSE administrativo, Nossa e FACTA: aprovadas. Os testes HTTP usam Express com dependências de sessão injetadas; não equivalem a login real no sistema completo. Os testes UI são DOM sintético, não capturas desktop/mobile de preview autenticado.

TypeScript, build completo e `git diff --check` aprovados. O build executou somente geração do cliente Prisma, Vite e esbuild com destino de banco sintético; não executou migrations/seeds. Permanecem avisos de tamanho de chunks e de imports simultaneamente estáticos/dinâmicos; não se afirma redução de bundle. A configuração consultada do projeto Vercel utiliza Node 24.x. A main remota foi reconfirmada sem alteração durante esta preparação.

PostgreSQL real: cluster `sentinel_rebuild_ad4813e784917e9e`, versão 16.15, `127.0.0.1:50650`, banco exclusivo `sentinel_rebuild_verify`, role `sentinel_rebuild_app`. Diretório, marcador, identidade de sistema e conexão foram verificados pelo guard local existente antes de fixtures. Foram testados restart lógico de instância, reserva duplicada, CAS concorrente, isolamento de ator/empresa, alias e cifragem. Somente fixtures próprias foram removidas; cluster e evidências anteriores preservados. Nenhuma migration ou chamada bancária. Inicialmente o cluster estava parado; foi iniciado com seus binários/configuração existentes e a identidade foi então reconfirmada.

Comandos locais relevantes:

```powershell
node node_modules/typescript/bin/tsc --noEmit
# DATABASE_URL fornecida somente ao processo de build, apontando para destino sintético sem banco.
npm run build
node node_modules/vitest/vitest.mjs run <arquivos focados> --maxWorkers=1 --no-file-parallelism
# Opt-in exclusivo do guard do segundo cluster; falha sem fallback se a identidade divergir.
$env:SENTINEL_CLT_REAL_POSTGRES_TEST='1'
node node_modules/vitest/vitest.mjs run tests/clt_journey_postgres.test.ts --maxWorkers=1 --no-file-parallelism
git diff --check
```

## Pendências para aprovação

1. Provisionar/configurar separadamente um preview autenticado com banco exclusivamente sintético e mocks efetivos no backend; isso não foi criado nem presumido. Validar cadastro, ação principal, bancos independentes, SMS/telefone BMG, progressão, comparação, reload, alternância de empresas, desktop/mobile e ambos os temas.
2. Medir buffering/limites/reconexão em instâncias Vercel reais e indisponibilidade do armazenamento. Testes locais de instâncias independentes não substituem o runtime distribuído remoto.
3. Os painéis contextuais Paraná/Presença/Happy e ações SMS BMG preservam seus próprios fluxos. Seus callbacks visuais não devem ser tratados como ledger distribuído desta execução: ofertas/estado apenas locais desses painéis ainda exigem validação específica de recuperação. Não ocorre repetição automática por remontagem.
4. Definir reconciliação operacional dos resultados UNKNOWN e política de retenção dos registros cifrados/tombstones. Não apagar reservas incertas como limpeza genérica. Rotação do segredo de autenticação exige análise de compatibilidade dos registros existentes; falha de decifragem bloqueia recuperação, sem disparar banco.
5. Homologação V8 com API real continua não executada e não liberada pelo PR. Corrigir a expectativa histórica do seletor INSS em trabalho separado ou aceitar explicitamente sua classificação na revisão.

Ruflo indisponível nesta sessão; Codex executou a análise e os testes sem criar agentes. Nenhuma chamada bancária real, aceite, contratação, migration, merge na main ou deploy de produção foi autorizado ou executado nesta preparação.
