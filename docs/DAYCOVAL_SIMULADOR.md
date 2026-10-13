# Daycoval — simulador por planilha

## Acesso

- Mesa: Simulações → Daycoval · planilha, ou Nova simulação → Daycoval.
- Parceiro: Portal → Simulações → Daycoval · INSS por planilha.
- Importação: usuários com permissão de configurações/administração da empresa e acesso às simulações.

O gestor importa o XLSX completo em **Importar / atualizar planilha semanal**, informa a data da versão e clica em **Ativar planilha**. A configuração é exclusiva da empresa ativa. O parceiro utiliza essa versão e não pode alterá-la. Não existe API bancária Daycoval nem digitação automática neste fluxo.

## Escopo

Portabilidade com refinanciamento, conforme a aba `SIMULADOR COM SALDO` do arquivo fornecido em 09/10/2026. Convênio fixo INSS. Até 17 contratos, saldo devedor, parcela, prazo restante, parcela CIP opcional, margem adicional e valor solicitado opcional para indicação de reassinatura. O valor solicitado não é usado como alvo de liberação — tem o mesmo papel da célula E23 original.

As tabelas e taxas são lidas do arquivo importado. O motor executa as fórmulas compatíveis da planilha, incluindo PROCV, datas, fluxo de caixa e XIRR; não usa resultados financeiros em cache do Excel. A base e o calendário também vêm do XLSX. Não requer Excel, serviço pago ou alteração na VPS.

As fórmulas das abas principal e matriz são identificadas por SHA-256. Uma atualização com mudanças de fórmulas/estrutura é rejeitada antes de substituir a versão ativa. Mudanças somente nos dados de taxas, tabelas e calendário podem ser importadas. O motor suporta este modelo específico, não qualquer arquivo Excel. Arquivos têm limite de 3,5 MB e de expansão ZIP de 45 MB.

As versões com mais de 7 dias exibem aviso. Esse aviso não é uma data de expiração bancária e não impede a consulta. Novo e refinanciamento de carteira não são oferecidos nesta implementação, pois não são o fluxo da aba fornecida.

## Idade

- Até 71 anos: máximo 108 meses.
- 72 anos: máximo 96 meses.
- 73 anos: máximo 84 meses.
- A partir de 74 anos: bloqueado.
- Idade no último vencimento: máximo 80 anos, 11 meses e 29 dias.

Considera nascimento, data da simulação, primeiro vencimento calculado pelo arquivo e o último vencimento. Sem regra específica para invalidez. Prazos dependem também das tabelas INSS importadas.

## Histórico

Quando há oferta elegível com valor líquido positivo, registra automaticamente uma simulação por tentativa, com CPF, parceiro, ofertas elegíveis, resultado completo, entradas, hash e nome da planilha. A referência usa a maior liberação elegível. Repetições da mesma tentativa não duplicam o registro. Ofertas indisponíveis aparecem na tela e no resultado completo, sem contabilizar liberação elegível.

O histórico participa da conciliação com propostas Daycoval do mesmo CPF/parceiro/modalidade, da oferta perdida após 5 dias úteis e do relatório mensal. A atualização semanal não altera resultados já registrados. Cadastro de propostas permanece na esteira existente, com a ADE do banco.

## Conferência realizada

Leitura e recálculo do exemplo do arquivo: 13/10/2026, 108 meses, contratos de R$ 258,40/7 parcelas/R$ 39,62; R$ 599,12/13/R$ 52,10; R$ 840,91/40/R$ 31,50. Na tabela 805971, taxa 1,85%, contrato R$ 5.588,45, saldo R$ 1.698,43, líquido R$ 3.771,99 e parcela refin R$ 123,22. Coincide com os valores fornecidos na planilha. Primeira parcela em 10/12/2026. Isto não confirma todas as combinações possíveis, a digitação bancária ou a configuração/importação de cada empresa em produção.
