# INSS — Leitura e salvamento das cotações de Portabilidade + Refinanciamento (16/11/2026)

## Material de homologação

- Captura da planilha ilustrando cenários individuais, taxa/coeficiente, nova parcela, valor contratado, saldo devedor e líquido do cliente.
- Captura do Sentinel mostrando os resultados de Paraná e Daycoval com botão **Selecionar** desabilitado, números de taxa de ponto flutuante e pouca hierarquia informativa.
- Extrato INSS textual de teste recebido no atendimento: **4 empréstimos**. Conferência sem reproduzir nome, CPF ou benefício. A parcela de R$ 30,00 e o banco de origem 237 aparecem no resultado da captura. Este documento não contém os identificadores do cliente.

## Causa técnica

1. `PortabilityResults.tsx` desabilitava a seleção de qualquer cotação `requiresReview`, inclusive para salvamento como estimativa.
2. `NossaFintechPortRefinSimulationModal.tsx` repetia esse bloqueio no comando Salvar.
3. `inssSimulationDraft` admitia C6 apenas em NOVO/REFIN API, mas não distinguia C6 por planilha. DAYCOVAL e PARANA de planilha estavam fora da lista de provedores admitidos no POST `/api/simulations`.
4. Algumas taxas com ponto flutuante eram exibidas como `1.8500000000000003%`.
5. Em cotações unificadas Daycoval, faltava o `sourceForm` e a lista original de contratos, impossibilitando recuperar com segurança o contexto ao salvar.

## Entrega técnica

- **Resultados:** agrupamento por contrato e banco, destaque para troco estimado, parcela atual, parcela do refinanciamento, prazo e taxa mensal; condição principal priorizada e alternativas dentro de expansão. Filtragem e paginação antigas mantidas.
- **Comunicação com parceiro:** resumo de cotação selecionada com botão de cópia; rótulo explícito de estimativa, sem expor CPF integral nesse texto.
- **Seleção:** permite selecionar e salvar resultados financeiros positivos mesmo quando a documentação exige conferência. Continua bloqueando troco zero/negativo e cálculo inválido.
- **Provedores separados:** `DAYCOVAL`, `C6_PLANILHA`, `PARANA_PLANILHA` recebem `quoteKind: SPREADSHEET_ESTIMATE`, `reviewRequired: true` e `reviewState: PENDING`; os contratos C6 API e Paraná API preservam suas regras específicas. Cotação por planilha exige `PORT_REFIN`.
- **Persistência:** o backend sanitiza as condições e marca a cotação como pendente no `customerData.quoteReview`. Mantém a checagem de parceiro ativo **na mesma empresa** e o controle de permissões. A criação de uma simulação não aciona APIs de contratação.
- **Composição:** origens dos contratos da unificação Daycoval preservadas e limitadas a três itens no histórico persistido; sem incluir campos arbitrários do cliente.
- **Fila e detalhe:** rótulo “Cotação em conferência”; aviso explícito para validar antes de prosseguir.
- **Compatibilidade:** nenhuma migração Prisma, alteração de índice, credencial bancária ou execução de proposta.

## Advertências operacionais

A cotação salva usa o fluxo existente de registro `INSS_MULTI` e o status de base `SIMULAÇÃO ENVIADA`, acrescido de marcador de conferência pendente. **Esse status não equivale a aprovação bancária.** O atalho de seguir diretamente para digitação é ocultado enquanto existe conferência pendente; demais decisões operacionais humanas exigem validação do responsável.

Os resultados são calculados pelas planilhas e roteiros atualmente configurados por empresa. Estas alterações não revalidam comercialmente a vigência das planilhas, não recalculam taxas nem alteram a elegibilidade. Não houve consulta ou gravação com os dados reais do PDF em produção.

## Próximo trabalho após concluir esta entrega

Retomar o **Diagnóstico inicial do Sentinel Consig**: localização efetiva do PostgreSQL, latência banco/Vercel, execução em lotes do BI (16 requisições), sincronização legada de 17 endpoints, consultas paginadas, estimativa de tamanho/conexões, `EXPLAIN` somente leitura e índices medidos. Somente propor mudanças sem custos e sem risco de dados.
