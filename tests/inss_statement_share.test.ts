import {expect,it} from 'vitest';
import {inssStatementWhatsAppText} from '../src/lib/inssStatementShare';

it('gera resumo legível do NOVO e das portabilidades selecionadas sem CPF',()=>{
 const message=inssStatementWhatsAppText('Cliente sintético',{
  institution:'C6 BANK',table:'INSS Nova',amount:1400,installment:36.52,rate:1.85,term:108,source:'API',
 },[{
  provider:'DAYCOVAL',contractLabel:'Unificação Daycoval · contratos 1 + 2',
  unified:true,troco:4299.85,originalInstallment:258.67,term:108,
  table:{name:'800584 – RFN INSS 4'},installmentChanges:[
   {label:'Contrato 1',bankCode:'707',contractSuffix:'3125',originalInstallment:65.50,newInstallment:62.30,returnRate:1.492},
   {label:'Contrato 2',bankCode:'935',contractSuffix:'4512',originalInstallment:193.17,newInstallment:193.17,returnRate:1.659},
  ],
 }],()=>({installment:258.67,rate:1.7496}));
 expect(message).toContain('*NOVO · MARGEM ATUAL*');
 expect(message).toContain('C6 BANK');
 expect(message).toContain('*PORTABILIDADE 1 · UNIFICAÇÃO DAYCOVAL*');
 expect(message).toContain('800584 – RFN INSS 4');
 expect(message).toContain('62,30');
 expect(message).toContain('redução de');
 expect(message).toContain('Total das parcelas após ajustes');
 expect(message).toContain('PARCELA DO NOVO REFINANCIAMENTO');
 expect(message).not.toContain('52998224725');
 expect(message).toContain('A margem projetada de 2027 não foi incluída.');
});
it('permite copiar somente NOVO ou somente portabilidade',()=>{
 const margin=inssStatementWhatsAppText('Pessoa',{institution:'FACTA',table:'Nova',amount:500,installment:36,term:84,rate:1.9,source:'API'},[],()=>({}));
 expect(margin).toContain('*NOVO · MARGEM ATUAL*');
 expect(margin).not.toContain('*PORTABILIDADE 1');
 const port=inssStatementWhatsAppText('Pessoa',null,[{provider:'PARANA',contractLabel:'Contrato 1',table:{name:'Portabilidade'},troco:200,originalInstallment:40,term:108}],()=>({installment:40,rate:1.8}));
 expect(port).not.toContain('NOVO · MARGEM ATUAL');
 expect(port).toContain('PARANA');
 expect(inssStatementWhatsAppText('Pessoa',null,[],()=>({}))).toBe('');
});
