import {expect,it,vi} from 'vitest';
vi.mock('../server/services/daycovalWorkbook',()=>({
 simulateDaycoval:()=>({offers:[{amount:1000,installment:900,term:36,rate:1.8,eligible:true,status:'Disponível na planilha'}],version:{}}),
 importDaycoval:vi.fn(),DaycovalCalculator:class{},serial:vi.fn(),parseDate:vi.fn(),addMonths:vi.fn(),
}));
vi.mock('../server/services/nossaFintechWorkbook',()=>({simulateNossaWorkbook:vi.fn(),nossaWorkbookTables:vi.fn(),NOSSA_WORKBOOK_KEY:'synthetic'}));
import {calculatePortRefin} from '../server/services/portRefinWorkbooks';
it('retains calculated offers for review without marking disputed workbook conditions ready for automatic registration',()=>{
 const result=calculatePortRefin('DAYCOVAL',{} as any,{birthDate:'1980-01-01',simulationDate:'2026-10-30',state:'SP',benefitType:41,term:36,
  contracts:[{originBank:'001',paidInstallments:30,balance:10000,installment:900,remaining:36}],refinanceRate:1.8});
 expect(result.offers).toHaveLength(1);expect(result.offers[0]).toMatchObject({amount:1000,eligible:false,policyStatus:'PENDENTE DE DADOS'});
 expect(result.offers[0].status).toContain('Divergência documental');
});
