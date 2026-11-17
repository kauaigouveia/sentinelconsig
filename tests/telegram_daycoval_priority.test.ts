import {describe,it,expect} from 'vitest';
import {eligibleDaycovalContractIndices,planDaycovalUnifications} from '../src/lib/portabilityQuoteSelection';

const contracts=[{installment:216.30},{installment:621.22},{installment:30},{installment:64.66}];
const sheet=(index:number,bank='PARANA')=>({bank,indices:[index],amount:500});
const result=(index:number,complete:boolean,positive=false)=>({
 index,failed:false,completedWithoutOffer:complete,
 rows:positive?[{provider:'FACTA',state:'OFFER',amount:1000}]:[],
});
describe('Daycoval: somente parcelas abaixo de R$ 50 e fallback comprovado',()=>{
 it('prioriza exclusivamente a parcela de R$ 30 quando todas as maiores passam nos demais bancos',()=>{
  expect(eligibleDaycovalContractIndices(contracts,[0,1,2,3],
   [sheet(0),sheet(1),sheet(3)],
   [result(0,false,true),result(1,false,true),result(3,false,true)]))
    .toEqual([2]);
 });
 it('não confunde R$ 50 exatos nem consulta pendente com menor que R$ 50',()=>{
  const rows=[{installment:49.99},{installment:50},{installment:51}];
  expect(eligibleDaycovalContractIndices(rows,[0,1,2],[],[])).toEqual([0]);
  expect(eligibleDaycovalContractIndices(rows,[0,1,2],[],
    [{index:1,failed:true,completedWithoutOffer:true,rows:[]},
     {index:2,failed:false,completedWithoutOffer:false,rows:[]}])).toEqual([0]);
 });
 it('autoriza parcelas grandes só após fim de consulta sem ofertas e sem outra cotação positiva',()=>{
  expect(eligibleDaycovalContractIndices(contracts,[0,1,2,3],[],
    [result(0,true),result(1,true),result(3,true)])).toEqual([0,1,2,3]);
  expect(eligibleDaycovalContractIndices(contracts,[0,1,2,3],
    [sheet(0),sheet(3)],[result(0,true),result(1,true),result(3,true)]))
    .toEqual([1,2]);
  expect(eligibleDaycovalContractIndices(contracts,[0,1,2,3],[],
    [result(0,true,true),result(1,true),result(3,true)]))
    .toEqual([1,2,3]);
 });
 it('mantém no máximo três contratos por unificação e não repete contratos',()=>{
  const all=Array.from({length:7},(_,i)=>({installment:i+1}));
  const eligible=eligibleDaycovalContractIndices(all,all.map((_,i)=>i),[],[]);
  const groups=planDaycovalUnifications(eligible,indices=>({
   offers:[{name:'800581 - RFN - INSS 1',amount:100,installment:30,
    installmentChanges:indices.map(()=>({newInstallment:10}))}],
  }));
  expect(groups.map(g=>g.indices.length)).toEqual([3,3]);
  expect(new Set(groups.flatMap(g=>g.indices)).size).toBe(6);
 });
});
