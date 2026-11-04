import {daycovalContractGroups,validateSimulationContracts} from '../src/lib/multiContractSimulation';
import {afterEach,expect,it,vi} from 'vitest';
import {simulationPortabilityCheck} from '../src/lib/portabilitySimulationPolicy';
import {paidFromTerms} from '../src/lib/portabilityEligibility';
import {eligibilityGroups} from '../src/lib/eligibilityGroups';
import {FactaSimulationService} from '../server/services/factaSimulationService';
import {FactaBankService} from '../server/services/factaBankService';
import {previewPortRefin} from '../server/services/portRefinPreview';
import {SPREADSHEET_MODELS} from '../server/services/portRefinWorkbooks';
import {serial} from '../server/services/daycovalWorkbook';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const input={product:'INSS',operation:'PORT_REFIN',originalBank:'001',originalTerm:84,remainingTerm:57,debt:3481.19,originalInstallment:43,term:84,birthDate:'1959-10-30',simulationDate:'2026-10-30',benefitType:41};
it('recognizes 27 paid installments, known BB CIP and calculation readiness without falsely approving contracting',()=>{
 expect(paidFromTerms(84,57)).toBe(27);
 for(const bank of ['daycoval','c6','facta','nossa-fintech']){
  const check=simulationPortabilityCheck(bank,input);expect(check.blocked).toBe(false);expect(check.calculationAllowed).toBe(true);
  expect(check.reason).not.toMatch(/UF|Confirme participação/);
  const model=eligibilityGroups([{bank,check}]);expect(model.groups.find(group=>group.status==='APTO PARA CÁLCULO')?.rows).toHaveLength(1);expect(model.common).toEqual([]);
 }
 expect(simulationPortabilityCheck('daycoval',{...input,originalInstallment:19}).blocked).toBe(true);
 expect(simulationPortabilityCheck('daycoval',{...input,originalBank:'626'}).blocked).toBe(true);
 expect(simulationPortabilityCheck('daycoval',{...input,debt:undefined}).calculationAllowed).toBe(false);
});
it.each([['','EMPTY_RESPONSE'],['<html>synthetic error</html>','NON_JSON_RESPONSE'],['broken','INVALID_JSON'],['null','INVALID_RESPONSE'],['{"erro":true}','BANK_REJECTED']])('distinguishes HTTP 200 response shape %s with no bank retry',async(body,code)=>{
 vi.spyOn(FactaBankService,'getTenantConfig').mockResolvedValue({isConfigured:true,simulationEnabled:true,baseUrl:FactaBankService.PRODUCTION_BASE_URL} as any);
 vi.spyOn(FactaBankService,'getToken').mockResolvedValue('synthetic-token');
 const fetch=vi.fn(async()=>new Response(body,{status:200}));vi.stubGlobal('fetch',fetch);
 await expect(FactaSimulationService.request({} as any,'synthetic-a','/proposta/operacoes-disponiveis')).rejects.toMatchObject({httpStatus:200,diagnosticCode:code});expect(fetch).toHaveBeenCalledTimes(1);
});
const book=()=>({enabled:true,formulaHash:SPREADSHEET_MODELS.DAYCOVAL.hash,hash:'synthetic',fileName:'synthetic.xlsx',terms:[84],validFrom:'2026-10-01',validUntil:'2026-11-30',tables:{},
 sheets:{'SIMULADOR COM SALDO':{rows:47,cols:17,cells:{M8:serial(new Date('2026-11-01T00:00:00Z')),F29:'SYNTHETIC - Table',K29:{formula:'E17+100'},L29:{formula:'E17'},M29:{formula:'K29-L29'},N29:'TAB disponivel',I29:0.01,J29:1,E25:{formula:'E19+E26'},E27:0.01,E20:0.01,E21:{formula:'E19'},O29:'Synthetic'}}}});
const request=()=>({birthDate:input.birthDate,benefitType:41,term:84,contracts:[{originBank:'001',originalTerm:84,remaining:57,balance:'3.481,19',installment:'43,00'}]});
it('calculates the reproduced condition through the real interpreter with synthetic formulas; documentary review does not erase the result',()=>{
 const fetch=vi.spyOn(globalThis,'fetch');
 const result=previewPortRefin('DAYCOVAL',book(),request(),'2026-10-30');
 expect(result.paidInstallments).toEqual([27]);expect(result.offers[0]).toMatchObject({amount:100,contractAmount:3581.19,installment:43,term:84,requiresReview:true,quoteKind:'ESTIMATE'});
 expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toMatch(/formula|E17|CPF/);
});
it('rejects absent, incompatible, expired and unsupported worksheets without fabricating conditions',()=>{
 for(const candidate of [null,{...book(),enabled:false},{...book(),formulaHash:'other'},{...book(),validUntil:'2026-10-01'}])expect(()=>previewPortRefin('DAYCOVAL',candidate,request(),'2026-10-30')).toThrow();
 expect(previewPortRefin('DAYCOVAL',book(),{...request(),term:96},'2026-10-30').offers[0].term).toBe(84);
 expect(()=>previewPortRefin('DAYCOVAL',book(),{...request(),contracts:[{...request().contracts[0],remaining:85}]},'2026-10-30')).toThrow();
});
it('returns only the highest successful Daycoval term from the imported workbook',()=>{
 const b=book();b.terms=[108,96,84];
 expect(previewPortRefin('DAYCOVAL',b,{...request(),term:108},'2026-10-30')).toMatchObject({requestedTerm:108,calculatedTerm:108});
 const younger={...request(),birthDate:'1980-01-01',term:108};
 expect(previewPortRefin('DAYCOVAL',b,younger,'2026-10-30').offers.map(row=>row.term)).toEqual([108]);
 b.sheets['SIMULADOR COM SALDO'].cells.N29={formula:'IF(I26=108,"Sem oferta","TAB disponivel")'} as any;
 expect(previewPortRefin('DAYCOVAL',b,younger,'2026-10-30').offers.map(row=>row.term)).toEqual([96]);
 b.terms=[108,96];expect(()=>previewPortRefin('DAYCOVAL',b,{...request(),birthDate:'1954-10-30',term:108},'2026-10-30')).toThrow(/idade/);
});
it('uses only Paraná rates from the workbook and requires the total number of benefit contracts explicitly',()=>{
 const b={enabled:true,formulaHash:SPREADSHEET_MODELS.PARANA.hash,hash:'synthetic-parana',terms:[84],validFrom:'2026-10-01',validUntil:'2026-11-30',tables:{},sheets:{
  'Premissas Convênios':{cells:{A21:'INSS',B21:84,C21:108,D21:120,E21:10000,F21:0.0185,G21:0.0185}},
  'Simulador Portabilidade e Refin':{cells:{F17:{formula:'J12-D12'},J12:{formula:'D12+200'},D20:'✅ Calculado',L12:serial(new Date('2026-11-01T00:00:00Z')),G15:1,H15:0,F9:0.0185}},
  'Build Up':{cells:{}},
 }};
 const raw={...request(),birthDate:'1980-01-01',contracts:[{...request().contracts[0],balance:10000,installment:900}]};
 expect(()=>previewPortRefin('PARANA',b,raw,'2026-10-30')).toThrow(/quantidade total/);
 const result=previewPortRefin('PARANA',b,{...raw,benefitContractCount:1},'2026-10-30');
 expect(result.offers[0]).toMatchObject({provider:'PARANA',term:84,amount:200});
 expect(result.offers[0].rate).toBeCloseTo(1.85,8);
 expect(()=>previewPortRefin('PARANA',b,{...raw,benefitContractCount:1,refinanceRate:1.7},'2026-10-30')).toThrow(/nenhuma taxa/);
});

it('enumerates unique groups of two and three without merging the original contracts',()=>{
 const contracts=Array.from({length:5},(_,index)=>({originLenderCode:'001',originContractNumber:`SYNTHETIC-${index}`,originalTerm:'84',openedInstallmentNumber:'57',lastDueBalance:'3.481,19',installmentFaceValue:'43,00'}));
 validateSimulationContracts(contracts);
 const groups=daycovalContractGroups(contracts);expect(groups).toHaveLength(20);
 expect(new Set(groups.map(group=>group.map(c=>c.originContractNumber).join('|'))).size).toBe(20);
 expect(groups.every(group=>group.length===2||group.length===3)).toBe(true);
 expect(()=>validateSimulationContracts([contracts[0],contracts[0]])).toThrow(/repetido/);
 expect(()=>validateSimulationContracts([contracts[0],{...contracts[0],originLenderCode:'1'}])).toThrow(/repetido/);
 expect(()=>validateSimulationContracts([{...contracts[0],lastDueBalance:'inválido'}])).toThrow(/Revise/);
 expect(()=>validateSimulationContracts(Array.from({length:14},(_,index)=>({...contracts[0],originContractNumber:String(index)})))).toThrow(/13/);
});

it('uses the real interpreter for a three-contract Daycoval calculation, preserving individual debts and restrictions',()=>{
 const b=book();const cells=b.sheets['SIMULADOR COM SALDO'].cells as Record<string,any>;
 cells.K29={formula:'SUM(E17:G17)+300'};cells.L29={formula:'SUM(E17:G17)'};cells.E25={formula:'SUM(E19:G19)'};
 const contracts=Array.from({length:3},()=>({...request().contracts[0]}));
 const result=previewPortRefin('DAYCOVAL',b,{...request(),contracts},'2026-10-30');
 expect(result.offers[0]).toMatchObject({amount:300,installment:129,term:84});
 expect(result.paidInstallments).toEqual([27,27,27]);
 expect(()=>previewPortRefin('DAYCOVAL',b,{...request(),contracts:[...contracts,{...contracts[0]}]},'2026-10-30')).toThrow(/1 a 3/);
 expect(()=>previewPortRefin('DAYCOVAL',b,{...request(),contracts:[contracts[0],{...contracts[1],originBank:'626'}]},'2026-10-30')).toThrow(/origem/);
});

it('accepts thirteen individual contracts and generates 364 distinct Daycoval combinations of at most three',()=>{
 const contracts=Array.from({length:13},(_,index)=>({originLenderCode:'001',originContractNumber:`SYNTHETIC-${index}`,originalTerm:'84',openedInstallmentNumber:'57',lastDueBalance:'3.481,19',installmentFaceValue:'43,00'}));
 expect(()=>validateSimulationContracts(contracts)).not.toThrow();
 const groups=daycovalContractGroups(contracts);expect(groups).toHaveLength(364);
 expect(groups.every(group=>group.length===2||group.length===3)).toBe(true);
 expect(new Set(groups.map(group=>group.map(c=>c.originContractNumber).join('|'))).size).toBe(364);
});
