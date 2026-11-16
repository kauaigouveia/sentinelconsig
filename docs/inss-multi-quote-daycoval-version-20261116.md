# Entrega 16/11/2026 — Cotações múltiplas e versões Daycoval

## Falhas relatadas
1. Bloqueio `Já existe uma solicitação ... CPF e Parceiro` impedia salvar contratos de origem diferentes de um mesmo cliente.
2. A interface permitia selecionar apenas uma cotação por vez, apesar de o extrato permitir múltiplos contratos.
3. A planilha Daycoval de 13/11 exibia erro de assinatura de fórmulas na importação.

## Correção
- `INSS_MULTI` + `PORT_REFIN`: duplicidade por benefício + banco de origem + número do contrato, sempre restrita ao mesmo `tenantId`, CPF, parceiro e registros pendentes. Uma cotação antiga do mesmo contrato continua protegida; diferentes contratos podem coexistir.
- Seleção de até uma alternativa por contrato, com várias cotações de contratos diferentes. Unificações Daycoval não se misturam com simulações individuais. Salvar envia cada uma sequencialmente e mantém feedback independente em caso de duplicidade ou falha.
- Na tela de resultados, cotações já registradas ficam identificadas, protegidas contra seleção repetida na sessão; o resumo pode incluir três contratos.
- Importação de novo XLSX continua bloqueada se as fórmulas/estrutura divergirem das versões homologadas. Não inferimos compatibilidade pelo nome ou pela data.
- Para **exclusiva correção da data registrada** no arquivo Daycoval **já ativo e compatível**, uma rota e um comando explícitos atualizam apenas `versionDate`, preservando `hash`, `formulaHash`, nome, conteúdo, tabelas, taxas e contratos existentes, com auditoria. Isso **não substitui o XLSX da semana, não atualiza taxas e não homologa um arquivo novo**.
- Não há migrações, mudanças de regras de crédito ou chamadas de contratação.

## Validação
- `npm ci`, `npm run lint` e `npm run build` concluídos com sucesso.
- 22 testes em 5 suítes específicas (seleção, persistência, conflitos, status, rota de metadados) e 117 testes em 11 suítes de regressão selecionadas.
- Testes de POST usam mocks de Prisma, nunca produção. Teste visual ponta a ponta autenticado ainda requer homologação na operação.

## Próxima fase
Retomar o diagnóstico de desempenho sem contratar serviços: carregamento sob demanda de painéis BI, eliminação de sincronização legada desnecessária, paginação real de Propostas e Clientes e medição somente leitura das consultas PostgreSQL. O resultado desta entrega não implica essas otimizações.
