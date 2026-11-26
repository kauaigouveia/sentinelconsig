import {expect,it} from 'vitest';
import {daycovalShareData} from '../src/lib/daycovalShareImage';
it('preserves the distinct ported and refinanced installments and masks contract numbers',()=>{
 const data=daycovalShareData({provider:'DAYCOVAL',troco:1250,term:108,table:{name:'Tabela A'},data:{contractAmount:7000},
 sourceContracts:[{originLenderCode:'237',originContractNumber:'9999998888',originalTerm:'96',openedInstallmentNumber:'37',lastDueBalance:'1000,00',installmentFaceValue:'50,00'},{originLenderCode:'329',originContractNumber:'1111112222',originalTerm:'96',openedInstallmentNumber:'84',lastDueBalance:'5000,00',installmentFaceValue:'120,00'}],
 installmentChanges:[{label:'Contrato 2',bankCode:'329',contractSuffix:'2222',originalInstallment:120,newInstallment:110},{label:'Contrato 1',bankCode:'237',contractSuffix:'8888',originalInstallment:50,newInstallment:50}]},{installment:170,rate:1.85});
 expect(data.original).toBe(170);expect(data.adjusted).toBe(160);expect(data.refin).toBe(170);expect(data.balance).toBe(6000);
 expect(data.contracts[0].remaining).toBe(84);expect(data.contracts[0].suffix).toBe('2222');expect(JSON.stringify(data)).not.toContain('1111112222');
});
it('does not invent missing debt or repayment values',()=>{
 const data=daycovalShareData({provider:'DAYCOVAL',troco:100,installmentChanges:[{label:'Contrato 1',originalInstallment:50,newInstallment:null}]},{});
 expect(data.balance).toBeNull();expect(data.adjusted).toBeNull();expect(data.refin).toBeNull();
});
