import {beforeEach,describe,expect,it,vi} from 'vitest';
const policy=vi.hoisted(()=>({blocked:false,review:false}));
vi.mock('../src/lib/portabilitySimulationPolicy',()=>({simulationPortabilityCheck:()=>({...policy,status:policy.blocked?'NÃO ELEGÍVEL':policy.review?'PENDENTE DE DADOS':'ELEGÍVEL',reason:'Critério sintético'})}));
import {prepareDaycovalWorkbook} from '../server/services/daycovalAutomaticWorkbook';
import {SPREADSHEET_MODELS} from '../server/services/portRefinWorkbooks';
import {serial,type DaycovalWorkbook} from '../server/services/daycovalWorkbook';
// Synthetic formula workbook exercises the real interpreter; not an official rate/table fixture.
const workbook=()=>({enabled:true,formulaHash:SPREADSHEET_MODELS.DAYCOVAL.hash,hash:'synthetic',fileName:'synthetic.xlsx',uploadedAt:'2026-10-01T00:00:00Z',terms:[36],tables:{},validFrom:'2026-10-01',validUntil:'2026-10-31',
 sheets:{'SIMULADOR COM SALDO':{rows:47,cols:17,cells:{M8:serial(new Date('2026-11-01T00:00:00Z')),F29:'SYNTHETIC - Table',K29:{formula:'E17+100'},L29:{formula:'E17'},M29:{formula:'K29-L29'},N29:'TAB disponivel',I29:0.01,J29:1,E25:{formula:'E19+E26'},E27:0.01,E20:0.01,E21:{formula:'E19'},O29:'Synthetic'}}}} as DaycovalWorkbook&{validFrom?:string;validUntil?:string});
const input={product:'INSS',operation:'PORT_REFIN',birthDate:'1980-01-01',benefitType:41,state:'SP',originalBank:'001',originalTerm:60,remainingTerm:36,originalInstallment:35,debt:900,term:36};
beforeEach(()=>{policy.blocked=false;policy.review=false;});
describe('automatic Daycoval worksheet with synthetic inputs and real interpreter',()=>{
 it('calculates in backend without API, manual spreadsheet input, rate or value',()=>{
  const fetch=vi.spyOn(globalThis,'fetch');try{const prepared=prepareDaycovalWorkbook(workbook(),input,'2026-10-30');
   expect(prepared.ready).toBe(true);expect(prepared.result?.offers[0]).toMatchObject({amount:100,installment:35,balance:900,term:36,rate:1,eligible:true});expect(fetch).not.toHaveBeenCalled();
  }finally{fetch.mockRestore();}
 });
 it.each([50,60])('still calculates outside special priority at installment %s',originalInstallment=>{expect(prepareDaycovalWorkbook(workbook(),{...input,originalInstallment},'2026-10-30').ready).toBe(true);});
 it('blocks a confirmed documentary restriction and retains pending review',()=>{
  policy.blocked=true;expect(prepareDaycovalWorkbook(workbook(),input,'2026-10-30').code).toBe('DOCUMENTARY_BLOCK');
  policy.blocked=false;policy.review=true;expect(prepareDaycovalWorkbook(workbook(),input,'2026-10-30').code).toBe('DOCUMENTARY_PENDING');
 });
 it('does not use absent, disabled or unrecognized worksheets',()=>{
  expect(prepareDaycovalWorkbook(null,input,'2026-10-30').code).toBe('WORKBOOK_UNAVAILABLE');
  expect(prepareDaycovalWorkbook({...workbook(),enabled:false},input,'2026-10-30').code).toBe('WORKBOOK_UNAVAILABLE');
  expect(prepareDaycovalWorkbook({...workbook(),formulaHash:'other'},input,'2026-10-30').code).toBe('WORKBOOK_INCOMPATIBLE');
 });
 it('does not treat upload date as validity and enforces both date bounds',()=>{
  expect(prepareDaycovalWorkbook({...workbook(),validUntil:undefined},input,'2026-10-30').code).toBe('WORKBOOK_VALIDITY_UNCONFIRMED');
  for(const today of ['2026-09-30','2026-11-01'])expect(prepareDaycovalWorkbook(workbook(),input,today).code).toBe('WORKBOOK_OUTSIDE_VALIDITY');
 });
 it.each(['birthDate','benefitType','originalBank','originalTerm','remainingTerm','debt','originalInstallment','term'])('requires %s without fabricating it',field=>{expect(prepareDaycovalWorkbook(workbook(),{...input,[field]:undefined},'2026-10-30').code).toBe('WORKBOOK_DATA_PENDING');});
 it('does not silently convert pure portability or reduction into refinancing',()=>{
  expect(prepareDaycovalWorkbook(workbook(),{...input,operation:'PORT'},'2026-10-30').code).toBe('WORKBOOK_OPERATION_UNSUPPORTED');
  expect(prepareDaycovalWorkbook(workbook(),{...input,value:30},'2026-10-30').code).toBe('WORKBOOK_DATA_PENDING');
 });
 it('fails closed for unsupported formula and unavailable term without a fictional offer',()=>{
  const book=workbook();book.sheets['SIMULADOR COM SALDO'].cells.M29={formula:'UNSUPPORTED_FUNCTION()'};
  expect(prepareDaycovalWorkbook(book,input,'2026-10-30')).toMatchObject({ready:false,result:null,code:'WORKBOOK_CALCULATION_UNAVAILABLE'});
  expect(prepareDaycovalWorkbook(workbook(),{...input,term:108},'2026-10-30').code).toBe('WORKBOOK_CALCULATION_UNAVAILABLE');
 });
});
