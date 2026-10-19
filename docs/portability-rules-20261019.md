# Regras de portabilidade recebidas em 19/10/2026

Fonte: transcrição fornecida pela empresa, começando em “1. DIGIO” e terminando na taxa de portabilidade da FINANTO. Não representa pesquisa externa nem liberação de API.

## Base única

- `src/data/portabilityRules20261019.json`: texto recebido, linhas de consulta e critérios estruturados de 13 bancos.
- `src/lib/portabilityPolicy.ts`: avaliação comum por origem, pagas, modalidade, idade, espécie, valores, taxas, margem, residência e quantidade de contratos.
- `src/lib/portabilitySimulationPolicy.ts`: normalização dos diferentes formulários e retornos, sem misturar taxa da portabilidade com taxa do refin.
- `src/lib/portabilityPlaybooks.ts`: quatro blocos de consulta por banco: idade/benefício/formalização; origem/pagas; valores/taxas; operação/restrições. Bancos sem PDF recebem transcrição sem link de PDF fictício.

Os critérios novos têm precedência para portabilidade nos bancos atualizados. As regras de Novo e refinanciamento comum não são substituídas por esta atualização. Inter e Diga permanecem na referência anterior, pois não vieram no material novo.

## Simulações

Os controles são usados na comparação do portal, FACTA, FINANTO, Nossa Fintech, Happy e nas planilhas Daycoval/C6/Paraná. A conferência prévia avalia os dados disponíveis; a conferência de ofertas inclui troco, bruto, parcela e taxa efetivamente retornados. Uma condição vedada não deve permanecer como oferta elegível.

Foram incluídos dados adicionais de enquadramento em seção recolhida: UF, concessão do benefício, sexo, classificação declarada da origem (rede/CORBAN), margem disponível e perícia. A Happy também recebe banco de origem e parcelas pagas. A API recebe somente seus parâmetros previstos, sem os metadados internos de enquadramento.

O painel de roteiros mostra os 13 bancos, inclusive sem API ativa, com restrições e pendências. Não gera oferta fictícia nem aprovação. Dados ausentes, regras documentais, SRCC, formalização e exceções médicas permanecem sujeitos à conferência da mesa. A data de perícia não substitui a análise do documento.

## Ressalvas preservadas

- DIGIO informa espécies **32 e 93**; não houve correção silenciosa para 92. Saldo mínimo ficou em branco e exige conferência.
- ICRED: ponderação de taxa sem fórmula operacional completa; sexo define tabela a partir dos 60 anos.
- Happy: tabelas de saldo a 1,75% e 1,71% conflitam com faixa geral do refin (1,77%–1,85%). Preservadas como condições a conferir, sem inventar interpolação de mínimos.
- Quali: saldo ≥ R$ 6.000 menciona zero pagas, enquanto “demais bancos” menciona uma. A exceção permanece sob revisão; acordos individualizados são preservados. Regra percentual do troco não foi convertida em fórmula presumida.
- Havecred: “R$ 50 ou 5%” depende de interpretação comercial; não se presume que o mínimo fixo seja a única alternativa.
- PB Consignado: bancos específicos com 13 pagas não foram listados. Não foram inventadas instituições para esse grupo. C6 exige 25 pagas conforme regra explícita.
- FACTA: “outros listados” com 15 pagas não vieram individualizados. Só foram aplicadas automaticamente as origens identificáveis e classificações declaradas.
- FINANTO: o arquivo termina em “Taxa de Portabilidade: 1,85% a 1,10%”. Não vieram taxa de refin nem mínimos financeiros. Campos ausentes não foram preenchidos com supostos valores novos.
- Prazos e idades no término usam data de término informada, ou estimativa por meses desde a simulação quando ausente. A contratação exige confirmação da data efetiva do último vencimento.

Esta atualização não ativa produtos bancários suspensos e não realiza chamadas reais de simulação durante a implementação.
