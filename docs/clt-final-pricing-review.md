# CLT VCTEX e V8 — condições personalizadas e ofertas originais

Base: `8ca6b1cb3eff77c73b673df11caec13da87cfe83`. Alteração restrita à main, sem novas dependências, schema, migrations, credenciais, Oracle ou chamadas bancárias reais.

## Diagnóstico comprovado e limites da evidência

- **Ofertas originais:** o resultado único `rows` era substituído no início de um cálculo personalizado. Sem um conjunto separado, limpar o formulário não poderia recuperar as ofertas originais. Regressão falhou antes da correção. Agora `consultations`, `originalOffers` e `rows`/request da execução personalizada são separados no snapshot cifrado existente. A consulta e o histórico não são apagados.
- **V8 por parcela:** o payload existente já utilizava `installment_face_value` e preservava o valor solicitado. Uma rejeição em um prazo encerrava o laço inteiro, impedindo verificar os outros prazos/configurações. Regressão reproduzida com HTTP 422 no primeiro prazo e uma oferta válida no segundo. Rejeições financeiras definitivas 400/422 agora são persistidas como resultado concluído dentro da reserva de idempotência e permitem verificar condições distintas. Falha de transporte, esquema inválido, permissão ou resultado incerto continuam interrompendo; nenhum POST incerto é repetido.
- **V8 por valor liberado:** o contrato e o builder existentes usam `disbursed_amount` no mesmo POST. Não foi comprovado um campo ou endpoint incorreto. O defeito de interrupção por condição também afetava esta modalidade. Teste sintético de R$ 3.000 confirma o payload específico e uma oferta de parcela R$ 150 dentro de margem R$ 529,93; não é evidência da resposta de produção relatada.
- **VCTEX R$ 529:** não houve acesso à resposta do caso operacional. Não é possível atribuir uma causa única ao episódio. Margem R$ 529,94 não substitui o limite de cada tabela. Mocks pelo transporte Oracle comprovam solicitações independentes de 150/200/300/529 quando a tabela admite. Outro teste comprova rejeição local de 529 quando o máximo retornado da tabela é 500, sem POST financeiro. O diagnóstico antes genérico agora distingue limites, ausência de tabela/prazo, rejeição do banco, falha e resposta recuperada. Payload e regras financeiras não foram afrouxados.

## Contrato documental V8

Fonte oficial consultada através do conector documental V8, sem autenticação bancária:
https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt

Ambas as modalidades usam POST https://bff.v8sistema.com/private-consignment/simulation. `consult_id` vem da consulta autorizada SUCCESS, `config_id` da configuração vigente e `number_of_installments` de seus prazos. Envia-se `installment_face_value` OU `disbursed_amount`, mantendo provider QI e sem taxa como entrada. Valores financeiros preservam a escala já comprovada no contrato/fixtures existentes; nenhum valor foi multiplicado por 100. Não foram inventados endpoints, novos pré-cálculos ou limites ausentes. Não foi realizada nova homologação da unidade financeira ou da eventual dependência de pré-cálculo com a API real.

## Interface e persistência

- Ação Ver ofertas originais e retorno à simulação personalizada, sem nova chamada bancária pela ação de visualização.
- Limpar o valor financeiro retorna à visualização original. Banco individual continua filtrando todos os resultados; Todos os bancos continua explícito.
- Originais são copiados para a nova execução e permanecem no armazenamento cifrado, no mesmo escopo tenant/usuário. Dados antigos sem originais verificáveis não são fabricados a partir de cálculos personalizados.
- Consulta vencida/rejeitada e vínculo inelegível invalidam apenas as ofertas associadas; a revisão oficial mais recente continua prevalecendo sobre respostas atrasadas.
- Diagnóstico secundário: modalidade, valor, prazo, endpoint com IDs omitidos, parâmetros financeiros permitidos, HTTP observado, recebidas, aceitas pelo adapter e quantidade no resultado/exibida. Limites da tabela são numéricos. Não contém CPF, nome, telefone, e-mail, credenciais, tokens ou corpo de erro bancário.
- Códigos distinguem API_ZERO_OFFERS, BANK_REJECTED, API_ERROR, BACKEND_DISCARDED, OUTSIDE_LIMITS, TERM_UNAVAILABLE, NO_ACTIVE_RATES e CACHED. HTTP desconhecido/cache não é inventado. HTTP 200 com array vazio é registrado como resposta vazia; objeto financeiro inválido continua sendo rejeitado.

## Validação

168 testes aprovados em oito arquivos afetados (um worker): clt_bank_scope_backend, v8_clt_simulation, vctex_clt, clt_bank_scope, clt_reprice_http, clt_reprice_workspace, clt_persistent_ui, clt_uniform_presentation. Incluem HTTP Express real com persistência injetada, mocks bancários pelo Oracle, isolamento tenant/ator, vínculo, refresh, idempotência, condições diferentes e interface em DOM simulado. A antiga asserção HTTP que proibia originais em todo JSON foi atualizada para proibir sua mistura em rows e exigir a preservação em originalOffers.

TypeScript/lint, build e git diff --check aprovados. Build com avisos de tamanho dos chunks e imports estáticos/dinâmicos, sem falha. Nenhuma suíte com banco real ou de operações foi executada. Não há captura desktop/mobile de navegador autenticado nem confirmação de condições ofertadas em produção.

## Continuidade e reversão

Necessária homologação autorizada para comparar o diagnóstico sanitizado dos casos reais de VCTEX 529 e V8 150/3000. Sem evidência bancária, não afirmar que todas essas condições devem gerar ofertas. Limites e elegibilidade permanecem soberanos. Reversão por git revert do commit e push normal, preservando reservas e históricos. Não aguardar nem consultar o READY da Vercel nesta entrega.
