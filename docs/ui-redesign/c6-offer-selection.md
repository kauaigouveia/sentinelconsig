# Seleção das ofertas C6 INSS

A lista C6 usa SimulationOfferCard, com botão Selecionar oferta e indicação da condição selecionada. O estado mantém identificação, nome da tabela, valor liberado, parcela, prazo e taxa da oferta real. Ofertas com valores inválidos não podem ser selecionadas. Comparação da seleção inclui os valores para evitar selecionar visualmente duas condições com identificador repetido.

O rascunho INSS_MULTI aceita C6 em Novo e Refinanciamento. Os handlers existentes Salvar simulação e Seguir para digitação usam essa condição; o envio bancário não é realizado por essa alteração. Portabilidade C6 continua restrita ao simulador por planilha. Alterar dados relevantes invalida a seleção e os resultados C6 anteriores.

Testes locais cobrem seleção, persistência da condição no rascunho, identificadores repetidos e rejeição de dados inválidos/portabilidade via API. Nenhum contrato foi cadastrado no banco nem houve escrita de teste em produção.
