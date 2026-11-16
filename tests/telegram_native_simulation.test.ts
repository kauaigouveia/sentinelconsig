import {describe,it,expect,vi} from 'vitest';
import {
 beginTelegramNativeSimulation,telegramNativeSteps,telegramNativePrompt,
 acceptTelegramNativeAnswer,telegramNativeSummary,toTelegramNativeInput,
 formatTelegramNativeResults,type TelegramNativeDraft,
} from '../server/services/telegramNativeSimulation';
import {executeTelegramNativeSimulation} from '../server/services/telegramNativeSimulationExecutor';

const CPF='52998224725'; // Brazilian check-digit-valid synthetic test identifier
function fill(product:'CLT'|'FGTS'|'INSS',operation?:'NEW'|'REFIN'|'PORT'|'PORT_REFIN'){
 let state=beginTelegramNativeSimulation({product,...(operation?{operation}:{})});
 const values:Record<string,string>={
  cpf:CPF,name:'Cliente Ficticio',phone:'82999998888',
  birthDate:'15/06/1966',benefitNumber:'1234567890',benefitType:'32',state:'AL',
  benefitStartDate:'PULAR',value:'450,00',term:product==='FGTS'?'4':'108',
  income:'2800,00',illiterate:'NÃO',c6Contract:'PULAR',
  originalBank:'237',originalContract:'23456789',debt:'10.500,25',
  originalTerm:'84',remainingTerm:'39',originalInstallment:'320,20',
 };
 while(state.index<telegramNativeSteps(state).length){
  const current=telegramNativeSteps(state)[state.index];
  const result=acceptTelegramNativeAnswer(state,values[current.field]||'PULAR');
  if('error' in result)throw Error('Falhou na etapa '+current.field+': '+result.error);
  state=result.draft;
 }
 return state;
}
describe('Atendimento de simulação completo no Telegram',()=>{
 it('pede dados válidos de CLT, sem navegador; valida CPF, nome, telefone e parcela',()=>{
  let draft=beginTelegramNativeSimulation({product:'CLT'});
  expect(telegramNativePrompt(draft)).toContain('CPF');
  const wrong=acceptTelegramNativeAnswer(draft,'00000000000');
  expect(wrong.ok).toBe(false);
  const valid=acceptTelegramNativeAnswer(draft,CPF);
  expect(valid.ok).toBe(true);
  const full=fill('CLT');
  expect(full.index).toBe(4);
  expect(toTelegramNativeInput(full,'partner-a')).toMatchObject({
   product:'CLT',operation:'NEW',cpf:CPF,phone:'82999998888',mode:'Payment',
   value:450,term:0,partnerId:'partner-a',automaticAuthorization:false,
  });
  const text=telegramNativeSummary(full);
  expect(text).not.toContain(CPF);
  expect(text).toContain('Confirmar simulação');
 });
 it('FGTS precisa apenas do CPF e quantidade de saques; não exige entrada no portal',()=>{
  const state=fill('FGTS');
  expect(telegramNativeSteps(state)).toHaveLength(2);
  expect(toTelegramNativeInput(state,'p')).toMatchObject({
   product:'FGTS',operation:'NEW',cpf:CPF,term:4,value:0,
  });
 });
 it('INSS Novo e refin consultam com NB, espécie, nascimento, UF, margem e prazo',()=>{
  const novo=fill('INSS','NEW'),refin=fill('INSS','REFIN');
  for(const v of [novo,refin]){
    expect(toTelegramNativeInput(v,'partner-a')).toMatchObject({
      product:'INSS',cpf:CPF,birthDate:'1966-06-15',
      benefitNumber:'1234567890',benefitType:32,state:'AL',
      value:450,term:108,income:2800,illiterate:'NO',
    });
  }
  expect(toTelegramNativeInput(refin,'p').operation).toBe('REFIN');
  expect(toTelegramNativeInput(novo,'p').operation).toBe('NEW');
 });
 it('porta manualmente sem PDF e distingue PORT de PORT_REFIN',()=>{
  for(const op of ['PORT','PORT_REFIN'] as const){
    const state=fill('INSS',op);
    const payload=toTelegramNativeInput(state,'p');
    expect(payload).toMatchObject({
      product:'INSS',operation:op,originalBank:'237',originalContract:'23456789',
      debt:10500.25,originalTerm:84,remainingTerm:39,
      originalInstallment:320.2,
    });
    if(op==='PORT')expect(payload.value).toBe(320.2);
    else expect(payload.value).toBe(450);
  }
 });
 it('não aceita prazo inválido, data impossível, margem negativa ou parcelas abertas acima do original',()=>{
  const draft=beginTelegramNativeSimulation({product:'INSS',operation:'PORT'});
  const date=telegramNativeSteps(draft).findIndex(x=>x.field==='birthDate');
  expect(acceptTelegramNativeAnswer({...draft,index:date},'31/02/1965').ok).toBe(false);
  const term=telegramNativeSteps(draft).findIndex(x=>x.field==='remainingTerm');
  expect(acceptTelegramNativeAnswer({...draft,index:term,values:{originalTerm:'84'}},'85').ok).toBe(false);
  const money=telegramNativeSteps(draft).findIndex(x=>x.field==='debt');
  expect(acceptTelegramNativeAnswer({...draft,index:money},'-100').ok).toBe(false);
  expect(acceptTelegramNativeAnswer({...draft,index:money},'10.500,25').ok).toBe(true);
  const expired={...draft,expires:Date.now()-1};
  expect(acceptTelegramNativeAnswer(expired,CPF).ok).toBe(false);
 });
 it('não exibe resposta bruta de instituições, só melhores valores financeiros por banco',()=>{
  const rows=[
   {provider:'BANK_A',state:'OFFER',amount:1000,installment:100,term:108,rate:1.75,data:{cpf:CPF}},
   {provider:'BANK_A',state:'OFFER',amount:1500,installment:100,term:108,rate:1.7},
   {provider:'BANK_B',state:'PENDING',message:'CPF '+CPF},
   {provider:'BANK_C',state:'ERROR',message:'full bank error '+CPF},
  ];
  const text=formatTelegramNativeResults(rows,'INSS','NEW',true).join('\n');
  expect(text).toContain('BANK_A');
  expect(text).toContain('1.500,00');
  expect(text).not.toContain('1.000,00');
  expect(text).not.toContain(CPF);
  expect(text).toContain('instituição(ões) não concluíram');
  expect(text).toContain('histórico');
 });
 it('executa o serviço real por injeção com escopo do tenant e registra somente ofertas positivas',async()=>{
  const draft=fill('CLT');
  const spy=vi.fn(async (_db:any,tenant:string,body:any,action:string)=>({
    rows:[
     {provider:'BANCO1',state:'OFFER',amount:1300,installment:450,term:36,rate:2.5},
     {provider:'BANCO2',state:'PENDING',message:'aguarde autorização'},
     {provider:'BANCO3',state:'OFFER',amount:0},
    ],message:'',
  }));
  const saved=vi.fn(async()=>({id:'sim-1'}));
  const result=await executeTelegramNativeSimulation({} as any,'tenant-a',
   {id:'partner-a',code:'011',name:'Teste'},draft,'0123456789ABCDEF', {run:spy as any,record:saved as any});
  expect(result.saved).toBe(true);
  expect(result.offerCount).toBe(1);
  expect(spy).toHaveBeenCalledWith(expect.anything(),'tenant-a',
    expect.objectContaining({partnerId:'partner-a',cpf:CPF,product:'CLT'}),'SIMULATE');
  expect((saved as any).mock.calls[0][1]).toMatchObject({tenantId:'tenant-a',partnerId:'partner-a',partnerCode:'011'});
  expect((saved as any).mock.calls[0][4]).toHaveLength(1);
  await expect(executeTelegramNativeSimulation({} as any,'tenant-a',
    {id:'partner-a',code:'011',name:'Teste'},{...draft,expires:Date.now()-1},'0123456789ABCDEF',
    {run:spy as any,record:saved as any})).rejects.toThrow('expiraram');
 });
});
