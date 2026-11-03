import {expect,it} from 'vitest';
import {evaluatePortabilityPolicy,portabilityBankId} from '../src/lib/portabilityPolicy';
import {portabilityRuleSources} from '../src/lib/portabilityRuleSources';
import latest from '../src/data/portabilityRulesReplacement20261103.json';
import {activePortabilityReplacement,archivedPortabilityReplacement} from '../src/lib/portabilityActiveRules';
const base={product:'INSS',operation:'PORT_REFIN',birthDate:'1980-11-03',simulationDate:'2026-11-03',benefitType:41,term:108,remainingInstallments:57,originalInstallment:900,installment:900,debt:20000,amount:1000,contractAmount:22000,originCategory:'NETWORK' as const};
const check=(bank:string,patch:any={},origin='001',paid=27)=>evaluatePortabilityPolicy(bank,origin,paid,{...base,...patch})!;
it.each(latest.banks)('$name uses exclusively the newest source for replaced criteria',bank=>{
 const result=portabilityRuleSources(bank.id,'001');expect(result.criteria).toEqual(bank.criteria);expect(result.sources).toHaveLength(1);expect(result.sources[0]).toMatchObject({file:latest.sourceFile,receivedAt:'2026-11-03',sha256:latest.sourceSha256});expect(result.conflicts).toEqual([]);
});
it('preserves unlisted banks and archives without merging old Daycoval bands into new policy',()=>{
 expect(archivedPortabilityReplacement.banks.find(bank=>bank.id==='daycoval')!.criteria.pure).toBe(true);
 expect(portabilityRuleSources('daycoval','001').criteria.pure).toBe(false);
 expect(activePortabilityReplacement.banks.find(bank=>bank.id==='daycoval')!.criteria.portabilityAgeBands).toBeUndefined();
 expect(portabilityRuleSources('quero-banking','001').sources[0].receivedAt).toBe('2026-10-30');
 expect(portabilityBankId('PB CONSIGNADO')).toBe('parana');expect(portabilityBankId('PARANÁ BANCO')).toBe('parana');expect(portabilityBankId('Banrisul')).toBe('banrisul');
});
it('applies updated named and category paid-installment rules without guessing unknown bank logos',()=>{
 expect(check('c6',{operation:'PORT',portRate:1.84}).blocked).toBe(true);expect(check('c6',{operation:'PORT',portRate:1.85}).blocked).toBe(false);
 expect(check('c6',{},'623',36).blocked).toBe(true);expect(check('c6',{},'623',37).blocked).toBe(false);
 expect(check('daycoval',{},'001',5).blocked).toBe(true);expect(check('daycoval',{},'001',6).blocked).toBe(false);
 expect(check('happy',{},'001',5).blocked).toBe(true);expect(check('happy',{},'001',6).blocked).toBe(false);
 expect(check('facta',{},'643').blocked).toBe(true);expect(check('facta',{},'611').blocked).toBe(false);
});
it('validates Paraná payment range and ICRED balance plus cash instead of demanding 3000 in debt',()=>{
 expect(check('parana',{paymentOrder:true,paymentOrderBankCode:'033',paymentOrderAmount:1499}).blocked).toBe(true);
 expect(check('parana',{paymentOrder:true,paymentOrderBankCode:'033',paymentOrderAmount:1500}).blocked).toBe(false);
 expect(check('parana',{paymentOrder:true,paymentOrderBankCode:'033',paymentOrderAmount:2000}).blocked).toBe(false);
 expect(check('parana',{paymentOrder:true,paymentOrderBankCode:'033',paymentOrderAmount:2001}).blocked).toBe(true);
 expect(check('icred',{debt:2900,amount:100}).blocked).toBe(false);expect(check('icred',{debt:2899,amount:100}).blocked).toBe(true);
});
it('checks Havecred term-specific ages, strict species 4/5/6 and denied 32/92',()=>{
 expect(check('havecred',{birthDate:'1955-03-03',term:108}).blocked).toBe(false);
 expect(check('havecred',{birthDate:'1954-03-03',term:108}).blocked).toBe(true);
 for(const benefitType of [32,92])expect(check('havecred',{benefitType}).blocked).toBe(true);
 for(const benefitType of [4,5,6]){expect(check('havecred',{benefitType,birthDate:'1968-11-03'}).blocked).toBe(true);expect(check('havecred',{benefitType,birthDate:'1968-11-02'}).blocked).toBe(false);}
 expect(check('havecred',{debt:1000,contractAmount:5000}).blocked).toBe(true);expect(check('havecred',{debt:1000,contractAmount:5000.01}).blocked).toBe(false);
 expect(check('havecred',{debt:9999,refinRate:1.7}).blocked).toBe(true);
});
it('enforces FINANTO 2% only with known new indebtedness and preserves the untranscribed 41-term case',()=>{
 expect(check('finanto',{contractAmount:10000,amount:199.99}).blocked).toBe(true);expect(check('finanto',{contractAmount:10000,amount:200}).blocked).toBe(false);
 expect(check('finanto',{contractAmount:undefined,amount:1}).blocked).toBe(false);expect(check('finanto',{contractAmount:undefined,amount:1}).review).toBe(true);
 expect(check('finanto',{term:41,contractAmount:10000,amount:1}).blocked).toBe(false);expect(check('finanto',{term:41,contractAmount:10000,amount:1}).reason).toMatch(/não individualizada/);
});
it('applies Nossa and QUALI species/final-age rules without interpreting missing dates as approval',()=>{
 expect(check('nossa-fintech',{benefitType:32}).blocked).toBe(true);expect(check('nossa-fintech',{benefitType:5,birthDate:'1967-11-03'}).blocked).toBe(true);
 expect(check('nossa-fintech',{birthDate:'1954-11-03',term:84}).blocked).toBe(false);expect(check('nossa-fintech',{birthDate:'1954-11-03',term:96}).blocked).toBe(true);
 expect(check('quali',{benefitType:32,contractEndDate:undefined}).review).toBe(true);
 expect(check('quali',{benefitType:32,contractEndDate:'2046-08-03'}).blocked).toBe(false);
 expect(check('quali',{benefitType:32,contractEndDate:'2046-07-03'}).blocked).toBe(true);
 expect(check('quali',{installment:890}).blocked).toBe(true);expect(check('quali',{installment:891}).blocked).toBe(false);
});
it('uses Banrisul explicit benefit-duration exception without inferring unprovided invalidity exceptions',()=>{
 const data={benefitType:32,birthDate:'1970-11-03',benefitStartDate:'2011-11-03'};
 expect(check('banrisul',data).blocked).toBe(false);expect(check('banrisul',{...data,benefitStartDate:'2011-11-04'}).blocked).toBe(true);
 expect(check('icred',{benefitType:32,birthDate:'1970-11-03'}).blocked).toBe(false);expect(check('icred',{benefitType:32,birthDate:'1970-11-03'}).review).toBe(true);
});
