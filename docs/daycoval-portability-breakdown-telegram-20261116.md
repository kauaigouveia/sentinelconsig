# Portabilidade + refinanciamento: composição das parcelas e verificação semanal Daycoval

## Contexto e evidências fornecidas
Em 16/11/2026, duas capturas mostram a unificação Daycoval de contratos 1+2+4, com "Parcela atual" e "Parcela unificada projetada" indevidamente iguais e sem discriminar redução por contrato. Outra captura da planilha exemplifica as diferenças entre "Valor Parcela", "NOVA PARCELA" e "Parcela do Refin". O operador anexou a versão XLSX Daycoval com data 13/11/2026. Não enviar dados pessoais de clientes nem o arquivo de banco ao repositório.

## Semântica dos valores, conferida contra a lógica do motor
- `SIMULADOR COM SALDO`, célula de entrada da parcela original: `E19` (e colunas seguintes para contratos adicionais).
- Parcela recalculada na portabilidade: `E21` (e colunas seguintes); pode ser diferente da original `E19`.
- Parcela total do refinanciamento: `E25`; é um valor da nova operação, **não** cada parcela portabilizada.
- Simulação existente: `simulateDaycoval` já devolvia `contracts[].newInstallment` a partir da célula calculada em linha 21 e `offers[].installment` da célula E25. A exibição ignorava a distinção e escondia a composição no elemento expansível.
- Taxa de retorno individual: `contracts[].returnRate` proveniente da linha 20.

## Entrega
1. Exibir por contrato portado banco, referência mascarada, parcela original, parcela recalculada, diferença (mantida, reduzida, aumentada ou não informada) e taxa de retorno.
2. Mostrar soma das parcelas originais, soma das parcelas recalculadas e **parcela do novo refinanciamento separada**.
3. Manter a composição visível sem expandir detalhes e incluí-la no texto para o parceiro, sem CPF.
4. Persistir `selectedCondition.portabilityBreakdown`, limitado a 3 contratos, com totais reconstruídos no backend; permitir visualizar composição quando a simulação for reaberta.
5. Corrigir a referência de origem das unificações que não incluem o contrato 1: primeiro contrato **do grupo**, não primeiro de toda a fila.
6. Para arquivos semanais Daycoval, adicionar `POST /api/daycoval/inspect` **somente leitura**, protegido por `integrations.manage`, com parser XLSX e comparação de fórmulas com a versão instalada em `SystemConfig`. A UI "Comparar XLSX novo" mostra célula/contagem de divergências. **Não ativa** fórmula não homologada, não troca taxas, não grava XLSX ou extratos.
7. A opção existente de correção de data apenas cadastral também **não ativa a versão nova**.

## Arquivo de 13/11 — verificação local
- XLSX íntegro como ZIP, sem macro VBA.
- As 19 abas foram identificadas; as abas `SIMULADOR COM SALDO`, `Base tabelas`, `CALENDARIO`, `Batalha Naval (2)` estão presentes.
- A tabela `Consulta1` possui 24 colunas, e as posições 1, 6, 7 e 20 correspondem respectivamente a `EMPREGADOR`, `TAXA`, `PRAZO` e `minport_%`.
- A versão exata das fórmulas e a homologação comercial continuam **não confirmadas** contra o cadastro em produção. Sem o arquivo anterior local, a nova função compara contra a cópia armazenada na configuração ativa da empresa.
- **Não houve importação ou ativação automática** do arquivo do usuário, porque os hashes aprovados são versões anteriores.

## Telegram: viabilidade (projeto futuro; não implementado)
- Já existe o bot SentinelConectaBot, vínculo de parceiro com empresa/tenant, webhooks com segredo e consultas de propostas via texto. **Não há recebimento ou interpretação de extratos PDF no bot hoje.**
- Projeto proposto: receber documento PDF somente em chat privado vinculado; validar `getFile`, MIME e assinatura PDF, limite de tamanho, consentimento, proteção contra replay, upload temporário e exclusão programada; reutilizar o parser e simulador INSS autorizados; apresentar resumo mascarado e acesso por link autenticado para selecionar ofertas, exigindo conferência humana.
- Não enviar CPFs completos, NB ou extratos de volta no texto. Não simular ofertas se a vinculação à empresa/parceiro for revogada. Nunca classificar a estimativa como aprovação bancária.
- Telegram Bot API `getFile` padrão informa limite de download de 20 MB; bots não operam em chats secretos com criptografia ponta a ponta, exigindo cuidados LGPD e política de retenção.
- Esse módulo demanda implementação e testes específicos antes de habilitação; não está em produção nesta entrega.

## Validações
- `npm ci`, `npm run lint`, testes do novo cálculo, interface, persistência e segurança, além de regressões de simulações e BI.
- Sem migração Prisma, sem acessos a dados reais e sem chamadas bancárias.
