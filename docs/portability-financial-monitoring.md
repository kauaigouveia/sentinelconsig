# Acompanhamento financeiro de portabilidade

A tela Portabilidade (CIP) apresenta dois grupos de cartões com valores e quantidades: saldo devedor de portabilidade e troco do refinanciamento da portabilidade. Cada grupo tem Em andamento, Pendente, Pago e Reprovado; Cancelado e Sem classificação são exibidos quando houver registros.

## Base e cálculo

Usa a carteira carregada no StorageService da empresa atual, incluindo propostas finais; a API existente de propostas não é paginada. Os dados acompanham o evento de atualização de armazenamento já utilizado pela tela.

- Saldo: apenas propostas primárias de portabilidade, usando contractBalance ou debtBalance quando o primeiro não está informado.
- Troco: apenas propostas de refinanciamento da portabilidade, usando disbursedValue.
- A proposta de refinanciamento não volta a somar o saldo da proposta principal.
- Não há soma de valor bruto como se fosse saldo ou troco, nem vínculo inferido por CPF.
- Cada proposta contribui apenas para seu segmento e sua situação atual; não é um histórico de movimentações por período.
- Valores ausentes, inválidos ou negativos não entram na soma e a quantidade sem valor é sinalizada. Zero é um valor informado.

## Situações

Códigos PAGO, REPROVADO/REPROVADA/RECUSADO/RECUSADA e CANCELADO/CANCELADA têm prioridade. Categorias padrão PAGO, RECUSADO e CANCELADO cobrem status personalizados.

Pendente: categoria PENDENTE, código/nome iniciado em PENDENT, ou alçada CLIENTE/PARCEIRO, desde que não final. Em andamento: demais status abertos conhecidos. Status final desconhecido ou sem configuração fica Sem classificação. Canceladas não são agrupadas como reprovadas.

Os totais superiores são somente valores em aberto (andamento + pendente). Clicar no cartão filtra a lista por segmento/situação e volta a Todas no SLA. Clicar novamente limpa o filtro; os filtros CIP também limpam a seleção financeira. A lista mantém a abertura do detalhe da proposta e o cron CIP existentes.

## Verificação

Checagem TypeScript (`npm run lint` / `tsc --noEmit`) concluída sem erros. Não foram adicionados nem executados testes automatizados. Validação em navegador e conferência dos valores da carteira de produção não foram executadas nesta implementação.
