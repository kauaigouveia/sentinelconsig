# Jornada CLT — publicação autorizada e piloto V8 restrito

26/10/2026. Base do PR #1: `dfda3a4`. Main publicada antes desta entrega: `6e10f4c91d07076ae5d105bd4af4706dd2abcfb8`. A autorização atual substitui a demonstração individual: publicar a jornada operacional para usuários com permissão de simulação, na infraestrutura existente. A branch de demonstração `codex/clt-admin-demo` permanece preservada e não integra este pacote.

## Jornada publicada

- Cadastro único, ação principal, resultados progressivos, cartões independentes, ações contextuais e comparação de até três ofertas.
- Backend continua exigindo sessão interna, empresa efetiva e `simulations.create`; parceiro não utiliza a rota interna. Estado cifrado e reservas transacionais permanecem isolados por empresa e ator.
- Recuperação é GET, sem repetição automática do POST. Reservas READY abandonadas também passam a UNKNOWN; erro técnico retornado como linha não transforma uma execução incerta em concluída com possibilidade de repetição automática.
- Projeção de respostas preserva opções de vínculos e flags/restrições de elegibilidade necessárias aos cartões, excluindo credenciais/campos arbitrários dos provedores.
- As correções FACTA publicadas, permissões, schema, migrations e configuração de build/cron não foram substituídos por versões antigas.

## V8: acesso individual não equivale a contrato homologado

O usuário e a empresa foram identificados por `/api/auth/session` na sessão real autorizada. Somente seus IDs imutáveis são usados nas configurações privadas `V8_CLT_PILOT_USER_ID` e `V8_CLT_PILOT_TENANT_ID`; não há fallback por e-mail, nome, papel administrativo ou primeiro usuário que acessar.

`V8_CLT_PILOT_CASE_SHA256` deve conter o SHA-256 do documento normalizado de um caso de teste explicitamente autorizado. Esse valor só pode ser preparado a partir da referência segura fornecida pelo responsável e depois da comprovação do consentimento legítimo. Não armazenar CPF, prova de consentimento, hash do caso ou credenciais no Git/logs/Ruflo. Nesta entrega, a referência foi anunciada mas ainda não fornecida; o hash não é preenchido por suposição.

Antes de ler configuração/credencial bancária, o adaptador valida a combinação empresa/ator e o caso, revalida o usuário administrativo ativo e estabelece um contexto interno de execução. Chamadas diretas ao request adapter, sem esse contexto, são bloqueadas. Sessão de parceiro, outro usuário, outra empresa, outro caso ou configuração incompleta não chegam a OAuth/consulta/simulação.

A descoberta local da V8 não executa banco. Seu cartão é contextual: o botão principal multibancos não inicia consultas V8 automaticamente. Apenas o usuário/empresa autorizados veem a disponibilidade do caso no endpoint autenticado `/api/simulations/clt/v8/pilot`. Nenhum identificador de cliente ou credencial é retornado por essa capability.

Na tela: Simulações → Nova simulação → Crédito do trabalhador → cartão V8 → Abrir detalhes. **Conferir caso V8 autorizado** só pode ser usado depois de configurar o caso aprovado. O backend confere o CPF autorizado, o consentimento/consulta da própria conexão e as respostas de margem/eligibilidade. **Simular caso V8 autorizado** também exige contrato confirmado. Nenhuma ação é executada ao abrir a tela, selecionar cartão ou recuperar o acompanhamento.

### Bloqueio contratual preservado

`V8CltSimulationService.canSimulate()` permanece false. Isso é deliberado e não é um bloqueio por falta de taxa de juros. O POST exige somente os seis campos documentados; o Sentinel não exige taxa como entrada nem transforma taxa retornada sem unidade comprovada.

A documentação oficial foi consultada novamente pelo conector V8. A página de simulação orienta pré-calcular antes do POST completo; o checklist não inclui essa etapa. Não esclarece a obrigatoriedade técnica, o schema autenticado de sucesso nem a semântica do campo financeiro inativo. O exemplo genérico com zeros não comprova zero versus null versus omissão, nem resolve a unidade monetária por si só. Não foram enviados valores para descobrir o contrato por tentativa.

Perguntas à V8 antes de liberar o POST:
1. O pré-cálculo é tecnicamente obrigatório? Se sim, confirmar host de produção, resposta de sucesso, identificadores e validade que vinculam o POST final.
2. Os campos monetários CLT estão em reais/unidade monetária ou centavos?
3. No modo parcela e no modo desembolso, qual valor exato deve ser usado para o campo financeiro não utilizado: zero, null ou omissão?

Fonte: https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt e https://docs.v8sistema.com/guide/crédito-privado-clt/checklist-de-integração-clt . O conteúdo consultado é documentação, não homologação autenticada. Até resolver essas pendências, nenhum operador, inclusive o autorizado, pode enviar o POST V8 pelo adaptador. Nenhum pré-cálculo foi implementado por suposição.

## Validação executada

- Suíte focada: 187 testes, 186 aprovados e uma falha histórica do seletor INSS/Happy, idêntica à main. Nenhuma falha nova.
- Oito testes adicionais com Prisma real no segundo PostgreSQL descartável, protegido pelo guard existente; todos aprovados. Somente fixtures sintéticas próprias, sem migrations. Total consolidado: 195 testes, 194 aprovados e uma falha histórica.
- Testes de banco usam mocks de HTTP externo. Nenhuma chamada a OAuth, consentimento, SMS, pré-cálculo, simulação ou proposta bancária real foi executada durante a preparação/deploy.
- Testes verificam isolamento do piloto, caso errado, usuário inativo/rebaixado, chamada sem contexto, trava contratual antes de credenciais, campos de vínculo/restrição e UNKNOWN. Testes existentes de FACTA, RBAC, propostas, SSE e demais provedores pertinentes foram repetidos.
- TypeScript, build de produção e git diff --check aprovados. Build usa URL sintética apenas no processo e executa geração do cliente Prisma, Vite e esbuild; não aplica schema, migrations ou seeds.

## Publicação, smoke e rollback

Somente o PR #1 e os ajustes deste pacote devem avançar para a main por merge e push normal, preservando histórico e alterações locais. Nenhuma migration experimental, arquivo local V8 não versionado, .env ou configuração Ruflo deve ser incluído. Não criar infraestrutura ou alterar credenciais bancárias existentes.

Antes do push, reconfirmar a main remota. Validar que a árvore do merge corresponde à árvore testada. Acompanhar Vercel até READY e conferir `/api/health`, HTML e assets sem executar simulações. Com a sessão existente, conferir apenas a capability do piloto; isso não chama banco.

Rollback de referência: deployment `dpl_4zBtWttiCsxbg4YUjH5aG6mDUj6G`, SHA `6e10f4c91d07076ae5d105bd4af4706dd2abcfb8`, READY/candidato de rollback antes desta publicação. Um rollback de deployment não requer operações no banco; o código anterior ignora o namespace de snapshots. Preservar registros incertos, não apagar reservas para forçar repetição. Reversão de Git, se necessária, deve ser commit de revert, nunca force push/reset destrutivo.

Não executar automaticamente testes bancários após READY. A publicação da jornada não significa que a simulação V8 foi liberada ou homologada: a capability deve indicar escopo autorizado, caso pendente e contrato pendente enquanto essas condições persistirem.

Limitações restantes: primeiro uso da jornada operacional na Vercel ainda requer acompanhamento humano; os painéis contextuais preservam seus próprios fluxos e sua recuperação específica não é o ledger central. Rotação de segredo/retenção das reservas exige estratégia própria. Não declarar idempotência exatamente uma vez em instituições externas. A falha histórica INSS/Happy continua documentada, não ocultada.
