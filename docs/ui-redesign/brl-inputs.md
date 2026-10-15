# Entrada monetária BRL

Os simuladores INSS Novo, PORT + REFIN, planilhas Daycoval/C6/Paraná, CLT e campos monetários Happy/BMG usam CurrencyInput. Valores colados como `24.188,18` ou `R$ 24.188,18` aparecem como `24.188,18` e mantêm `24188.18` no estado enviado às APIs. Digitação manual é formatada com duas casas ao sair do campo. Campo vazio permanece vazio. Prazos, códigos e taxas mantêm seus controles originais.

Não foram alteradas fórmulas, contratos HTTP ou integrações. Testes locais cobrem colagem, digitação, separadores, casas decimais, limpeza, mínimos e rejeição de valores malformados. Não houve chamadas bancárias reais nem escritas de teste em produção.
