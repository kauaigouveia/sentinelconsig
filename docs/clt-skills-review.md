# Revisão CLT — integridade, execução e interface

Base revisada: `1c89861561a08a2b2bb2dea06c048e804c359138`. Escopo: jornada CLT, persistência cifrada existente, acompanhamento VCTEX e apresentação dos resultados. Sem revisão indiscriminada de outros módulos.

## Resultado e evidência

Três regressões novas falharam antes da alteração (`clt-isolation-red.log`: 3 falhas / 19 aprovados):

1. **Integridade operacional, alta:** uma execução V8 de R$ 150 concluída depois da execução de R$ 300 substituía a condição mais recente na raiz. `CltJourneyService.syncRoot` copiava o resultado sem ordenar as execuções; git blame aponta a introdução dessa cópia em `c1551d0`. Agora há reserva CAS e geração persistida por banco, antes da chamada financeira, além de proteção no merge React. O resultado antigo continua no histórico próprio, mas não substitui o atual.
2. **Integridade operacional, média:** duas respostas da mesma oferta V8, com rótulos de instituição diferentes, eram persistidas como duas condições. A deduplicação estava apenas na apresentação e dependia do rótulo. `normalizeBankRows` usa banco canônico, conexão, consulta, vínculo, referência/configuração, prazo e valores reais; condições distintas permanecem distintas.
3. **Apresentação, média:** selecionar V8 mantinha a tabela consolidada e a margem de outros bancos. O snapshot completo era passado aos componentes. A seleção agora filtra toda a área; Todos os bancos é uma escolha explícita.

Um teste de recuperação também falhou antes da correção: observe de um cálculo antigo copiava o resultado mais recente da raiz para o histórico. Execuções substituídas agora são identificadas no backend como históricas, preservam suas ofertas e não iniciam acompanhamento bancário automático. Uma nova ação explícita de cálculo continua usando as consultas atuais. Respostas idempotentes recuperadas de pedido idêntico recebem identificação visual, sem alterar seus valores.

Um teste HTTP adicional confirma outro caminho: a consulta nativa VCTEX não era registrada no snapshot usado pelo próximo cálculo. O caso bancário e a memória do componente tinham a margem, mas a jornada podia não tê-la. As rotas existentes start/observe agora persistem a observação oficial, antes da resposta, no escopo da execução já autorizada. O GET não cria termo nem faz POST financeiro. Sem ID local, pode recuperar uma pré-operação existente pelo CPF já vinculado à execução autorizada; NOT_FOUND não autoriza criação. Um teste vermelho adicional reproduziu a ausência dessa recuperação.

## Consulta, cálculo e histórico

- `consultations` separa os dados oficiais de consulta dos parâmetros e das ofertas de cada execução. Respostas financeiras não substituem uma margem já persistida. As revisões da consulta e do cálculo são independentes: uma leitura oficial mais recente sobrevive à conclusão tardia de um cálculo.
- Testes exercitam margem VCTEX de R$ 529,94 preservada após 150/200/300, reidratação por outra instância, vínculos legítimos distintos, resposta financeira atrasada e leitura de margem atualizada durante cálculo.
- As reservas bancárias existentes e seus fingerprints não foram reescritos. UNKNOWN financeiro continua sem repetição automática; o histórico cifrado e as consultas antigas não são apagados.
- A VCTEX compartilhada começa recuperando o ID persistido por GET ou, na ausência/expiração, pelo lookup oficial somente de leitura. Uma consulta válida avança pelo polling existente; a recuperação manual fica em seção secundária. Ausência real de consulta exige a ação explícita de solicitação e o fluxo oficial de assinatura.
- O worker VCTEX compartilhado não executa cálculo full automaticamente ao atualizar margem. O cálculo financeiro usa a ação própria. A atualização manual dos bancos não encadeia um POST financeiro.
- Os valores de parcela e os prazos oficiais são preservados. Prazo zero continua sendo expandido em prazos permitidos pelos adapters; nenhum prazo zero é enviado ao banco. Não há alteração de juros, CET ou contratos externos.

## Nossa Fintech e limites contratuais

O fluxo existente `check-authorization` já precede qualquer nova solicitação. O teste do dispatcher comprova QITECH autorizado (inclusive envelope data e alias qi), recuperação de vínculo e margem, cálculo de R$ 150 e UY3 independente ainda pendente, sem request-authorization adicional. Os códigos oficiais continuam sendo enviados à API; FINANTO não foi reativada.

Não foi obtida resposta real de um caso QI ausente. Se o catálogo não retornar QI ou o estado não for reconhecido/for conflitante, a aplicação informa ausência/não confirmação e não inventa autorização, vínculo ou endpoint. Essa parte depende de evidência sanitizada/homologação com a instituição.

BMG e demais providers mantêm suas capacidades reais: uma integração sem suporte contratual a parcela personalizada não passa a oferecer essa modalidade. Nenhum payload fictício foi acrescentado.

## Interface

Seletor superior compacto; Consulta de margem (instituição, autorização, valor e situação); Simulação; Ofertas. A visão individual não inclui ofertas globais. Dados cadastrais adicionais efetivamente retornados ficam em Ver detalhes; campos ausentes não geram cartões extensos. Comparar selecionadas abre explicitamente Todos os bancos. O acompanhamento nativo devolve o resultado versionado da jornada; o frontend preserva a revisão oficial da consulta mesmo durante um cálculo e rejeita resultados financeiros antigos. A preferência de banco contém apenas ID opaco, com chave por usuário/empresa/raiz; a recuperação dos dados continua autorizada no backend.

## Arquivos

| Grupo | Arquivos |
|---|---|
| Estado e concorrência | server/services/cltJourneyService.ts; src/lib/cltBankState.ts |
| Observação VCTEX | server/services/vctexRoutes.ts; server/services/vctexCltCalculation.ts; server/services/vctexBankService.ts; src/lib/vctexCurrentState.ts |
| Interface | src/components/simulation/CltJourneyWorkspace.tsx; CltResults.tsx; CltCustomerDataCard.tsx; VctexCltActions.tsx |
| Regressões | tests/clt_bank_scope.test.tsx; clt_bank_scope_backend.test.ts; clt_journey_ui.test.tsx; v8_clt_simulation.test.ts; vctex_clt.test.ts |
| Relatório | docs/clt-skills-review.md |

## Revisão diferencial de segurança

**Risco de revisão: alto**, por envolver estado financeiro persistido e handlers autenticados. **Falhas críticas/altas de segurança confirmadas no diff: zero.** Os defeitos funcionais acima não são apresentados como prova de acesso entre tenants. Recomendação: aprovar a publicação do código após checks locais; isso não é homologação bancária.

Revisão manual local de todos os arquivos do diff, seguindo differential-review. Alcance direto: prepareCalculation tem dois pontos de chamada em start; syncRoot tem quatro chamadores; recordObservation é acionado pelos dois handlers VCTEX já autenticados; applyBankRows consolida os pontos de atualização do backend e o fallback da interface. Não foram executados Semgrep/CodeQL nem uma auditoria de todo o sistema.

Cenários adversariais examinados:

- Usuário sem sessão/permissão tenta GET/POST VCTEX: as verificações de sessão, empresa ativa, RBAC e acesso a promotora continuam antes do banco.
- Outro usuário/tenant apresenta um executionId conhecido: a leitura cifrada por tenant/ator e a verificação de CPF da execução impedem reutilização. O teste HTTP confirma 404 e nenhuma chamada bancária adicional.
- Body injeta CPF, tenant, generation ou margem: as rotas continuam construindo contexto/identidade do servidor; geração e consulta são metadados internos, não recebidos do navegador.
- Resposta antiga tenta restaurar preço anterior: CAS/geração impedem sobrescrita e mantêm o histórico. Uma revisão mais recente da consulta não é desfeita por preços tardios.
- Preferência local de banco é adulterada: só IDs da execução recuperada ou all são aceitos; isso não concede permissão no backend e não contém CPF, telefone, e-mail ou credenciais.

Nenhuma autenticação, permissão, isolamento de promotora, assinatura ou validação financeira foi removida. O lookup-only foi testado para consulta existente e NOT_FOUND, sem criação/termo; invalidação explícita da autorização retira a consulta/ofertas vinculadas da visão atual, mantendo outros vínculos e o histórico. Não há mudanças em dependências, credenciais, Oracle, destinos, schema, migrations ou configuração de produção.

## Skills e validação

- Matt Pocock: diagnosing-bugs — reprodução vermelha, correção localizada e regressão pelo fluxo real do código com dependências sintéticas.
- Trail of Bits: differential-review — análise local do diff, histórico Git, chamadores e cenários adversariais. Análise manual, sem afirmar execução de scanner.
- Vercel react-best-practices — hooks, cancelamento/escopo, estado derivado, acessibilidade e ausência de dependências novas.
- Grill-Me não foi necessário. Não foram usados Ruflo, Sandcastle ou subagentes.

Suíte final CLT: **327 testes aprovados em 30 arquivos**, um worker por vez. Inclui parcelas V8 de 150, 200, 300 e margem máxima, payload documentado, prazo zero/todos, não repetição de POST idêntico e preservação de execuções históricas. TypeScript (npm run lint), build e git diff --check aprovados. Build com avisos de tamanho de chunks e imports estáticos/dinâmicos; sem erro de compilação.

Integração HTTP usa Express real e persistência injetada; APIs externas são mocks com fixtures sintéticas. Os testes de interface usam DOM simulado em larguras desktop/mobile: não são capturas de navegador autenticado. Não foram feitas chamadas bancárias reais, acesso a banco operacional ou aceite em nome de trabalhador. As causas comprovadas são caminhos reproduzidos no código, não diagnóstico conclusivo de uma operação específica de produção.

## Publicação e reversão

Push normal na main, sem PR, após aprovação de todas as verificações. Conforme o pedido, o deployment automático Vercel **não será consultado nem aguardado**. Não afirmar READY. Reversão por git revert do commit e novo push normal; preservar consultas, históricos e reservas de idempotência.
