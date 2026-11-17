// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {calculateTelegramInssMarginQuotes} from '../server/services/telegramInssMarginQuotes';
import type {TelegramPdfReview} from '../server/services/telegramInssPdfService';
const review:TelegramPdfReview={
 birthDate:'1966-01-01',benefitType:32,benefitStartDate:'2010-01-01',
 uf:'AL',benefitContractCount:1,loanMargin:87.66,
 contracts:[{bank:'237',numberSuffix:'9999',originalTerm:84,remaining:50,balance:3000,installment:120}],
 bankConsultation:{cpf:'12345678909',benefitNumber:'0000000001',name:'Teste',income:2000,
 legalRepresentative:false,contracts:[{number:'A9999'}]},
};
const partner={id:'p1',name:'Parceiro',code:'120'};
describe('Margem livre INSS por integrações oficiais',()=>{
 it('envia a margem como parcela na modalidade NEW, sem reutilizar saldos de portabilidade',async()=>{
  const run=vi.fn(async(_db:any,tenant:string,input:any,action:string)=>{
    expect(tenant).toBe('tenant-A');expect(action).toBe('SIMULATE');
    expect(input).toMatchObject({product:'INSS',operation:'NEW',mode:'Payment',
      value:87.66,term:108,cpf:'12345678909',benefitNumber:'0000000001'});
    expect(input.originalContract).toBeUndefined();
    return {rows:[
      {provider:'FINANTO',state:'OFFER',amount:3300,rate:1.75,term:108,installment:87.66,name:'Taxa menor'},
      {provider:'FINANTO',state:'OFFER',amount:3000,rate:1.85,term:108,installment:87.66,name:'Taxa prioritária'},
      {provider:'C6',state:'OFFER',amount:3700,rate:1.85,term:108,installment:87.66,name:'C6'},
      {provider:'FACTA',state:'PENDING',amount:0},
    ]};
  });
  const record=vi.fn(async()=>({id:'history'}));
  const result=await calculateTelegramInssMarginQuotes({} as any,'tenant-A',
    partner,review,'NO','0123456789ABCDEF',{run:run as any,record:record as any});
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.status).toBe('OFFERS');
  expect(result.offers).toHaveLength(2);
  expect(result.offers.find(x=>x.bank==='FINANTO')).toMatchObject({amount:3000,rate:1.85});
  expect(record).toHaveBeenCalledTimes(1);
 });
 it('não consulta margem zerada nem inventa oferta quando banco não retorna',async()=>{
  const run=vi.fn(async()=>({rows:[]}));
  const empty=await calculateTelegramInssMarginQuotes({} as any,'tenant-A',
    partner,{...review,loanMargin:0},'NO','0123456789ABCDEF',{run:run as any});
  expect(empty.status).toBe('NO_MARGIN');
  expect(run).not.toHaveBeenCalled();
  const noOffer=await calculateTelegramInssMarginQuotes({} as any,'tenant-A',
    partner,review,'NO','0123456789ABCDEF',{run:run as any});
  expect(noOffer.status).toBe('NO_OFFER');
 });
});
