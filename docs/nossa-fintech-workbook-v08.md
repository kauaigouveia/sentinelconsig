# Nossa Fintech V.08 — correção de importação

## Causa comprovada
As versões V.07 e V.08 têm a mesma assinatura de fórmulas (`6509696590f2399404432fda9aa6ac9a1154c6331e7970ad61cfccc0ef5b5a90`). A rejeição era posterior: `nossaWorkbookTables` exigia nomes em todas as linhas B2:B48, correspondentes às 47 tabelas da V.07. Na V.08, a lista ativa termina em B21 (20 tabelas); B22 é vazia. O parser interpretava a linha vazia como estrutura inválida.

O cadastro auxiliar de códigos/taxas em E:H ainda contém 47 registros, incluindo tabelas antigas que não pertencem à lista ativa da V.08. Ele não pode ser utilizado para reativá-las.

## Correção
- Percorrer a lista ativa em B, permitindo linhas vazias e rejeitando nomes não vazios malformados.
- Resolver a taxa por código no cadastro auxiliar; rejeitar taxas ausentes, inválidas ou conflitantes e códigos ativos duplicados.
- Não transformar registros auxiliares em ofertas ativas.
- Derivar prazos da lista ativa durante a importação, sem manter 84/96 automaticamente quando o arquivo só contém 108.
- Preservar a correção explicitamente existente para a tabela 218004 da V.07; ela não entra nas opções V.08, pois não integra sua lista ativa.
- Preservar a chave interna de configuração existente, evitando abandonar planilhas já configuradas por empresa. Não criar um segundo cadastro V.08.
- Manter a assinatura de fórmulas original e limitar a leitura de dimensões inconsistentes da aba. Nenhuma alteração de taxas, fórmulas financeiras, elegibilidade, schema ou banco operacional.

## Verificação com os arquivos reais, somente leitura
- V.07: importação aceita, 47 códigos ativos, 63 combinações tabela/prazo, prazos 108/96/84.
- V.08: importação aceita, 20 códigos ativos e 20 combinações, somente 108 meses; 12 tabelas regulares e 8 de invalidez.
- Código 219002, ainda presente no cadastro auxiliar, não é oferecido na V.08.
- Os arquivos XLSX originais não foram editados, exportados novamente nem ativados em produção.

## Testes
Cobertura de catálogo menor, ausência de reativação de tabelas antigas, prazos, invalidez, compatibilidade V.07, nomes inválidos, duplicidade de código, taxas ausentes/inválidas/conflitantes, lista vazia, imutabilidade do arquivo em memória, dimensões excessivas, rejeição de tabela inativa e de prazo incompatível. Regressões Daycoval, intérprete, fluxo HTTP e tenant também executadas.

Os testes não representam consulta bancária ou homologação financeira nova da V.08. A implementação financeira existente não foi substituída.

## Publicação
Correção preparada junto da adaptação Daycoval na branch `codex/daycoval-workbook-20261030`, sem commit, push ou deploy nesta etapa. Após revisão/publicação, importar novamente a V.08 pela tela existente. Não é necessário alterar o arquivo Excel para preencher as linhas antigas.

Resultado final: 53 testes distintos aprovados nas verificações afetadas (incluindo a repetição dos 7 testes de catálogo após o limite de dimensão), TypeScript (`npm run lint`), build (`npm run build`) e `git diff --check` aprovados. Nenhum arquivo Excel original foi modificado.

Atualização de entrega: envio das correções à main autorizado em 04/11/2026, após as validações registradas. As referências acima a ausência de publicação descrevem a etapa de preparação. A importação dos arquivos e as verificações bancárias não são executadas automaticamente pelo push.
