# CLT: consulta antes do cálculo — entrega para revisão

27/10/2026. Branch `codex/clt-consult-first`, base publicada `03194edc995420b9b262432dbf45e0a9a90754c4`. Implementação local, sem push, merge ou deployment. Nenhuma chamada bancária real, migration, seed, alteração de schema, credencial ou configuração operacional.

## Causas comprovadas e correções

1. A primeira ação enviava SIMULATE e validava valor positivo no frontend e na rota. Agora a ação padrão é REFRESH: CPF, nome e telefone; empregador opcional quando aplicável. Valor e prazo são filtros posteriores opcionais. O botão inicial é CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES.
2. A rota aplicava `simulationAccessEnabled=false` à jornada inteira. O handler existente de settings administra essa configuração junto da Happy e a interface a identifica como acesso Happy. A restrição fica na descoberta Happy e em seus endpoints; a jornada mantém sessão, permissão `simulations.create`, veto ao portal parceiro, empresa existente/ativa e escopo por empresa/ator. Nenhum flag do banco operacional foi alterado. A correção de acesso está no código local; não foi aplicada nem confirmada em produção.
3. O workspace era uma camada com altura integral da janela. Agora é modal centralizado, largura máxima 1152 px, altura máxima 92dvh, fundo escurecido, rolagem interna, bloqueio/restauração da rolagem de fundo e fechamento/foco preservados. Mobile reorganiza campos e permite rolagem interna.
4. As etapas agora publicam consulta, margem/elegibilidade e cálculo separadamente. Após retorno elegível, FACTA, Nossa Fintech e FINANTO podem calcular automaticamente com parâmetros revalidados pelos próprios adaptadores. Não há parcela comum inventada. FACTA usa a margem da matrícula exata; Nossa usa o menor limite disponível/utilizável; FINANTO exige parcela máxima, regra, taxa e prazo retornados. Arredondamento financeiro para baixo, sem estimar margem/taxa/prazo. Múltiplas matrículas FACTA continuam exigindo seleção explícita. Filtros manuais existentes permanecem disponíveis.
5. O acompanhamento recupera os dados do cadastro pelo snapshot cifrado. Ações de uma instituição preservam os resultados das outras em uma nova execução persistente, sem reexecutá-las. O vínculo com a execução anterior é validado no backend por empresa, ator, CPF e estado concluído. Timeout incerto permanece UNKNOWN, sem repetição automática.

## V8

- Usa o serviço de configuração e OAuth existente, sem credenciais novas e sem fixar IDs de tabelas em código.
- POST de consulta implementado com `borrowerDocumentNumber`, `gender`, `birthDate`, `signerName`, `signerEmail`, `signerPhone` e `provider=QI`. Nascimento, sexo e e-mail são solicitados no detalhe V8, não exigidos de todos os bancos na primeira etapa.
- Criar consulta é ação explícita e depende do piloto previamente restrito a usuário/empresa/caso. Não é aceite de consentimento. Nenhum endpoint `/authorize` está liberado pelo adapter.
- Reserva durável por empresa/conexão/caso precede o POST de criação. UUIDs simultâneos, mudanças no nome e novas instâncias não geram outro POST. Após retorno válido, o ID é reutilizado; falha incerta conserva reserva e exige conferência, não reenvio.
- Todos os status documentados são tratados separadamente. REJECTED mostra inelegibilidade e descrição sanitizada, incluindo ausência de vínculo ativo. FAILED é falha técnica. As referências são preservadas também quando a consulta é rejeitada ou não retorna margem válida.
- Configurações são consultadas dinamicamente após SUCCESS e margem positiva. Exibem ID, nome, prazos e taxa bruta, sem inferir percentagem.
- Payload financeiro corrigido: `installment_face_value` OU `disbursed_amount`; o campo inativo é omitido. Não envia juros. O builder valida SUCCESS, CPF, configuração, prazo retornado e margem. O valor ilustrativo 300 não foi fixado como regra.
- A exclusividade dos campos é evidência fornecida pelo responsável a partir de Postman, reproduzida em testes simulados. Não é uma homologação bancária executada pelo Codex.

Fontes públicas consultadas nesta etapa:

- [Consentimento e criação/acompanhamento da consulta](https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento)
- [Configurações, pré-cálculo e simulação](https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt)

## Integrações e limites

FACTA, Nossa e FINANTO receberam derivação automática quando os limites são comprovados; os fluxos legados manuais continuam cobertos por regressão. BMG fica contextual para manter SMS/OTP explícitos e sua elegibilidade própria. Paraná, Presença e Happy mantêm os painéis e regras específicos existentes; **não foi implementada automação financeira integral desses painéis**. CET mensal/anual é preservado na comparação quando já normalizado pelo adaptador, como no Paraná; ausente é exibido como não informado, sem cálculo ou conversão presumida.

O primeiro clique não aceita termos nem envia SMS automaticamente. Autorizações são ações contextuais. Não há criação/contratação automática de propostas.

## Validação executada

- Regressão selecionada: 224 testes, **223 aprovados e uma falha histórica INSS/Happy**. Nenhuma falha nova. A falha espera `INSS Novo`; teste e seletor são os mesmos blobs da main publicada (`eb896144...` e `19a3e3ff...`).
- PostgreSQL real: **10/10 aprovados**, somente no cluster descartável `sentinel_rebuild_ad4813e784917e9e`, banco `sentinel_rebuild_verify`, 127.0.0.1:50650. O guard verifica identidade/diretório/usuário/banco/porta antes das fixtures. Inclui persistência entre instâncias, concorrência, isolamento, conservação de outros bancos e reserva V8 com HTTP mockado. Fixtures próprias removidas pelo teste; clusters preservados. Nenhuma migration.
- Total: **234 testes, 233 aprovados, uma falha histórica**. Chamadas bancárias foram mocks; Prisma foi real somente no banco descartável.
- `npm run lint` (TypeScript), `npm run build` e `git diff --check`: aprovados. Build apenas gera Prisma Client, Vite e esbuild; URL sintética fornecida exclusivamente ao processo de build.
- Preview local 127.0.0.1:5186, fetch bancário substituído por fixtures e destinos não previstos bloqueados. Não é produção nem homologação bancária/autenticada completa.
- Desktop: modal medido em aproximadamente 1152 × 554 CSS px; ação inicial sem parcela abriu o acompanhamento sintético. Viewport mobile de iframe 390 × 844: modal aproximadamente 374 × 777, rolagem interna e nenhum overflow horizontal na primeira etapa, em claro e escuro. A automação de clique dentro do iframe não concluiu o acompanhamento mobile; essa interação permanece pendente. Capturas são reais do harness sintético, não de conversas/clientes reais.
- Evidências locais fora do Git: `%LOCALAPPDATA%/SentinelConsig/clt-consult-first-regression.json`, `clt-consult-first-postgres.json`, `clt-consult-first-build.log` e `clt-consult-first-preview/`.

## Arquivos do pacote

- `server/services/cltFinancialPolicy.ts`: limites financeiros bancários sem estimativas.
- `server/services/cltJourneyRoutes.ts`: contrato de consulta inicial, autorização por escopo e validação das ações.
- `server/services/cltJourneyService.ts`: etapas, cálculo condicionado e recuperação dos resultados de todas as instituições.
- `server/services/productSimulationService.ts`: derivação Nossa/FINANTO e despacho explícito da criação V8.
- `server/services/factaSimulationService.ts`: cálculo pela margem da matrícula selecionada, preservando modo manual.
- `server/services/v8CltSimulationService.ts`: payloads, status, configurações e reserva persistente de criação.
- `src/components/simulation/CltJourneyWorkspace.tsx`: modal, cadastro inicial, filtros posteriores, recuperação e ações V8.
- `src/components/simulation/V8CltConsultation.tsx`: status, referências e configurações sem conversões presumidas.
- `src/lib/cltJourney.ts`: apresentação do estágio real e prioridade dos motivos de elegibilidade.
- Testes: `clt_consult_first.test.ts`, `clt_journey.test.ts`, `clt_journey_postgres.test.ts`, `clt_journey_ui.test.tsx`, `facta_clt_employment.test.ts`, `v8_clt_simulation.test.ts`, `v8_clt_consultation_ui.test.tsx`.
- Este relatório.

## Bloqueios antes de publicação completa da V8

1. Confirmar com a V8 a versão do termo oficial e a evidência legítima de aceite exigida por `/authorize`. A página pública traz um modelo e campos de dispositivo; isso não autoriza inventar evidências nem trocar o aceite do trabalhador por uma confirmação do operador.
2. Confirmar a dependência técnica do pré-cálculo e seu schema autenticado. A documentação orienta uma etapa em host separado, mas não fecha a obrigatoriedade/resposta; não foi implementado payload por tentativa.
3. Confirmar a unidade monetária CLT. A regra de omitir o campo financeiro inativo está resolvida; a unidade da taxa retornada afeta exibição e não é entrada de simulação.
4. Receber a referência segura do caso anunciado e comprovar autorização/consentimento antes de habilitar qualquer chamada real. O piloto continua fechado sem essa configuração.
5. Homologação real controlada e validação autenticada completa em desktop/mobile continuam não executadas. Testes locais não as substituem.

**Parecer:** pacote local preparado para revisão. **V8 completa continua bloqueada para simulação real** (`canSimulate=false`), e a automação integral dos painéis contextuais não deve ser anunciada como concluída. Não houve publicação. Submeter os bloqueios acima ao responsável antes de qualquer merge/deploy.

Reversão: antes da integração, basta não integrar este commit. Após eventual publicação autorizada, usar revert do commit ou rollback do deployment anterior, sem reset destrutivo e sem apagar reservas UNKNOWN ou histórico bancário. Não há rollback de schema/migrations.
