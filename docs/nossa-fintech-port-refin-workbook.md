# Nossa Fintech · Portabilidade + refinanciamento V.07

## Acesso

Simulações → PORT + REFIN · Planilhas → Nossa Fintech, também disponível no portal do parceiro.
Importação: Integrações Bancárias → Planilhas → Nossa Fintech. Importar o XLSX V.07 com data de versão; ativação isolada por empresa, utilizando as permissões existentes de gestão de integrações.

## Cálculo

Adaptador servidor: `server/services/nossaFintechWorkbook.ts`. Usa tabelas importadas, data da simulação e fórmulas financeiras equivalentes ao motor V.07, sem executar macros ou confiar em resultados salvos no Excel.

- Um contrato por operação; prazos 84/96/108, com seleção de tabela compatível.
- Parcela refin = parcela original menos margem negativa informada como valor positivo.
- Primeiro vencimento dia 10 do mês seguinte até o segundo dia útil do mês; após esse corte, dia 10 do segundo mês seguinte. Dias úteis consideram apenas fins de semana, como WORKDAY sem feriados na planilha.
- Coeficiente: inverso da soma dos fatores de desconto por dias/30.
- Contrato = parcela / coeficiente; troco bruto = contrato menos saldo.
- IOF reproduz a planilha: 0,38% fixo mais 0,0082% diário sobre amortização, limitado a 365 dias. Preserva inclusive a amortização negativa inicial do arquivo; não é uma revisão tributária.
- Troco líquido = troco bruto menos IOF.
- Percentual mínimo: restantes >=72 → 2%; >=57 → 3%; demais → 5%.
- Troco mínimo da política = (prazo refin - restantes) × parcela refin × percentual mínimo.
- Expansão = novo contrato / saldo - 1.

## Digitação

Todas as condições devem ser atendidas: saldo mínimo, taxa de origem mínima, troco líquido >=100, expansão mínima, troco mínimo da política e prazo refin >= parcelas restantes. Só ofertas elegíveis geram a solicitação no fluxo existente. Não contrata automaticamente no banco.

Saldo mínimo: tabela 205011 → R$2.900; demais taxas <=1,78% → R$13.000; outras → R$4.000.

Correção confirmada pelo usuário: tabela 218004 usa 1,72%, embora H38 do arquivo tenha 1,71%.

Divergência ainda pendente no arquivo: taxa mínima de origem aparece como 0,50%, 0,60% e 0,80%. O adaptador aplica provisoriamente 0,80%, a condição mais restritiva explícita, com aviso visível. Não deve ser descrita como confirmação do banco.

O campo de prazo original não foi reproduzido, pois não participa do cálculo da planilha. A taxa de origem é inferida com as parcelas restantes e a parcela após ajuste da margem, seguindo o motor original.

O hash das fórmulas limita a importação à estrutura analisada. Novas versões com fórmulas diferentes exigem adaptação; taxas e nomes são lidos da aba TABELAS. O XLSX original não é alterado.

## Verificação

Checagem TypeScript (`npm run lint`, que executa `tsc --noEmit`) concluída sem erros. Não foram executados testes automatizados, validação no navegador nem chamadas ao banco. A ativação em produção depende da importação da planilha pela empresa.
