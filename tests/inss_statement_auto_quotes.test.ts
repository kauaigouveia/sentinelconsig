import { expect, it, vi } from 'vitest';
import { simulateInssStatementComplete } from '../src/lib/inssStatementAutoQuotes';
import { portabilityEligibility } from '../src/lib/portabilityEligibility';
import type { ReviewedInssStatement } from '../src/lib/inssStatement';

const sample: ReviewedInssStatement = {
  customer: {cpf:'52998224725',name:'Pessoa sintética',birthDate:'1960-01-01',benefitNumber:'1234567890',benefitType:'41'},
  income:'1621.00',loanMargin:'36.52',cardMargin:'',benefitCardMargin:'',uf:'',benefitStart:'',reference:'',issues:[],
  illiterate:'NO',benefitContractCount:'6',
  contracts:['626','237','237','623','341','033'].map((code,index)=>({
    originLenderCode:code,originContractNumber:'TEST-'+index,originalTerm:'84',
    openedInstallmentNumber:'27',lastDueBalance:'1000.00',installmentFaceValue:'36.00',
  })),
};
const offer=(provider='FACTA')=>({
  provider,institution:provider,table:'Tabela sintética',amount:1000,installment:36.52,term:108,rate:1.85,source:'API',review:false,
});

it('proíbe mesmo banco, incluindo aliases C6 e Daycoval',()=>{
  expect(portabilityEligibility('daycoval','707',30,{product:'INSS',operation:'PORT_REFIN'}).blocked).toBe(true);
  expect(portabilityEligibility('c6','626',30,{product:'INSS',operation:'PORT_REFIN'}).blocked).toBe(true);
  expect(portabilityEligibility('c6','336',30,{product:'INSS',operation:'PORT_REFIN'}).blocked).toBe(true);
  expect(portabilityEligibility('parana-spreadsheet','254',30,{product:'INSS',operation:'PORT'}).blocked).toBe(true);
});

it('um único comando consulta a margem atual e TODOS os seis contratos pela API',async()=>{
  const calls:Array<{url:string;body:any}>=[];
  const request=vi.fn(async(url:string,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body));
    calls.push({url,body});
    return new Response(JSON.stringify({offers:[offer()],notices:[]}),{status:200});
  });
  const states:number[]=[];
  const result=await simulateInssStatementComplete(sample,new AbortController().signal,request as typeof fetch,next=>states.push(next.completed));
  expect(calls).toHaveLength(7);
  expect(calls.every(row=>row.url==='/api/inss/statement/quote')).toBe(true);
  expect(calls.filter(row=>row.body.operation==='PORT_REFIN')).toHaveLength(6);
  expect(calls.filter(row=>row.body.operation==='NEW')).toHaveLength(1);
  expect(calls.find(row=>row.body.operation==='NEW')?.body.loanMargin).toBe(36.52);
  expect(calls.find(row=>row.body.operation==='NEW')?.body.term).toBe(108);
  expect(calls.every(row=>row.body.confirmedClientAuthorization===true)).toBe(true);
  expect(calls.every(row=>row.body.loanMargin!==42 && row.body.contract?.installment!==42)).toBe(true);
  expect(result.marginQuotes).toHaveLength(1);
  expect(result.portabilityQuotes).toHaveLength(6);
  expect(new Set(result.portabilityQuotes.map(row=>row.contractIndex)).size).toBe(6);
  expect(result.projectedQuotes).toHaveLength(1);
  expect(result.projectedQuotes[0].gross).toBeGreaterThan(0);
  expect(states.at(-1)).toBe(7);
});

it('mantém a prévia de R$42 fora das APIs e não solicita NOVO com margem zero',async()=>{
  const request=vi.fn(async()=>new Response(JSON.stringify({offers:[],notices:[]}),{status:200}));
  const result=await simulateInssStatementComplete({...sample,loanMargin:'0.00'},new AbortController().signal,request as typeof fetch);
  expect(request).toHaveBeenCalledTimes(6);
  expect(result.marginQuotes).toHaveLength(0);
  expect(result.projectedQuotes).toHaveLength(0);
  expect(request.mock.calls.map(c=>JSON.parse(String(c[1]?.body)).operation)).not.toContain('NEW');
});

it('interrompe execução sem chamadas e recusa excedente sem omitir contratos',async()=>{
  const controller=new AbortController();controller.abort();
  const request=vi.fn();
  expect(await simulateInssStatementComplete(sample,controller.signal,request as typeof fetch))
    .toEqual({marginQuotes:[],portabilityQuotes:[],projectedQuotes:[],notes:[]});
  expect(request).not.toHaveBeenCalled();
  await expect(simulateInssStatementComplete({...sample,contracts:Array.from({length:41},(_,i)=>({...sample.contracts[0],originContractNumber:String(i)}))},new AbortController().signal,request as typeof fetch))
    .rejects.toThrow(/40 contratos/);
  expect(request).not.toHaveBeenCalled();
});

it('identifica a origem planilha e mantém pendências em vez de aprovar cotações',async()=>{
  const request=vi.fn(async()=>new Response(JSON.stringify({
    offers:[{...offer('DAYCOVAL'),source:'PLANILHA',review:true}],notices:['Conferir vigência da planilha.'],
  }),{status:200}));
  const result=await simulateInssStatementComplete({...sample,contracts:[sample.contracts[0]]},new AbortController().signal,request as typeof fetch);
  expect(result.portabilityQuotes[0]).toMatchObject({source:'PLANILHA',review:true});
  expect(result.notes.some(x=>x.includes('Conferir vigência'))).toBe(true);
});
