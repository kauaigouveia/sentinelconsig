# Daycoval — importação semanal automática

**Data:** 16/11/2026

## Problema corrigido
As revisões semanais da planilha Daycoval alteram fórmulas e células auxiliares, gerando novo `formulaHash`. Antes, o banco só podia ter versões cujas assinaturas estivessem hardcoded em `DAYCOVAL_FORMULA_HASHES`. A versão de 13/11/2026 foi comparada com a de 30/10/2026 e mostrou 6 fórmulas modificadas, 2 adicionadas e 3 removidas, com as quatro colunas essenciais da tabela `Consulta1` preservadas.

Esse hash global não é adequado como único critério de compatibilidade técnica de um XLSX que o banco atualiza semanalmente.

## Novo fluxo operacional
1. Integrações → Planilhas de Portabilidade + Refinanciamento → **Daycoval**.
2. Selecionar o arquivo XLSX. A data da versão é sugerida automaticamente pelo nome (ou pelo dia atual se não houver data reconhecível). Conferir apenas se necessário.
3. Clicar em **Importar e ativar**.
4. O backend verifica limites do ZIP (3,5 MB, 45 MB de conteúdo descompactado, sem VBA), abas, colunas obrigatórias, fórmulas financeiras e cálculos de cenário individual e unificação.
5. **Se todos os testes forem aprovados**, registra em `DaycovalWorkbook.automaticValidation` o hash SHA-256 do arquivo, o hash das fórmulas, a versão do validador, os testes aprovados e a data. O XLSX processado substitui a versão ativa **somente no tenant selecionado**.
6. **Se houver incompatibilidade**, devolve o motivo e **não altera** `SystemConfig` da empresa. Não há atualização parcial da versão.
7. Ferramentas de comparação entre versões e ajuste somente da data continuam disponíveis, recolhidas em **Ferramentas avançadas (opcional)**.

## Validações técnicas
- O serviço `daycovalWeeklyValidator` exige as abas `SIMULADOR COM SALDO`, `Base tabelas`, `CALENDARIO`, `Batalha Naval (2)`, a tabela `Consulta1` com `EMPREGADOR`, `TAXA`, `PRAZO` e `minport_%` nas posições esperadas.
- Confere fórmulas em `E20` (taxa retorno), `E21` (nova parcela portabilidade), `E25` (refin) e `E27` (taxa), além dos resultados de tabelas.
- Executa dois cálculos fictícios **sem CPF ou dados de clientes** pelo motor `simulateDaycoval`: contrato individual e unificação de dois contratos. Valida parcelas, taxas, prazos e valores financeiros. Não exige que todos os produtos estejam contratáveis nesse cenário sintético.
- Verifica que a prova persistida corresponde aos hashes **do mesmo arquivo**, protegendo contra uso indevido de uma aprovação de outra versão.
- O hash de versões anteriores continua aceito para não quebrar ambientes existentes.
- `previewPortRefin`, `prepareDaycovalWorkbook` e a correção apenas da data reconhecem as versões aprovadas automaticamente.
- Não há mudanças de schema Prisma, C6, Paraná, Nossa Fintech, cálculo de propostas, regras bancárias ou contratos já salvos.

## Limites
**Validação técnica automática não substitui validação comercial do banco.** O sistema confirma que as fórmulas essenciais e cenários típicos são calculáveis com o motor existente. Não garante que toda política ou tabela semanal esteja vigente, nem que fórmulas alteradas em outros ramos do XLSX funcionem em todos os cenários possíveis. O MASTER/gestor continua responsável por conferir o arquivo oficial, a data e as condições bancárias. Se o banco modificar o motor de maneira incompatível, o sistema bloqueia o upload e informa a falha em vez de aprovar números errados.

## Testes
- `npm run lint` e `npm run build`: aprovados.
- 59 testes em 10 suítes específicas: importação sintética com assinatura nova, mudança de fórmula, preservação de versões anteriores, parcelas individuais/unificadas e auditoria de configuração.
- 101 testes de regressão em 10 suítes adicionais (BI, simulações, segurança, Telegram).
- Os testes **não** ativam o arquivo bancário em produção nem alteram a configuração vigente; a versão 13/11/2026 será instalada somente quando o gestor clicar em **Importar e ativar**.
