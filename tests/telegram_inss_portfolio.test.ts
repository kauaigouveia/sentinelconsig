// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {formatTelegramInssPortfolio} from '../server/services/telegramInssPortfolio';
import type {TelegramPdfReview} from '../server/services/telegramInssPdfService';
const review:TelegramPdfReview={
 birthDate:'1966-03-14',benefitType:32,benefitStartDate:'2015-01-01',uf:'AL',
 benefitContractCount:2,loanMargin:87,
 contracts:[
  {bank:'237',numberSuffix:'5152',originalTerm:84,remaining:55,balance:23065.93,installment:621.22},
  {bank:'041',numberSuffix:'9904',originalTerm:84,remaining:55,balance:8159.12,installment:216.3},
 ],
 bankConsultation:{cpf:'12345678909',benefitNumber:'0000000001',name:'Cliente Particular',
   income:3000,legalRepresentative:false,contracts:[{number:'EX-5152'},{number:'EX-9904'}]},
};
describe('resumo consolidado INSS: privacidade e valores não duplicados',()=>{
 it('mostra tabela Daycoval das unificações e exclui seu troco do total individual',()=>{
  const sheets=[
   {bank:'DAYCOVAL',indices:[0],table:'800587 - RFN - INSS 20K 7',amount:6100,rate:1.65,term:108,installment:621.22,
     changes:[{index:0,original:621.22,adjusted:621.22}]},
   {bank:'DAYCOVAL',indices:[0,1],table:'800581 - RFN - INSS 20K 1',amount:12000,rate:1.65,term:108,installment:837.52,
     changes:[{index:0,original:621.22,adjusted:621.22},{index:1,original:216.3,adjusted:216.3}]},
  ];
  const official=[
   {index:0,failed:false,saved:true,rows:[{state:'OFFER',provider:'FINANTO',institution:'FINANTO',
     name:'Tabela 1,85',amount:7000,rate:1.85,term:108,installment:621.22}]},
   {index:1,failed:false,saved:true,rows:[{state:'OFFER',provider:'FACTA',institution:'FACTA',
     name:'Tabela 1,85',amount:3000,rate:1.85,term:108,installment:216.3}]},
  ];
  const messages=formatTelegramInssPortfolio(review,[0,1],sheets,official),all=messages.join('\n');
  expect(all).toContain('Tabela: 800581 - RFN - INSS 20K 1');
  expect(all).toMatch(/R\$\s*10\.000,00/);
  expect(all).not.toMatch(/R\$\s*22\.000,00/);
  expect(all).not.toContain('Cliente Particular');
  expect(all).not.toContain('12345678909');
  expect(all).not.toContain('0000000001');
  expect(messages.every(m=>m.length<=3750)).toBe(true);
 });
});
