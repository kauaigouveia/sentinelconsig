import {it,expect} from 'vitest';
import {inssQuoteCoveredContracts,toggleInssQuoteSelection} from '../src/lib/inssQuoteSelection';
const loan=(index:number,provider:string)=>{
  const sourceForm={originLenderCode:String(600+index),originContractNumber:'CN-'+index};
  return {contractLabel:'Contrato '+index,sourceForm,provider,unified:false};
};
it('Daycoval 22+53+63 e Finanto 112 continuam selecionados juntos',()=>{
  const a=loan(22,'DAYCOVAL'),b=loan(53,'DAYCOVAL'),c=loan(63,'DAYCOVAL');
  const other=loan(112,'FINANTO');
  const group={contractLabel:'Unificação Daycoval · contratos 1 + 2 + 3',
    sourceContracts:[a.sourceForm,b.sourceForm,c.sourceForm],provider:'DAYCOVAL',unified:true};
  let selected=toggleInssQuoteSelection([],group);
  selected=toggleInssQuoteSelection(selected,other);
  expect(selected).toEqual([group,other]);
  // Outro contrato não faz parte da unificação, não pode remover a escolha.
  selected=toggleInssQuoteSelection(selected,loan(53,'C6'));
  expect(selected).toEqual([other,expect.objectContaining({provider:'C6'})]);
  expect(inssQuoteCoveredContracts(group)).toHaveLength(3);
});
it('alternar mesmas ofertas e selecionar grupos disjuntos sem sobreposição',()=>{
  const a=loan(1,'DAYCOVAL'),b=loan(2,'FINANTO'),c=loan(3,'FACTA'),d=loan(4,'C6');
  const group1={contractLabel:'Unificação 1 + 2',sourceContracts:[a.sourceForm,b.sourceForm],unified:true};
  const group2={contractLabel:'Unificação 3 + 4',sourceContracts:[c.sourceForm,d.sourceForm],unified:true};
  let selected=toggleInssQuoteSelection([a,b,c,d],group1);
  expect(selected).toEqual([c,d,group1]);
  selected=toggleInssQuoteSelection(selected,group2);
  expect(selected).toEqual([group1,group2]);
  selected=toggleInssQuoteSelection(selected,group1);
  expect(selected).toEqual([group2]);
});
it('comparador antigo sem sourceForm ainda reconhece sobreposição pelo rótulo',()=>{
  const a={contractLabel:'Contrato 1'},b={contractLabel:'Contrato 2'},c={contractLabel:'Contrato 3'};
  const group={contractLabel:'Unificação 1 + 2',unified:true};
  expect(toggleInssQuoteSelection([a,b,c],group)).toEqual([c,group]);
  expect(toggleInssQuoteSelection([c,group],a)).toEqual([c,a]);
});
