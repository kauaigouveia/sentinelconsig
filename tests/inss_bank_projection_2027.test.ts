import {it,expect} from 'vitest';
import {inssBankProjectedQuotes} from '../src/lib/inssBankProjectedQuotes';
import {inssStatementWhatsAppText} from '../src/lib/inssStatementShare';
const rows=[
 {provider:'C6',institution:'C6 BANK',table:'Flex 1',rate:1.8,term:108,amount:1500,installment:36.52,source:'API' as const},
 {provider:'FACTA',institution:'FACTA',table:'Novo Smart',rate:1.85,term:108,amount:1400,installment:36.52,source:'API' as const},
 {provider:'FINANTO',institution:'FINANTO',table:'Essencial',rate:1.78,term:108,amount:1510,installment:36.52,source:'API' as const},
 {provider:'Nossa Fintech',institution:'Nossa Fintech',table:'Não retornou taxa',rate:null,term:108,amount:1500,installment:36.52,source:'API' as const},
];
it('projeta bruto a 42 por cada banco com taxa vigente e não inventa valores',()=>{
 const offers=inssBankProjectedQuotes(rows,true);
 expect(offers.map(q=>q.provider)).toEqual(['C6','FACTA','FINANTO']);
 expect(offers.every(q=>q.scenario==='FUTURE_NOT_AVAILABLE'&&q.projectedGross>0)).toBe(true);
 expect(inssBankProjectedQuotes(rows,false)).toEqual([]);
 const future=inssStatementWhatsAppText('Pessoa',{
  ...offers[0],amount:offers[0].projectedGross,installment:42,scenario:'PROJECTED_2027'
 },[],()=>({}));
 expect(future).toContain('AUMENTO DE MARGEM 2027');
 expect(future).toContain('Valor bruto estimado:');
 expect(future).not.toContain('Valor estimado a liberar:');
 expect(future).toContain('Margem futura ainda não liberada.');
 const api=inssStatementWhatsAppText('Pessoa',{
  ...offers[0],amount:1900,installment:42,scenario:'PROJECTED_2027',calculatedByApi:true
 },[],()=>({}));
 expect(api).toContain('Valor estimado:');
 expect(api).not.toContain('API');
 expect(api).not.toContain('Bruto teórico pela fórmula Price');
});
