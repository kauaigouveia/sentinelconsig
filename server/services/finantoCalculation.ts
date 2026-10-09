/** Compatibilidade com o motor FINANTO, que valida issue_amount em Port/Refin. */
export function finantoCalculationBody(endpoint: string, body: unknown): unknown {
  if (endpoint !== '/v3/loan-inss-simulations/calculation' || !body || typeof body !== 'object') return body;
  const input = body as Record<string, any>;
  if (!input.refinancing || !input.originContract) return body;
  const issueAmount = Number(input.issueAmount ?? input.loanValue ?? input.originContract.dueBalanceValue);
  const installment = Number(input.refinancing.installmentValue) > 0
    ? Number(input.refinancing.installmentValue)
    : Number(input.originContract.installmentValue || input.installmentValue);
  if (!(issueAmount > 0 && Number.isFinite(issueAmount) && installment > 0 && Number.isFinite(installment))) {
    throw new Error('Informe saldo devedor e parcela do refinanciamento maiores que zero.');
  }
  return { ...input, issue_amount: issueAmount, refinancing: { ...input.refinancing, installmentValue: installment } };
}
