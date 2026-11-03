import {afterEach,expect,it,vi} from 'vitest';
import {eligibilityGroups} from '../src/lib/eligibilityGroups';
import {simulationPortabilityCheck} from '../src/lib/portabilitySimulationPolicy';
import {FactaSimulationService} from '../server/services/factaSimulationService';
import {FactaBankService} from '../server/services/factaBankService';
import {evaluatePortabilityPolicy} from '../src/lib/portabilityPolicy';
import {activePortabilityReplacement} from '../src/lib/portabilityActiveRules';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('groups common pending data once without approving unknown banks or hiding bank-specific restrictions',()=>{
 const projection=eligibilityGroups([
  {bank:'A',check:{review:true,notices:['Informe saldo devedor válido.','Prazo específico pendente.']}},
  {bank:'B',check:{review:true,notices:['Informe saldo devedor válido.']}},
  {bank:'C',check:{blocked:true,reasons:['Origem não permitida.']}},
  {bank:'D',check:{status:'ELEGÍVEL'}},
  {bank:'E',calculated:true},
 ]);
 expect(projection.common).toEqual([{message:'Informe saldo devedor válido.',count:2}]);
 expect(projection.groups.map(group=>group.rows.length)).toEqual([1,1,0,2,1]);
 expect(projection.groups[3].rows[0].pending).toEqual(['Prazo específico pendente.']);
 expect(projection.groups[4].rows[0].restrictions).toEqual(['Origem não permitida.']);
});
it('preserves Brazilian financial inputs and the remaining-installments alias without inventing missing values',()=>{
 const raw={product:'INSS',operation:'PORT_REFIN',originalBank:'001',originalTerm:84,remainingTerm:36,birthDate:'1980-01-01',benefitType:41,term:84,state:'SP',debt:20000,originalInstallment:900};
 const numeric=simulationPortabilityCheck('daycoval',raw);
 expect(simulationPortabilityCheck('daycoval',{...raw,debt:'20.000,00',originalInstallment:'900,00',remainingTerm:undefined,remainingInstallments:36,paidInstallments:48})).toEqual(numeric);
 const missing=simulationPortabilityCheck('daycoval',{...raw,debt:undefined});
 expect(missing.review).toBe(true);expect(missing.reason).toMatch(/saldo devedor/);
 expect(simulationPortabilityCheck('daycoval',{...raw,debt:'inválido 20000'}).review).toBe(true);
});
it.each(['PENDING','PROCESSING','REJECTED','FAILED'])('HTTP 200 with business %s never creates an INSS offer or retries',async status=>{
 vi.spyOn(FactaBankService,'getTenantConfig').mockResolvedValue({isConfigured:true,simulationEnabled:true,baseUrl:FactaBankService.PRODUCTION_BASE_URL} as any);
 vi.spyOn(FactaBankService,'getToken').mockResolvedValue('synthetic-token');
 const fetch=vi.fn(async()=>new Response(JSON.stringify({status,tabelas:[{codigoTabela:'synthetic',valor_liquido:1000,parcela:50,prazo:36}]}),{status:200}));vi.stubGlobal('fetch',fetch);
 const result=await FactaSimulationService.inss({} as any,'synthetic-tenant',{cpf:'00000000000',birthDate:'1980-01-01',benefitNumber:'synthetic',benefitType:41,operation:'NEW',term:36,mode:'INSTALLMENT',value:50});
 expect(result.offers).toEqual([]);expect(result.message).toContain('não concluiu');expect(fetch).toHaveBeenCalledTimes(1);
});
it('reproduces BB amounts without false missing data and applies the NEW Daycoval table where age 67 can use 108',()=>{
 const raw={product:'INSS',operation:'PORT_REFIN',originalBank:'001',originalTerm:84,remainingTerm:15,debt:'1.548,18',originalInstallment:'25,91',term:108,birthDate:'1959-10-30',simulationDate:'2026-10-30',benefitType:41};
 const result=simulationPortabilityCheck('daycoval',raw);
 expect(result.blocked).toBe(false);expect(result.status).toBe('PENDENTE DE DADOS');
 expect(result.reason).not.toMatch(/Informe saldo|Informe parcela|parcelas restantes|NBC|CIP|UF|data efetiva|saldo mínimo|parcela mínima/);
 expect(simulationPortabilityCheck('parana',raw).reason).not.toMatch(/Informe saldo/);
});
it('new Daycoval rules replace the pure-portability permission and old maturity limit',()=>{
 const base={operation:'PORT_REFIN',birthDate:'1959-10-30',simulationDate:'2026-10-30',benefitType:41,term:108,debt:1548.18,originalInstallment:25.91,remainingInstallments:15};
 expect(evaluatePortabilityPolicy('daycoval','001',69,{...base,contractEndDate:'2050-01-01'})!.blocked).toBe(false);
 expect(evaluatePortabilityPolicy('daycoval','001',69,{...base,operation:'PORT'})!.reasons.join(' ')).toMatch(/não atende portabilidade pura/);
});
it('does not turn a successful HTTP envelope or an incomplete table into a calculated offer',async()=>{
 vi.spyOn(FactaBankService,'getTenantConfig').mockResolvedValue({isConfigured:true,simulationEnabled:true} as any);
 vi.spyOn(FactaSimulationService,'request').mockResolvedValue({erro:false,tabelas:[{codigoTabela:'synthetic',tabela:'Em análise',prazo:36}]});
 const result=await FactaSimulationService.inss({} as any,'synthetic-tenant',{cpf:'00000000000',birthDate:'1980-01-01',benefitNumber:'synthetic',benefitType:41,operation:'NEW',term:36,mode:'INSTALLMENT',value:50});
 expect(result.offers).toEqual([]);expect(result.message).toMatch(/sem os campos financeiros/);
});
it('normalizes the reproduced Brazilian amounts into the FACTA query while retaining the selected tenant',async()=>{
 vi.spyOn(FactaBankService,'getTenantConfig').mockResolvedValue({isConfigured:true,simulationEnabled:true} as any);
 const request=vi.spyOn(FactaSimulationService,'request').mockResolvedValue({erro:false});
 await FactaSimulationService.inss({} as any,'synthetic-a',{cpf:'00000000000',birthDate:'1959-10-30',benefitNumber:'synthetic',benefitType:41,operation:'PORT_REFIN',term:108,mode:'INSTALLMENT',value:25.91,debt:'1.548,18',originalInstallment:'25,91',originalTerm:84,remainingTerm:15,originalBank:'001'} as any);
 expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][1]).toBe('synthetic-a');expect(request.mock.calls[0][3]).toMatchObject({saldo_devedor:1548.18,valor_parcela_original:25.91,prazo_original:84,prazo_restante:15});
});
it('reports an existing balance below a documented bank threshold as a restriction rather than missing data',()=>{
 const result=evaluatePortabilityPolicy('facta','001',69,{operation:'PORT',birthDate:'1959-10-30',simulationDate:'2026-10-30',benefitType:41,term:15,remainingInstallments:15,debt:1548.18,originalInstallment:25.91})!;
 expect(result.blocked).toBe(true);expect(result.reasons.join(' ')).toContain('saldo mínimo de R$ 1900.00');expect(result.notices.join(' ')).not.toMatch(/Informe saldo/);
});
it('uses only the latest Daycoval per-term age map, retaining the old financial bands as archive only',()=>{
 const criteria=activePortabilityReplacement.banks.find(bank=>bank.id==='daycoval')!.criteria;
 expect(criteria.ageByTerm).toEqual({'108':70,'96':71,'84':72});expect(criteria.portabilityAgeBands).toBeUndefined();expect(criteria.maxEndMonths).toBeUndefined();
 const base={operation:'PORT_REFIN',simulationDate:'2026-10-30',benefitType:41,debt:3481.19,originalInstallment:43,remainingInstallments:57,contractAmount:10000,amount:100};
 for(const [age,term] of [[70,108],[71,96],[72,84]]){
  expect(evaluatePortabilityPolicy('daycoval','001',27,{...base,birthDate:`${2026-age}-10-30`,term})!.blocked).toBe(false);
  expect(evaluatePortabilityPolicy('daycoval','001',27,{...base,birthDate:`${2025-age}-10-30`,term})!.blocked).toBe(true);
 }
});
