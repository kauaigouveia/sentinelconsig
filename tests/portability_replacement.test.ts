import {portabilityGuide} from '../src/lib/portabilityGuide';
import {simulateNossaWorkbook} from '../server/services/nossaFintechWorkbook';
import {calculatePortRefin} from '../server/services/portRefinWorkbooks';
import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import replacement from '../src/data/portabilityRulesReplacement20261030.json';
import {evaluatePortabilityPolicy,portabilityBankId} from '../src/lib/portabilityPolicy';
import {portabilityRuleSources,portabilitySourceCatalog} from '../src/lib/portabilityRuleSources';
import {simulationPortabilityCheck} from '../src/lib/portabilitySimulationPolicy';
import {PORTABILITY_BOOKS,PORTABILITY_ARCHIVE_BOOKS,PORTABILITY_SECTIONS} from '../src/lib/portabilityPlaybooks';
import {searchBankPlaybooks} from '../src/lib/bankPlaybooks';
import {finantoAgeError,nossaFintechAgeError,finantoInstallmentError,finantoRefinancingChoices,finantoTableLabel,finantoCashOutError} from '../src/lib/inssEligibility';
const base={product:'INSS',operation:'PORT_REFIN',birthDate:'1980-01-01',simulationDate:'2026-10-30',state:'SP',benefitType:41,term:108,remainingInstallments:36,originalInstallment:900,installment:900,debt:20000,amount:1000,contractEndDate:'2035-10-30',originCategory:'NETWORK' as const,cipMember:true};
const check=(bank:string,patch:any={},origin='001',paid=40)=>evaluatePortabilityPolicy(bank,origin,paid,{...base,...patch})!;
describe('express replacement of INSS portability criteria, synthetic fixtures',()=>{
 it('preserves the exact source file and its hash without manufacturing commercial validity',()=>{
  const bytes=readFileSync(new URL('../docs/sources/portability-inss-replacement-20261030.md',import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(replacement.sourceSha256);expect(replacement.effectiveAt).toBeNull();expect(replacement.banks).toHaveLength(13);
 });
 it.each(replacement.banks)('$name uses one replacement source and no obsolete conflicts',bank=>{
  const resolved=portabilityRuleSources(bank.id,'001','NETWORK');
  expect(resolved.criteria).toEqual(bank.criteria);expect(resolved.conflicts).toEqual([]);expect(resolved.ageAlternatives).toEqual([]);
  expect(resolved.sources).toHaveLength(1);expect(resolved.sources[0].file).toBe('Markdown colado(5).md');
  expect(check(bank.id).reason).not.toMatch(/Divergência documental|entre os dois documentos|ambas as fontes|mínimo de pagas conflitante/);
  expect(PORTABILITY_BOOKS.filter(row=>row.bankId===bank.id)).toHaveLength(1);
  expect(PORTABILITY_SECTIONS.filter(row=>row.bankId===bank.id).every(row=>row.id.endsWith('replacement-20261030'))).toBe(true);expect(portabilityGuide(bank.id)?.hasConflicts).toBe(false);
 });
 it('retains archives but excludes obsolete sources from active INSS portability search',()=>{
  expect(PORTABILITY_ARCHIVE_BOOKS.filter(row=>row.bankId==='facta').length).toBeGreaterThan(1);
  const rows=searchBankPlaybooks('FACTA portabilidade saldo mínimo');
  expect(rows.filter(row=>row.bankId==='facta').every(row=>row.sourceFile==='Markdown colado(5).md')).toBe(true);
  const inherited=searchBankPlaybooks('FACTA portabilidade 99999',false,[{id:'facta-p5',bankId:'facta',name:'FACTA',version:'old',receivedAt:'2026-10-16',source:'old',sourceFile:'old.pdf',text:'FACTA portabilidade 99999'} as any]);
  expect(inherited.some(row=>row.sourceFile==='old.pdf')).toBe(false);
 });
 it('keeps Paraná/Banrisul separate and does not map Quero Banking to other institutions',()=>{
  for(const name of ['PB CONSIGNADO','PARANÁ BANCO','BANCO PARANÁ','PB Consignado — Paraná Banco'])expect(portabilityBankId(name)).toBe('parana');
  expect(portabilityBankId('Banrisul')).toBe('banrisul');expect(portabilityBankId('Quero Banking')).toBe('quero-banking');
  expect(portabilityBankId('Quero Banking')).not.toBe(portabilityBankId('Quali Banking'));
  expect(portabilityBankId('Quero Banking')).not.toBe(portabilityBankId('Quero + Crédito'));
 });
 it.each([['facta',0,1900],['c6',undefined,2000]])('%s scopes pure portability minima without a refinancing fallback', (bank,general,pure)=>{
  const rules=portabilityRuleSources(bank,'001').criteria;expect(rules.minBalance).toBe(general);expect(rules.pureMinBalance).toBe(pure);
  expect(check(bank,{operation:'PORT',debt:Number(pure)-.01}).blocked).toBe(true);
  expect(check(bank,{debt:900,originalInstallment:35,installment:35}).reasons.some(line=>line.includes('saldo mínimo'))).toBe(false);
 });
 it.each([[1.85,4000],[1.8,6000],[1.75,11000],[1.71,13000]])('Happy keeps the explicit %s table minimum %s', (refinRate,debt)=>{
  expect(check('happy',{refinRate,debt:debt-.01}).blocked).toBe(true);expect(check('happy',{refinRate,debt}).blocked).toBe(false);
 });
 it('Happy unknown table/rate remains pending without assuming the lowest minimum',()=>{
  const result=check('happy',{debt:20000,refinRate:1.79});expect(result.status).toBe('PENDENTE DE DADOS');expect(result.reason).toContain('não individualizada');
 });
 it.each([['daycoval',20],['finanto',50],['digio',70],['parana',120]])('%s applies installment minimum %s', (bank,min)=>{
  expect(check(bank,{originalInstallment:min-.01,installment:min-.01}).blocked).toBe(true);
  expect(check(bank,{originalInstallment:min,installment:min}).blocked).toBe(false);
 });
 it('does not invent a Daycoval minimum balance or lose unknown DIGIO/Havecred minima',()=>{
  expect(portabilityRuleSources('daycoval','001').criteria.minBalance).toBe(0);
  for(const bank of ['digio','havecred']){expect(portabilityRuleSources(bank,'001').criteria.minBalance).toBeUndefined();expect(check(bank,{debt:1}).status).toBe('PENDENTE DE DADOS');}
 });
 it.each([['digio',250],['facta',50],['nossa-fintech',100]])('%s keeps its documented cash minimum %s', (bank,amount)=>{
  expect(check(bank,{amount:amount-.01}).blocked).toBe(true);expect(check(bank,{amount}).blocked).toBe(false);
 });
 it('Quero Banking paid bands do not become a fictitious minimum balance',()=>{
  expect(portabilityRuleSources('quero-banking','001').criteria.minBalance).toBeUndefined();
  expect(check('quero-banking',{debt:1999},'001',0).reasons.some(line=>line.includes('saldo mínimo'))).toBe(false);
  expect(check('quero-banking',{debt:2000},'001',17).blocked).toBe(true);
  expect(check('quero-banking',{debt:5999.99},'001',18).blocked).toBe(false);
  expect(check('quero-banking',{debt:6000},'001',5).blocked).toBe(true);
  expect(check('quero-banking',{debt:6000},'001',6).blocked).toBe(false);
 });
 it.each([['c6','623',37],['daycoval','623',15],['daycoval','149',24],['parana','121',13],['icred','149',12],['banrisul','623',30],['happy','318',12]])('%s uses documented paid agreement for %s', (bank,origin,paid)=>{
  expect(check(bank,{},origin,paid-1).blocked).toBe(true);expect(check(bank,{},origin,paid).blocked).toBe(false);
 });
 it.each([['digio','237'],['c6','707'],['daycoval','626'],['facta','611'],['happy','070'],['parana','149'],['icred','012'],['banrisul','070'],['havecred','643'],['finanto','422'],['nossa-fintech','389'],['quero-banking','335'],['brb','121']])('%s excludes its confirmed origin %s', (bank,origin)=>{expect(check(bank,{},origin).blocked).toBe(true);});
 it.each(replacement.banks)('$name does not approve missing data and rejects documented LOAS',bank=>{
  expect(evaluatePortabilityPolicy(bank.id,'',undefined,{product:'INSS',operation:'PORT_REFIN'})?.status).toBe('PENDENTE DE DADOS');
  expect(check(bank.id,{benefitType:87}).blocked).toBe(true);
 });
 it('enforces only the documented age context and keeps omitted FACTA maxima pending',()=>{
  expect(check('digio',{birthDate:'1955-10-30'}).blocked).toBe(true);
  expect(check('c6',{birthDate:'1953-10-30'}).blocked).toBe(true);
  expect(check('daycoval',{contractEndDate:'2049-12-30'}).blocked).toBe(false);
  expect(check('daycoval',{contractEndDate:'2049-12-31'}).blocked).toBe(true);
  expect(check('facta',{birthDate:'1940-01-01'}).status).toBe('PENDENTE DE DADOS');
  expect(check('finanto',{birthDate:'1957-01-01'}).blocked).toBe(true);
  expect(check('nossa-fintech',{birthDate:'1950-01-01',term:96}).blocked).toBe(false);
  expect(check('nossa-fintech',{birthDate:'1950-01-01',term:84}).status).toBe('PENDENTE DE DADOS');
 });
 it.each([32,92])('species %s applies explicit ages and preserves real documentary gaps',benefitType=>{
  expect(check('digio',{benefitType,birthDate:'1966-10-30'}).blocked).toBe(true);
  expect(check('finanto',{benefitType,birthDate:'1967-01-01'}).blocked).toBe(true);
  expect(check('brb',{benefitType,birthDate:'1966-10-30'}).blocked).toBe(false);
  expect(check('c6',{benefitType}).status).toBe('PENDENTE DE DADOS');
  expect(check('quero-banking',{benefitType}).reason).toContain('5 anos e 5 meses');
 });
 it('preserves operation-specific negative margin, aggregation, reduction and unification',()=>{
  expect(check('happy',{negativeMargin:true}).blocked).toBe(true);
  expect(check('c6',{negativeMargin:true,negativeMarginAmount:50,portInstallment:900}).blocked).toBe(true);
  expect(check('c6',{negativeMargin:true,negativeMarginAmount:50,portInstallment:850}).blocked).toBe(false);
  expect(check('facta',{additionalMargin:10,operation:'PORT',portRate:1.7}).blocked).toBe(true);
  expect(check('daycoval',{contractCount:4}).blocked).toBe(true);expect(check('daycoval',{contractCount:3}).blocked).toBe(false);
  expect(check('banrisul',{contractCount:6}).blocked).toBe(true);
  expect(check('nossa-fintech',{installment:800}).blocked).toBe(true);expect(check('nossa-fintech',{installment:800,negativeMarginAmount:100}).blocked).toBe(true);expect(check('nossa-fintech',{installment:800,negativeMargin:true,negativeMarginAmount:100}).blocked).toBe(false);
 });
 it('does not interpret slash-separated rates as continuous ranges or invent cash formulas',()=>{
  expect(check('c6',{refinRate:1.72}).status).toBe('PENDENTE DE DADOS');expect(check('c6',{refinRate:1.72}).reason).toContain('barras');
  expect(check('finanto',{operation:'PORT',portRate:1.59}).blocked).toBe(true);
  for(const bank of ['havecred','finanto','quero-banking'])expect(check(bank,{amount:1}).reason).toContain('sem regra completa');
 });
 it('applies documented state/payment-order restrictions without borrowing origin bank as payment bank',()=>{
  expect(check('parana',{birthDate:'1965-01-01',state:'AP'}).blocked).toBe(true);
  expect(check('icred',{birthDate:'1965-01-01',state:'PB'}).blocked).toBe(true);
  expect(check('parana',{paymentOrder:true,paymentOrderBankCode:'341',paymentOrderAmount:2199}).blocked).toBe(true);
  expect(check('parana',{paymentOrder:true,paymentOrderBankCode:'033',paymentOrderAmount:100}).blocked).toBe(false);
  expect(check('parana',{paymentOrder:true}).status).toBe('PENDENTE DE DADOS');
 });
 it('leaves Novo and non-INSS products outside the replacement, with no mutation between tenants',()=>{
  expect(evaluatePortabilityPolicy('finanto','001',30,{...base,product:'SIAPE'})).toBeNull();
  expect(simulationPortabilityCheck('facta',{...base,product:'CLT'}).status).toBe('NÃO APLICÁVEL');
  expect(evaluatePortabilityPolicy('finanto','001',30,{...base,operation:'NEW'})).toBeNull();
  expect(searchBankPlaybooks('SIAPE portabilidade FACTA idade').some(row=>row.sourceFile==='Markdown colado(5).md')).toBe(false);
  const before=JSON.stringify(replacement);const a=portabilityRuleSources('facta','001');a.criteria.minBalance=999999;
  expect(check('facta',{debt:900,tenantId:'tenant-b'}).reasons.some(line=>line.includes('saldo mínimo'))).toBe(false);expect(JSON.stringify(replacement)).toBe(before);
  for(const id of ['safra','pan','quali','quero-credito'])expect(portabilitySourceCatalog.some(bank=>bank.id===id)).toBe(true);
 });
 it('uses real workbook math with new Nossa commercial minima and keeps documentary review separate',()=>{
  const cells:Record<string,any>={};for(let row=2;row<=48;row++)cells[`B${row}`]='205012 SYNTHETIC 108x';for(let row=5;row<=51;row++){cells[`E${row}`]='205012';cells[`H${row}`]=0.0165;}
  const book:any={sheets:{TABELAS:{cells}},fileName:'synthetic.xlsx',hash:'synthetic',uploadedAt:'2026-10-30'};
  const input={...base,installment:90,originalInstallment:90,debt:3000,term:108,tableId:'205012:108',negativeMarginAmount:0,refinanceRate:1.65,contracts:[{originBank:'001',paidInstallments:40,balance:3000,installment:90,remaining:36}]};
  const calculated=simulateNossaWorkbook(book,input),offer=calculated.offers[0];
  expect(offer.amount).toBeGreaterThan(100);expect(offer.eligible).toBe(true);expect(offer.minimumCashout).toBe(100);
  expect(offer.checks).toHaveLength(2);expect(JSON.stringify(offer.checks)).not.toMatch(/0,80|13.000|Expansão/);
  const validated=calculatePortRefin('NOSSA_FINTECH',book,input).offers[0];
  expect(validated.amount).toBe(offer.amount);expect(validated.contractAmount).toBe(offer.contractAmount);expect(validated.eligible).toBe(false);expect(validated.policyStatus).toBe('PENDENTE DE DADOS');
 });
 it('secondary helpers distinguish updated portability from preserved Novo rules',()=>{
  const today=new Date(2026,9,30,12);
  expect(finantoAgeError('1957-01-01',96,today,'PORT_REFIN')).not.toBeNull();expect(finantoAgeError('1957-01-01',96,today,'NEW')).toBeNull();
  expect(nossaFintechAgeError('1950-01-01',96,today,'PORT_REFIN')).toBeNull();expect(nossaFintechAgeError('1950-01-01',96,today,'NEW')).not.toBeNull();
  expect(finantoInstallmentError('PRIME',60,'PORT_REFIN')).toBeNull();expect(finantoCashOutError('PRIME',{netValue:1},'PORT_REFIN')).toBeNull();
  expect(finantoRefinancingChoices({name:'PRIME',items:[{rate:1.85,minTerm:1,maxTerm:108}]},108,undefined,'PORT_REFIN').map(row=>row.rate)).toEqual([1.85]);
  expect(finantoRefinancingChoices({name:'PRIME',items:[{rate:1.85,minTerm:1,maxTerm:108}]},108,1.83,'PORT_REFIN')).toEqual([]);
  expect(finantoTableLabel({name:'PRIME'},'PORT_REFIN')).toBe('PRIME');
 });
});
