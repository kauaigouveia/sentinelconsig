import {expect,it} from 'vitest';
import {toggleInssQuoteSelection} from '../src/lib/inssQuoteSelection';
import {quoteOriginKeys,hasPendingOriginOverlap} from '../server/services/inssQuoteDeduplication';
it('seleciona três contratos diferentes e substitui a escolha sem duplicar o mesmo contrato',()=>{
 const one={contractLabel:'Contrato 1',provider:'FINANTO'};
 const two={contractLabel:'Contrato 2',provider:'DAYCOVAL'};
 const three={contractLabel:'Contrato 3',provider:'C6'};
 const alternate={contractLabel:'Contrato 2',provider:'PARANA'};
 let selected=toggleInssQuoteSelection([],one);
 selected=toggleInssQuoteSelection(selected,two);
 selected=toggleInssQuoteSelection(selected,three);
 expect(selected).toEqual([one,two,three]);
 selected=toggleInssQuoteSelection(selected,alternate);
 expect(selected).toEqual([one,three,alternate]);
 selected=toggleInssQuoteSelection(selected,three);
 expect(selected).toEqual([one,alternate]);
});
it('unificações não são combinadas com ofertas individuais que reutilizam contratos',()=>{
 const a={contractLabel:'Contrato 1',unified:false},b={contractLabel:'Contrato 2',unified:false};
 const unified={contractLabel:'Unificação 1 + 2',unified:true};
 expect(toggleInssQuoteSelection([a,b],unified)).toEqual([unified]);
 expect(toggleInssQuoteSelection([unified],a)).toEqual([a]);
});
it('diferencia contratos por banco, número e benefício e bloqueia sobreposição de unificação',()=>{
 const base={benefitNumber:'0000021',originContract:{lenderCode:'237',contractNumber:'000-A1'}};
 const one=quoteOriginKeys(base);
 expect(one).toEqual(['0000021|237|000A1']);
 expect(quoteOriginKeys({...base,originContract:{...base.originContract,lenderCode:'0237'}})).toEqual(one);
 expect(hasPendingOriginOverlap(one,[{customerData:{...base,originContract:{lenderCode:'041',contractNumber:'000-A1'}}}])).toBe(false);
 expect(hasPendingOriginOverlap(one,[{customerData:{benefitNumber:'0000021',originContracts:[
  {lenderCode:'041',contractNumber:'AB'},base.originContract,
 ]}}])).toBe(true);
 expect(hasPendingOriginOverlap(quoteOriginKeys({...base,benefitNumber:'0000088'}),[{customerData:base}])).toBe(false);
});
