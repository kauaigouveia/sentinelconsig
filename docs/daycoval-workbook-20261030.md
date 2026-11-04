# Daycoval: modelo de 30/10/2026 Atualizado

## Causa comprovada
O sistema aceitava somente a assinatura de fórmulas do arquivo de 09/10/2026. A versão de 30/10 mantém a aparência, mas o parser de produção identificou 13 diferenças nas fórmulas expandidas da aba SIMULADOR COM SALDO: mudança de âncora de tabela dinâmica em ES5:ES10, alteração de AE11, inclusão de AF11, remoção de FF311:FF314 e alteração de FF315. Nenhuma alteração de fórmula foi encontrada em Batalha Naval (2).

Assinaturas verificadas pelo próprio importador:
- 09/10: `6e0eacd03bb614e7a257cae03b8c7844f4f1436abd14cad78124369427dfb1af`.
- 30/10 Atualizado: `a0f786eb29f8af9dc378f322871a01c39aaca75db8804ffe077419a7bad8743d`.

## Correção preparada
Lista explícita das duas versões reconhecidas, utilizada de forma consistente na importação, prévia e cálculo automático. Não se aceita um arquivo apenas pelo nome ou pela data preenchida. Modelos desconhecidos continuam rejeitados. As validações de tamanho/ZIP/macros, permissões, tenant e vigência foram preservadas.

Durante os testes com a versão nova, o prazo de 84 meses excedeu o orçamento de 300.000 leituras de célula. O perfil mostrou buscas repetidas da mesma condição por PROCV e contagens da tabela de prazos. Foram memorizadas as linhas de busca por chave/faixa/modo e as contagens por empregador, exclusivamente em cada instância de cálculo. A comparação exata/aproximada, primeiro registro duplicado e comportamento de condição ausente foram preservados. O orçamento continua em 300.000 e é verificado inclusive ao ler células já calculadas. Não foram alteradas fórmulas, taxas, coeficientes ou regras de elegibilidade.

## Evidências e limites
- 46 testes aprovados: reconhecimento das versões, rejeição de alterações, duplicidades e ausência de condição, PROCV exato/aproximado, isolamento dos caches por cálculo, manutenção do orçamento, cálculo automático, fluxo HTTP e tenant.
- Arquivos reais lidos localmente, sem modificação: versões de 09/10 e 30/10 Atualizado.
- Comparação com resultados salvos pelo Excel: 63 células numéricas da versão antiga e 59 da nova, sem diferença superior a R$ 0,005 nos valores comparados; primeiro vencimento coincidente em ambas. Estes são valores em cache do arquivo, não uma nova execução do Excel.
- Cenário da imagem (data 04/11/2026, saldo 14.800, parcela 350, 80 restantes, 108 meses): o intérprete reproduziu primeiro vencimento 10/01/2027, valor de contrato 15.792,09 e líquido 961,99 da linha apresentada. Seu status de tabela permanece preservado; esse resultado não transforma uma condição indisponível em oferta elegível.
- 54 cenários locais do intérprete com a versão nova: seis datas, prazos 108/96/84 e um/dois/três contratos; sem exceção nem saída financeira não finita após a otimização. Não foram recalculados esses 54 cenários no Excel nativo.
- Nenhuma chamada bancária, atualização de planilha em banco operacional, migration ou edição do arquivo XLSX.

## Liberação
Preparado na branch `codex/daycoval-workbook-20261030`. Esta tarefa não fez push nem deployment. Após revisão/publicação, importar novamente o arquivo de 30/10 pela tela existente, informando a data da versão. A configuração de produção e a planilha ativa de 09/10 continuam preservadas até essa ação explícita. Data da versão não substitui vigência comercial.

Verificações finais: TypeScript (`npm run lint`), build (`npm run build`) e `git diff --check` aprovados. O build mantém apenas os avisos conhecidos de chunks grandes. Nenhum commit, push ou deployment realizado nesta tarefa.

Atualização de entrega: envio das correções à main autorizado em 04/11/2026, após as validações registradas. As referências acima a ausência de publicação descrevem a etapa de preparação. A importação dos arquivos e as verificações bancárias não são executadas automaticamente pelo push.
