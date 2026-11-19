import { expect, it, vi } from 'vitest';
import { simulateInssStatementOnUpload } from '../src/lib/inssStatementAutoQuotes';
import { portabilityEligibility } from '../src/lib/portabilityEligibility';
import type { InssStatement } from '../src/lib/inssStatement';

const statement: InssStatement = {
  customer: { cpf: '00000000191', name: 'Pessoa sintética', birthDate: '1960-01-01', benefitNumber: '1234567890', benefitType: '41' },
  income: '1621.00', loanMargin: '80.00', cardMargin: '', benefitCardMargin: '', uf: '', benefitStart: '', reference: '', issues: [],
  contracts: ['707','935'].map(code => ({
    originLenderCode: code, originContractNumber: 'C-'+code, originalTerm: '84',
    openedInstallmentNumber: '27', lastDueBalance: '1000.00', installmentFaceValue: '80.00',
  })),
};

it('impede portabilidade para a mesma instituição, incluindo aliases C6 e Daycoval', () => {
  expect(portabilityEligibility('daycoval','707',57,{product:'INSS',operation:'PORT_REFIN'}).blocked).toBe(true);
  expect(portabilityEligibility('DAYCOVAL','Banco Daycoval',57,{product:'INSS',operation:'PORT'}).blocked).toBe(true);
  expect(portabilityEligibility('c6','336',57,{product:'INSS',operation:'PORT_REFIN'}).blocked).toBe(true);
  expect(portabilityEligibility('c6','626',57,{product:'INSS',operation:'PORT_REFIN'}).blocked).toBe(true);
  expect(portabilityEligibility('parana-spreadsheet','254',57,{product:'INSS',operation:'PORT'}).blocked).toBe(true);
});

it('ao carregar extrato simula NOVO e portabilidades, sem usar margem projetada como vigente', async () => {
  const calls: {url:string; body:any}[] = [];
  const mock = vi.fn(async (url:string, init?:RequestInit) => {
    calls.push({url,body:JSON.parse(String(init?.body))});
    return new Response(JSON.stringify(url.includes('/novo/')
      ? {success:true,data:{results:[{success:true,table:{name:'Tabela sintética'},data:{disbursement_options:[{disbursed_issue_amount:2000}]}}]}}
      : {offers:[{name:'Condição sintética',rate:1.85,term:108,amount:1000,installment:80}]}),
      {status:200,headers:{'Content-Type':'application/json'}});
  });
  const quotes = await simulateInssStatementOnUpload(statement, new AbortController().signal, mock as typeof fetch);
  expect(quotes.marginQuotes).toEqual([{table:'Tabela sintética',amount:2000}]);
  expect(quotes.portabilityQuotes.length).toBeGreaterThan(0);
  expect(calls.some(c => c.url === '/api/daycoval/calculate' && c.body.contracts[0].originBank === '707')).toBe(false);
  expect(calls.some(c => c.body.value === 42)).toBe(false);
  expect(calls.find(c=>c.url.endsWith('/novo/simulate-all'))?.body).toMatchObject({mode:'INSTALLMENT',value:80,numberOfInstallments:108});
});

it('não usa margem zero, negativa ou benefício bloqueado para NOVO', async () => {
  for (const loanMargin of ['0.00','-20.00']) {
    const calls: string[] = [];
    const mock = vi.fn(async (url:string) => {calls.push(url);return new Response(JSON.stringify({offers:[]}),{status:200});});
    await simulateInssStatementOnUpload({...statement,loanMargin},new AbortController().signal,mock as typeof fetch);
    expect(calls.some(url=>url.includes('/novo/'))).toBe(false);
  }
  const calls: string[] = [];
  const mock = vi.fn(async (url:string) => {calls.push(url);return new Response(JSON.stringify({offers:[]}),{status:200});});
  await simulateInssStatementOnUpload({...statement,loanBlocked:true},new AbortController().signal,mock as typeof fetch);
  expect(calls.some(url=>url.includes('/novo/'))).toBe(false);
});

it('abort não gera requisições nem retorna cotações de outra sessão', async () => {
  const controller = new AbortController();
  controller.abort();
  const mock = vi.fn();
  expect(await simulateInssStatementOnUpload(statement,controller.signal,mock as typeof fetch))
    .toEqual({marginQuotes:[],portabilityQuotes:[],notes:[]});
  expect(mock).not.toHaveBeenCalled();
});
