# INSS Novo — aumento de margem projetada para 2027

## Objetivo
Ao informar renda/benefício mensal de **R$ 1.621,00**, seja na simulação **NOVO** operacional ou ao importar um PDF na **Simulação por extrato INSS**, apresentar dois cenários **independentes**:

1. **Margem atual**: a margem livre já presente no extrato/consulta, consultada nos bancos como antes.
2. **Aumento projetado (2027)**: parcela hipotética **R$ 42,00**, baseada na projeção de aumento do salário mínimo de R$ 1.621,00 para R$ 1.741,00 (diferença de R$ 120,00 × 35%). **Não somar**, não usar como margem vigente, nem contratar.

O PLOA 2027 contém projeção de R$ 1.741,00, mas não constitui valor definitivo de reajuste. A margem efetiva depende de publicação oficial, Dataprev, regras do benefício e aceitação de cada instituição. Mesmo se a renda for exatamente R$ 1.621,00, não há garantia de que o cliente possua margem liberada.

## Comportamento
- Reconhece somente renda **exata R$ 1.621,00**, aceitando notação monetária brasileira e numérica; os demais salários não ativam a prévia.
- **Extrato**: mostra margem atual e hipotética em dois blocos distintos; adiciona botão `Prévia NOVO · aumento R$ 42,00 (2027)` independentemente do valor de margem já existente. Quando margem atual positiva, mantém botão `Simular novo pela margem atual`. Benefício bloqueado não libera a prévia.
- **NOVO**: depois que a renda estiver conhecida, exibe seleção `Margem atual` vs `Aumento projetado 2027 R$ 42,00`. No resultado de simulação com margem atual, mantém ofertas das instituições, e em um **quadro separado** mostra estimativa teórica do aumento.
- **Prévia projetada**: usa parcela fixa de R$ 42,00, taxa e prazo informados e fórmula Price para estimar o valor **bruto** do contrato. Não inclui IOF, seguro, CET, descontos adicionais nem análise bancária. Não faz chamadas de simulação às instituições, não autoriza cliente, não persiste a prévia e não habilita envio para digitação.
- Nenhuma alteração em propostas/contratação, retornos bancários, margens existentes, Prisma/Neon, regras de portabilidade/refinanciamento ou APIs.

## Testes
`tests/inss_projected_margin_2027.test.ts`:
- salário 1621 em formatos monetários; rejeição de salários próximos/diferentes;
- disponível 80 + projetado 42 permanecem separados (jamais 122);
- margem disponível 0, negativa, desconhecida; bloqueio do benefício;
- fórmula Price por prazo/taxa, validação de entradas inválidas.

## Evolução futura
Quando o salário mínimo 2027 definitivo e os critérios bancários forem publicados, atualizar parâmetros em `src/lib/inssProjectedMargin.ts` somente com evidências válidas. A margem prevista **não vira margem real automaticamente** ao mudar o ano: apenas consulta autorizada retornada pela instituição/Dataprev pode confirmar a liberação.

## Fontes públicas da projeção (consulta em 19/11/2026)
- PLOA 2027 / documentação orçamentária Senado: salário R$ 1.741,00 previsto para 2027.
- INSS / IN 138: regras de margem do empréstimo consignado com limite geral de 35%.
