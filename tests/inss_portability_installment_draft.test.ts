// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {inssSimulationDraft} from '../server/services/inssSimulationDraft';
import {buildPortRefinBreakdown} from '../src/lib/portRefinBreakdown';
const customerData={birthDate:'1966-06-15',benefitNumber:'0000000001',benefitType:32,name:'Exemplo sem dados reais'};
const fields=[
 {label:'Contrato 1',bankCode:'041',contractSuffix:'1234',originalInstallment:216.3,newInstallment:216.3},
 {label:'Contrato 2',bankCode:'237',contractSuffix:'5678',originalInstallment:621.22,newInstallment:610},
 {label:'Contrato 4',bankCode:'237',contractSuffix:'9012',originalInstallment:64.66,newInstallment:64.66},
];
const selectedCondition={provider:'DAYCOVAL',tableId:'805315',tableName:'RFN INSS 5',term:108,rate:1.79,amount:10289.01,installment:902.18,quoteKind:'SPREADSHEET_ESTIMATE',portabilityBreakdown:buildPortRefinBreakdown(fields,902.18)};
describe('persistência auditável de parcelas portadas',()=>{
 it('mantém três parcelas, totais recalculados e refin independente do total da portabilidade',()=>{
  const saved=inssSimulationDraft({operationType:'PORT_REFIN',customerData,selectedCondition});
  expect(saved.selectedCondition.portabilityBreakdown).toMatchObject({originalPortabilityTotal:902.18,adjustedPortabilityTotal:890.96,refinanceInstallment:902.18});
  expect(saved.selectedCondition.portabilityBreakdown.contracts).toHaveLength(3);
  expect(saved.selectedCondition.reviewState).toBe('PENDING');
 });
 it('recalcula totais no servidor e ignora valores adulterados no envio',()=>{
  const saved=inssSimulationDraft({operationType:'PORT_REFIN',customerData,selectedCondition:{
    ...selectedCondition,portabilityBreakdown:{...selectedCondition.portabilityBreakdown,originalPortabilityTotal:9999999,adjustedPortabilityTotal:9999999,refinanceInstallment:9999999,
    contracts:fields.map(contract=>({...contract,unexpected:'not to persist'}))},
  }});
  const stored=saved.selectedCondition.portabilityBreakdown;
  expect(stored.originalPortabilityTotal).toBe(902.18);
  expect(stored.adjustedPortabilityTotal).toBe(890.96);
  expect(stored.refinanceInstallment).toBe(902.18);
  expect(JSON.stringify(stored)).not.toContain('not to persist');
 });
 it('não transforma cotação Daycoval em condição bancária aprovada',()=>{
  const saved=inssSimulationDraft({operationType:'PORT_REFIN',customerData,selectedCondition});
  expect(saved.customerData.quoteReview).toMatchObject({status:'PENDING',required:true});
  expect(saved.selectedCondition.quoteKind).toBe('SPREADSHEET_ESTIMATE');
 });
});
