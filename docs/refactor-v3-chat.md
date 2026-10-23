# Sentinel Consig 3.0 — lotes 0, 1A e 1B

Base: `5932d08f16fffbf2c52b5a900b1bdaf40051a391`. Branch: `codex/sentinel-3-chat`.
Executor: Codex. Coordenação Ruflo: `task-1792763370124-hfbusf`.

## Escopo e preservação

Implementação em checkout separado. O piloto `codex/ruflo-piloto-local`, suas alterações não commitadas e seus ambientes foram preservados. A main local/remota permanece na base publicada. Não houve push, merge, deploy, acesso a banco operacional, migration ou mudança de schema/configuração de produção.

As 21 migrations presentes na versão publicada e `schema.prisma` não possuem diferenças em relação à base. As duas migrations locais de reconstrução continuam somente no piloto original e não integram esta branch.

## Lote 0: linha de base

- Antes das alterações: 47 testes aprovados (45 controles de segurança de Propostas + 2 testes operacionais da Central).
- O diagnóstico aprovado já registrava mais 22 testes de interface aprovados na mesma base; esses casos também integram a validação final, com ampliação dos casos da Central.
- Comparação visual local: mesmos componentes, React em produção, CSS de base preservado, mesmo navegador e viewport 1020 × 997, 24 conversas e 40 mensagens sintéticas. Não foi iniciado o servidor completo.
- Preview limitado a `127.0.0.1`, sem backend real. Fetch substituído por fixtures; CSP `connect-src 'none'` impede integrações externas. Artefatos em `%LOCALAPPDATA%/SentinelConsig/refactor-v3-implementation`.

## Lote 1A: contrato e transporte

1. `src/lib/supportRealtime.ts`: lista compartilhada dos quatro eventos de atendimento e interpretação do `entityId` do envelope mínimo. Aceita o identificador legado somente como fallback; não usa broadcasts como fonte dos dados da conversa.
2. `src/services/realtimeService.ts`: registra atendimento no Pusher e no SSE nomeado, mantendo o SSE genérico; filtra tenant na ponte entre abas e fecha a conexão anterior ao trocar de tenant.
3. Central e portal recarregam os endpoints autorizados, silenciosamente, ao receber mensagem/criação/status/atribuição. Reconexão dispara reconciliação. Polling continua em 2000 ms; não foi reduzido.
4. `server/services/pusherService.ts`: inclui tenant no envelope interno e publica invalidações de parceiro em canal privado próprio, derivado do par tenant/parceiro por SHA-256. Nenhum conteúdo de mensagem, nome, documento ou dado de autenticação é publicado.
5. `server/services/partnerSupportRealtime.ts`: rotas dedicadas do portal, autenticadas pelo `PartnerPortalService.getPartnerSession` existente. Contexto e assinatura autorizam somente o canal desse parceiro. Registro SSE separado; nunca inscreve parceiro no stream administrativo. SSE revalida sessão a cada heartbeat, limita conexões por parceiro e limpa conexões encerradas.
6. `server/services/eventBus.ts` e `supportService.ts`: encaminham a invalidação mínima ao parceiro correto; status/atribuição preservam o ID de roteamento internamente. O payload completo continua fora do broadcast.
7. `src/services/partnerSupportRealtime.ts`: conexão exclusiva do portal, independente do hub interno; Pusher com endpoint de autorização próprio ou SSE conforme o provedor existente. Cleanup ao desmontar, descarte de eventos de outro tenant e reconciliação após reconexão. Falha do transporte mantém o polling existente.
8. `server.ts`: somente importação e registro do módulo dedicado, sem alteração das regras das rotas de negócio.

Observação corrigida durante a revisão: os handlers SSE existentes já liberavam `isConnecting` antes de reconectar. Não foi mantida alteração redundante nesse fluxo; foi acrescentada cobertura de regressão.

## Lote 1B: experiência

- Central com fila à esquerda e conversa principal; removidos três cartões de indicadores e cabeçalho repetitivo.
- Cabeçalho compacto, busca direta, filtros de canal/fila recolhíveis e status acessível por teclado.
- `SupportConversationDetails.tsx`: contexto, responsável, simulação e avaliação em painel nativo recolhível, disponível também em telas menores.
- Modelos e configuração continuam disponíveis em Ferramentas e só são montados após a primeira abertura. Fechar o painel não descarta sua edição em andamento.
- Composer no rodapé do painel; mensagens legíveis, anexos, autores, histórico, estados de entrega e reenvio preservados. Falha em atualização silenciosa mantém o histórico e oferece nova tentativa.
- Portal externo mantém abertura de atendimento, proposta vinculada, avaliações, anexos e restrições de canal.
- No celular, navegação entre fila e conversa, com botão de retorno inclusive durante carregamento/erro. Filas também respondem a Enter/Espaço.
- Removida somente a confirmação redundante de sucesso ao concluir/reabrir; o status atualizado permanece visível e erros continuam notificados.
- Envio interno protegido por trava síncrona. Resposta POST e eco em tempo real são unidos pelo ID, evitando duplicação visual. Leituras iniciadas antes de uma escrita reconhecida são invalidadas apenas na conversa de origem.
- CSS compartilhado e restrito ao inbox; sem dependência nova e sem mudança na navegação geral.

## Validação executada

**120 aprovados, 0 reprovados, 0 pendentes na suíte selecionada**, em 12 arquivos, com um worker por vez. TypeScript, build completo e `git diff --check` aprovados. Após os últimos ajustes de apresentação/cleanup, foram repetidos os 32 casos diretamente afetados, todos aprovados.

Novos testes:

- `support_realtime.test.ts`: Pusher, SSE genérico/nomeado, reconexão, troca de tenant e ponte entre abas.
- `support_broadcast_contract.test.ts`: bus backend real com transporte injetado, conteúdo privado ausente e roteamento para parceiro.
- `support_isolation_v3.test.ts`: serviço real com Prisma simulado; rejeita tenant/parceiro/fila indevidos antes de leitura/escrita de mensagens; status mantém roteamento.
- `partner_support_transport.test.ts`: handlers reais registrados em app injetado; 401, 403, socket inválido, canal próprio, invalidação mínima, isolamento SSE e sessão revogada.
- `partner_support_client_transport.test.ts`: lifecycle SSE/Pusher, reconexão, tenant divergente e desmontagem.
- `ui_partner_support_v3.test.tsx`: quatro eventos, anexos, erro/nova tentativa, resposta atrasada e canais externos.
- `ui_support_tools_v3.test.tsx`: ferramentas reais sob demanda e inserção de modelo sem enviar mensagem.
- `ui_support_operational.test.tsx` ampliado: oito papéis internos, permissões de canal/fila, navegação, eco duplicado, reconciliação e fallback de dois segundos.

Também reexecutados: `proposal_security_controls`, `proposal_api_controls`, `ui_redesign_preview` e `ui_production_activation`.

Os testes usam exclusivamente dados sintéticos, dependências injetadas e mocks. Não importam o servidor completo nem executam suítes antigas de integração com bancos. O build gerou o Prisma Client sem conectar a banco; a URL fornecida ao processo era sintética e apontava para uma porta local não utilizada como banco.

Comandos, na branch de refatoração:

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm run build
node node_modules/vitest/vitest.mjs run tests/ui_support_operational.test.tsx tests/ui_partner_support_v3.test.tsx tests/support_realtime.test.ts tests/support_broadcast_contract.test.ts tests/support_isolation_v3.test.ts tests/ui_support_tools_v3.test.tsx tests/partner_support_transport.test.ts tests/partner_support_client_transport.test.ts tests/proposal_security_controls.test.ts tests/proposal_api_controls.test.ts tests/ui_redesign_preview.test.tsx tests/ui_production_activation.test.ts --maxWorkers=1 --no-file-parallelism
git diff --check
```

## Comparativo sob condições iguais

| Medida | Antes | Depois | Interpretação |
|---|---:|---:|---|
| Altura útil do histórico | 434,9 px | 599,1 px | +37,8% no preview independente, não no shell autenticado completo |
| Largura útil do histórico | 660,5 px | 686,5 px | +3,9% no mesmo viewport |
| Topo do inbox | 334,1 px | 79,6 px | Menos espaço ocupado por cabeçalhos/cartões |
| GETs iniciais da Central | 5 | 3 | Ferramentas fechadas e transporte simulado; -40%; não inclui reconciliação de conexão real |
| Intervalo de polling | 2000 ms | 2000 ms | Carga recorrente não foi reduzida |

Capturas antes/depois e central/portal em viewport móvel de 390 px foram inspecionadas no navegador. Os números não medem latência de produção, volume real, FPS ou tempo de resposta de banco. Não se atribui ganho de desempenho global ao sistema a partir deles.

## Pendências, riscos e aceite

- Pronto para revisão do diff e avaliação do usuário dos lotes 0/1A/1B; sem autorização de publicação nesta etapa.
- Antes de publicar, ensaiar em ambiente dedicado o Pusher real, assinatura/cookies no domínio final, queda e retorno da conexão, revogação/relogin, múltiplas abas e a sessão completa de parceiro. Nada disso foi simulado como se fosse validação de produção.
- Pusher autentica canais na inscrição/reconexão. Revogação imediata de assinatura já aberta depende dos recursos do provedor; mensagens e dados de negócio continuam protegidos nos endpoints de sessão. Broadcasts contêm somente invalidações.
- SSE continua sujeito aos limites de conexão/duração da hospedagem. Não houve alteração de provedor, configuração ou infraestrutura.
- A abertura de Ferramentas exige um clique adicional. Modelos, configuração e seus fluxos permanecem disponíveis; precisa de aceite ergonômico dos operadores.
- Histórico longo ainda não tem virtualização/paginação nova. Não se mudou o contrato nem se prometeu menor custo recorrente do polling.
- O build mantém avisos de chunks grandes do sistema, incluindo shell/ExcelJS; não foram ocultados nem tratados fora deste escopo.
- Nenhuma migration é necessária para este pacote.

## Reversão e próximos lotes

Como não houve publicação nem banco alterado, descartar a integração futura desta branch reverte o pacote. Se for necessário desfazer um commit local, preferir `git revert <SHA-do-commit-de-refatoracao>` na própria branch após verificar o estado e preservar trabalho posterior. Não executar reset/clean no piloto.

Após avaliação destes lotes, recomenda-se lote 2 (componentes/mensagens consistentes) e depois lote 3 (navegação). Cache/carregamento global permanece no lote 4, com budgets e evidências próprios. Não iniciados nesta entrega.
