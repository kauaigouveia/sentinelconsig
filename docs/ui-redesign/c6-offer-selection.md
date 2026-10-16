# Seleção das ofertas C6 INSS

A lista C6 usa SimulationOfferCard, com botão Selecionar oferta e indicação da condição selecionada. O estado mantém identificação, nome da tabela, valor liberado, parcela, prazo e taxa da oferta real. Ofertas com valores inválidos não podem ser selecionadas. Comparação da seleção inclui os valores para evitar selecionar visualmente duas condições com identificador repetido.

O rascunho INSS_MULTI aceita C6 em Novo e Refinanciamento. Os handlers existentes Salvar simulação e Seguir para digitação usam essa condição; o envio bancário não é realizado por essa alteração. Portabilidade C6 continua restrita ao simulador por planilha. Alterar dados relevantes invalida a seleção e os resultados C6 anteriores.

Testes locais cobrem seleção, persistência da condição no rascunho, identificadores repetidos e rejeição de dados inválidos/portabilidade via API. Nenhum contrato foi cadastrado no banco nem houve escrita de teste em produção.


## Taxa/prazo e resumo do cliente

A comparação INSS envia a taxa mensal selecionada ao serviço C6. A resposta do banco continua integral na origem, mas somente condições com mesma taxa percentual mensal (tolerância numérica de 0,000001) e mesmo prazo passam para as ofertas. O filtro é feito no servidor e reforçado na exibição. Não é um teto de taxa: selecionar 1,85% não inclui 1,83% ou 1,80%. Sem seleção de taxa, a consulta do portal mantém todas as taxas; regras de espécie e ticket permanecem existentes. A taxa não foi adicionada ao payload bancário sem documentação: é usada para filtrar condições efetivamente retornadas.

Nas ofertas INSS e Port+Refin, resumo fixo fora da área de rolagem mostra nome, CPF parcial, nascimento/idade e condições escolhidas. Em simulação por valor liberado, o resumo identifica valor solicitado em vez de inventar parcela. Nome pode vir da consulta de benefício ou ser preenchido opcionalmente. Sem persistência adicional de dados pessoais. Nenhuma consulta real ao banco ou teste automatizado nesta alteração.

Checagem TypeScript aprovada.
