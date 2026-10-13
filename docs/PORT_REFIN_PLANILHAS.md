# PORT + REFIN por planilhas

## Uso e acesso

Mesa: **Simulações → PORT + REFIN · Planilhas**. Portal: **Simulações → PORT + REFIN · Planilhas**. Abas Daycoval, C6 e Paraná usam os dados do cliente ao trocar de banco. Cada banco lê somente a versão ativada para a empresa da sessão. Não há upload na tela do atendente/parceiro.

Atualização: **Integrações Bancárias → PORT + REFIN · Planilhas → banco → Importar e ativar**. Somente MASTER da empresa ou PLATFORM_MASTER no contexto autorizado. O servidor verifica o perfil; permissões personalizadas de GESTOR/GERENTE não permitem importação/ativação. Também é possível desativar a planilha. Cada banco possui configuração separada, com data, nome, hash e ativação. A ativação considera arquivos antigos sem atributo `enabled` como ativos para preservar a configuração Daycoval já existente.

As planilhas são armazenadas como células e fórmulas compactadas, com recálculo no servidor. Resultados financeiros em cache do Excel não são usados. As fórmulas são verificadas contra os modelos fornecidos. Alterações na estrutura/fórmulas exigem adaptação antes de ativar; atualizações dos dados/taxas preservando o modelo são aceitas. Não executa macros, não necessita Excel instalado e não requer serviços pagos.

## Modelos fornecidos

- Daycoval: `DAYCOVAL-SIMULADORES-V- 09102026.xlsx`, aba SIMULADOR COM SALDO. INSS fixo, até 17 contratos e regras de idade já definidas. Detalhes em DAYCOVAL_SIMULADOR.md.
- C6: `C6 03.07.26.xlsm`. Apesar da extensão, o arquivo enviado não contém vbaProject. Fórmulas nas abas Simulador Port, Planilha 1, PZO e VL_PARC. INSS fixo e prazo de refin de 108 meses conforme o modelo. Calcula um contrato, duas alternativas de portabilidade (otimização de prazo/redução de parcela) e condições elegíveis de refin. Mantém as regras existentes de espécies 32/92 e ticket pelo valor líquido usando o nome completo da tabela. Não aplica a política de idade Daycoval ao C6.
- Paraná: `Simulador_Port_Refin_Convênios_CM (1) (1).xlsx`. Convênio fixo INSS, sem seguro, usando a primeira área do simulador com saldo devedor. Lê premissas INSS de prazo/parcela/taxa, corte, vencimento e IOF. Calcula um contrato, com taxa de refin informada e parcela refin = parcela original + margem adicional. Retorna uma condição, não uma lista fictícia de tabelas. Os valores são estimados conforme o próprio arquivo. Não aplica a política de idade Daycoval ao Paraná.

O código do empregador do Paraná não é apresentado como código de tabela/proposta. IDs de cenários C6/Paraná são identificadores locais do simulador. A digitação bancária continua manual; nenhum resultado é apresentado como ADE.

## API e histórico

- C6 não consulta API para PORT/PORT_REFIN. API permanece em Novo/Refin de carteira. A verificação acontece antes de consultar credenciais/token.
- A comparação INSS no portal também pode incorporar condições das planilhas ativas em PORT_REFIN, preservando as outras integrações. C6 usa 108 meses nesse modelo mesmo quando outros bancos usam outro prazo.
- Cada tentativa com oferta elegível positiva é registrada com parceiro, entradas, condições, versão e maior valor elegível como referência. Tentativas repetidas não duplicam o registro.
- Histórico da mesa usa SPREADSHEET_INSS; portal mantém PARTNER_AUTO. Registros antigos DAYCOVAL_INSS continuam válidos. Os três participam da conciliação com ADE, expiração após 5 dias úteis e relatório mensal. Atualizações dos arquivos não recalculam históricos.
- A comparação do banco/proposta normaliza acentos para Paraná/Parana.

## Conferência de cálculo

Leitura dos dois modelos e execução das suas fórmulas com exemplo de saldo R$10.000, parcela R$250, 60 parcelas restantes, data 13/10/2026:

- C6: 108 meses, espécie 41, tabela Flex 5; valor refin R$12.397,67, IOF R$101,82, líquido R$2.295,85. Cenas de otimização/redução preservadas separadamente. O primeiro vencimento decorre do calendário C6: 07/01/2027.
- Paraná: 108 meses, taxa refin 1,85%; valor refin R$11.338,36, IOF sobre troco R$41,37, líquido R$1.296,99, vencimento 10/12/2026 e mensagem de enquadramento da política do arquivo.

Conferência limitada à leitura/recálculo desses exemplos e checagem de tipos/build; não comprova todos os casos, digitação bancária ou importação autenticada em produção.

## Paraná: regras complementares

Taxas selecionáveis em passos de 0,01 ponto percentual dentro dos limites da planilha ativa, com teto de 1,85% a.m. Espécies do INSS reutilizam o cadastro existente. Não há validação de vigência do benefício.

Para PORT + REFIN: mínimo de 18 anos, máximo de 77 anos, 11 meses e 29 dias no último vencimento, até 13 contratos por benefício e troco mínimo de R$ 100. Parcela de portabilidade mínima de R$ 120, ou R$ 15 para espécies 32/92. Margem negativa exige informar parcela enquadrada, sem aumentar a parcela da portabilidade. Margem adicional se aplica somente ao refinanciamento. Formalização exclusivamente digital.

O formulário específico coleta a quantidade total de contratos; o comparador geral orienta abrir PORT + REFIN · Planilhas para Paraná. Regras de Novo e Refin isolado não representam novas modalidades disponíveis.
