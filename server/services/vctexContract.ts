/** VCTEX API 1.0.11, pp. 13–17. Preserve unknown states instead of inventing success. */
export const vctexStates = {
  started:'Pré-operação criada', creating_authorization_term:'Gerando termo', awaiting_signature:'Termo pendente de assinatura',
  signed:'Assinatura recebida', awaiting_authorization:'Aguardando autorização', authorized:'Consultando vínculos',
  awaiting_contracts:'Consultando vínculos', awaiting_validation:'Verificando elegibilidade', awaiting_credit_engine:'Analisando crédito',
  finished:'Vínculos disponíveis', authorization_failure:'Autorização inválida ou vencida', processing_failure:'Falha técnica',
  eligibility_denied_by_provider:'Inelegível na Dataprev', ineligible_by_internal_policy:'Inelegível pela política bancária',
} as const;
export const vctexTerminal = new Set(['finished','authorization_failure','processing_failure','eligibility_denied_by_provider','ineligible_by_internal_policy']);
export type VctexRate = {id:string;name:string;description?:string;withInsurance:boolean;fee:number;isActive:boolean;allowedInstallments:number[];minInstallmentAmount:number;maxInstallmentAmount:number;maxAllowedLoanAmount:number};
export function parseVctexRates(body:unknown):VctexRate[]{
  if(!Array.isArray(body))return [];
  return body.filter((r:any)=>r?.isActive===true&&typeof r.id==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(r.id)&&typeof r.name==='string'&&typeof r.withInsurance==='boolean'&&Number.isFinite(r.fee)&&r.fee>=0&&Array.isArray(r.allowedInstallments)&&r.allowedInstallments.every((n:any)=>Number.isInteger(n)&&n>0)&&Number.isFinite(r.minInstallmentAmount)&&r.minInstallmentAmount>0&&Number.isFinite(r.maxInstallmentAmount)&&r.maxInstallmentAmount>=r.minInstallmentAmount&&Number.isFinite(r.maxAllowedLoanAmount)&&r.maxAllowedLoanAmount>0)
    .map((r:any)=>({id:r.id,name:r.name,description:typeof r.description==='string'?r.description:undefined,withInsurance:r.withInsurance,fee:r.fee,isActive:true,allowedInstallments:r.allowedInstallments,minInstallmentAmount:r.minInstallmentAmount,maxInstallmentAmount:r.maxInstallmentAmount,maxAllowedLoanAmount:r.maxAllowedLoanAmount}));
}
export function parseVctexToken(body: unknown) {
  // Isolated compatibility parser, not a claim about the undocumented login response.
  const b = body as any;
  const candidates = [b?.access_token,b?.accessToken,b?.token,b?.data?.access_token,b?.data?.accessToken,b?.data?.token]
    .filter((v):v is string => typeof v === 'string' && v.length > 10 && v.length <= 8192 && !/\s/.test(v));
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) throw Error('Contrato do token VCTEX não reconhecido. Consulte o diagnóstico sanitizado.');
  return unique[0];
}
export function vctexFieldNames(body: unknown): string[] {
  const paths: string[] = [];
  function visit(value: unknown, prefix:string, depth:number) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return;
    for (const [key,v] of Object.entries(value).slice(0,50)) {
      // Reject dynamic keys (including CPF, e-mail and tokens) rather than reporting them.
      if (!/^[A-Za-z_][A-Za-z_]{0,39}$/.test(key)) continue;
      const p = prefix ? `${prefix}.${key}` : key; paths.push(p); visit(v,p,depth+1);
    }
  }
  visit(body,'',0); return paths;
}
const number = (v:unknown) => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
export function normalizeVctexQuote(raw:any, rate:VctexRate, employmentId:string, preOperationId:string) {
  if (!raw || typeof raw.id !== 'string' || !(number(raw.finalDisbursedAmount)! > 0) || !(number(raw.installmentAmount)! > 0) || !Number.isInteger(raw.installmentsNumber) || raw.installmentsNumber <= 0) throw Error('Simulação VCTEX sem valores financeiros válidos.');
  return {provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'OFFER' as const,table:rate.name,simulationId:raw.id,
    amount:raw.finalDisbursedAmount,contractAmount:number(raw.issueAmount),installment:raw.installmentAmount,term:raw.installmentsNumber,
    rate:number(raw.monthlyRate),cetAnnual:number(raw.cet),
    data:{vctex:{preOperationId,employmentId,offerId:rate.id,rawFee:rate.fee,rawMonthlyRate:number(raw.monthlyRate),
      iof:number(raw.iof),insuranceAmount:number(raw.insuranceAmount),withInsurance:rate.withInsurance,
      issueAmount:number(raw.issueAmount),disbursedIssueAmount:number(raw.disbursedIssueAmount),finalDisbursedAmount:raw.finalDisbursedAmount,
      totalAmount:number(raw.totalAmount),firstDueDate:raw.firstDueDate,lastDueDate:raw.lastDueDate,disbursementDate:raw.disbursementDate,limitDaysToDisburse:number(raw.limitDaysToDisburse)}}};
}
export function validateVctexInstallments(rate:VctexRate, margin:number, term:unknown, amount:unknown) {
  if (!Number.isInteger(term) || !rate.allowedInstallments.includes(term as number) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount < rate.minInstallmentAmount || amount > rate.maxInstallmentAmount || amount > margin) throw Error('Prazo ou parcela fora dos limites da oferta e do vínculo VCTEX.');
}
