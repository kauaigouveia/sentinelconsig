# Revisão final FACTA/V8 — 24/10/2026

**Parecer: BLOQUEADO para publicação conjunta.** FACTA passou nas regressões CLT; V8 tem pendências contratuais explícitas. Não houve chamadas bancárias reais, alterações de banco, merge, push ou deploy.

## Evidências executadas

Commits funcionais revisados: fc0291fc1a51c33a7af352bed624d02d4cf05bc9 e f4ed5b26a532eb91d7d40a7da081a452dab0659d. Execução sequencial com um worker: **204 aprovados, 12 reprovados**, mais **1 teste adicional aprovado** para os botões acessíveis CLT/FGTS. TypeScript e build completos aprovados. Evidências JSON/logs locais em %LOCALAPPDATA%/SentinelConsig/clt-final-review-20261024. A comparação com a main arquivada da investigação anterior (50 aprovados/12 reprovados) confirma os mesmos 12 nomes, sem novas falhas. Não equivale a uma nova execução da main nesta revisão.

FACTA: testes de vínculo único/múltiplo, mesmo empregador com matrículas diferentes, zeros iniciais e alfanuméricos, URL serializada, seleção/etapas e parcelas BRL aprovados. A seleção usa empregador + matrícula exata, revalidados na consulta atual; matrícula vai na análise de política, não como parâmetro inventado na consulta de operações. Parcela 1423,98 permanece 1423.98, independente da margem. Ver testes/facta_clt_employment.test.ts, facta_clt_route.test.ts e facta_clt_selection_ui.test.tsx.

V8: documentação oficial novamente consultada pelo conector de documentação, sem requisições bancárias. GET consult, GET simulation/configs e POST simulation correspondem ao contrato; payload completo usa consult_id, config_id, installment_face_value, disbursed_amount, number_of_installments e provider QI. Valores monetários usam unidade monetária, sem multiplicar/dividir por 100, conforme campos documentados; conversão BRL e separação líquido/bruto/parcela/margem cobertas por mocks. Isso não confirma respostas reais da conta.

Consentimento: SUCCESS + CPF exato + consulta/conexão da empresa permitem simular; WAITING_CONSENT vira pendência de autorização, estados intermediários ficam pendentes, ausência não dispara simulação, REJECTED/FAILED têm resultado próprio. Nenhum termo é criado ou aceito automaticamente. V8 aparece como resultado independente, inclusive pendência/erro, sem remover ofertas dos outros bancos. A busca cobre os últimos 30 dias; não demonstra validade temporal de consentimentos mais antigos.

## Bloqueios V8

1. A documentação CLT chama monthly_interest_rate apenas de taxa mensal, sem confirmar percentual versus fração com exemplo numérico. O código omite a taxa na oferta em vez de convertê-la por suposição. A unidade descrita para FGTS não prova a unidade CLT. Necessária confirmação oficial específica CLT.
2. A página de simulação orienta pré-cálculo antes do POST final, mas o checklist o omite e o schema autenticado está pendente na própria documentação. A implementação não faz pré-cálculo. É necessário confirmar se é etapa opcional; se obrigatória, requer adaptação separada e validação autorizada.
3. Habilitação/permissões da conta, ambiente de homologação e consentimento real não foram validados. Mocks não provam funcionamento bancário. Não foi tentado contornar essa restrição.

Fontes oficiais: [simulação CLT](https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt), [checklist](https://docs.v8sistema.com/guide/crédito-privado-clt/checklist-de-integração-clt), [consentimento](https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento), [status](https://docs.v8sistema.com/guide/crédito-privado-clt/referência-de-status-e-webhooks-clt). Manual FACTA e referências de implementação constam em docs/clt-facta-v8-audit.md.

## Doze falhas preexistentes

| # | Teste | Causa observada |
| --- | --- | --- |
| 1 | `facta_simulations.test.tsx` — combina portabilidade e refin apenas pelo grupo retornado, usando troco líquido | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 2 | `facta_simulations.test.tsx` — portabilidade usa prazo restante sem confundir com prazo do refin | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 3 | `facta_simulations.test.tsx` — não aplica taxa do refinanciamento à tabela de portabilidade isolada | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 4 | `facta_simulations.test.tsx` — combina grupos com diferenças de caixa e espaços sem misturar taxas da portabilidade e refin | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 5 | `facta_simulations.test.tsx` — informa taxas realmente retornadas no prazo selecionado em vez de uma ausência genérica | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 6 | `facta_simulations.test.tsx` — distingue prazo indisponível de ausência de grupos compatíveis | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 7 | `facta_simulations.test.tsx` — com todas as taxas disponíveis não descarta refin por taxa e identifica prazo diferente de 108 meses | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 8 | `facta_simulations.test.tsx` — combina os grupos múltiplos retornados em produção sem duplicar pares ou aceitar nomes parciais | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 9 | `facta_simulations.test.tsx` — distingue portabilidade ausente, benefício incompatível e grupos diferentes | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 10 | `facta_simulations.test.tsx` — preserva a mensagem do banco quando a consulta não retorna tabelas | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 11 | `facta_simulations.test.tsx` — combina o exemplo do manual CIP com taxas e prazos distintos nas duas etapas | Fixtures INSS sem banco de origem; três casos também usam taxa fora da faixa vigente 1,68%. A validação anterior interrompe antes da lógica exercitada. |
| 12 | `product_simulations.test.tsx` — exibe um cartão CLT e um FGTS sem banco no título | Seletor DOM legado removido pela UI anterior; os botões acessíveis CLT/FGTS continuam funcionais (novo teste aprovado). |

As onze primeiras afetam a cobertura de FACTA INSS/portabilidade e não demonstram defeito no CLT. A última cobre a entrada CLT e usa IDs antigos; o teste adicional confirma os callbacks CLT_MULTI/FGTS_MULTI por nome acessível. Não foi identificado impacto dessas falhas em V8 ou isolamento entre empresas. As demais integrações foram verificadas por regressões com mocks, incluindo manutenção de ofertas após falha V8; seu funcionamento real não foi certificado.

## Segurança e limites

Inspeção do conjunto de arquivos e das adições: sem arquivos de credenciais, .env, schema ou migrations; sem chaves privadas, tokens estruturados ou URLs de conexão adicionados. Existem identificadores, nomes e senhas explicitamente sintéticos nas fixtures, não dados operacionais. O novo log V8 contém somente tenant/promotora, código e HTTP status; testes validam a ausência de CPF/token/payload e a sanitização de mensagens CLT. A revisão não é garantia universal sobre logs históricos ou todo o repositório. Nenhuma credencial operacional foi lida para executar os testes.

A entrega visual do rodapé será feita em outra branch, baseada na main, sem os commits bancários. Ruflo não está disponível nas ferramentas desta sessão; não foi substituído por ferramentas globais.
