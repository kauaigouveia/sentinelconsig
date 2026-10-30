// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {eligibilityPresentation} from '../src/lib/eligibilityPresentation';
import {EligibilityResult} from '../src/components/simulation/EligibilityResult';
import {FactaSimulationResults} from '../src/components/simulation/FactaSimulationResults';
import {BankPlaybooksPanel} from '../src/components/simulation/BankPlaybooksPanel';
import {OrderedSimulationBanks} from '../src/components/simulation/OrderedSimulationBanks';
import {evaluatePortabilityPolicy} from '../src/lib/portabilityPolicy';
const data={bank:'FACTA',product:'INSS',operation:'PORT_REFIN',check:{blocked:false,review:true,status:'PENDENTE DE DADOS',notices:['FACTA: FACTA: Divergência documental em maxAge/maxStartMonths: fonte A.','Divergência documental em ageByTerm: fonte B.','Confirmar UF.','Confirmar UF.','Aguardar cálculo de troco.'],sources:[{file:'Fonte sintética',receivedAt:'2026-10-30',effectiveAt:null}]}};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('deduplicates presentation while preserving distinct documentary evidence and original data',()=>{
 const before=JSON.stringify(data),result=eligibilityPresentation(data);
 expect(result.status).toBe('PENDENTE DE DADOS');expect(result.conflicts).toHaveLength(1);expect(result.diagnostics.conflicts).toHaveLength(2);
 expect(result.pending.filter(line=>line.includes('UF:'))).toHaveLength(1);expect(result.original).toBe(data);expect(JSON.stringify(data)).toBe(before);
 expect(JSON.stringify(result.pending)).not.toMatch(/maxAge|ageByTerm|FACTA: FACTA:/);
});
it('formats legacy monetary text with pt-BR without changing the value',()=>{
 for(const value of ['2000.00','2.000,00'])expect(eligibilityPresentation({bank:'FACTA',message:`FACTA: FACTA: Saldo mínimo: R$ ${value}.`}).pending[0]).toContain('2.000,00');
});
it('missing evidence never implies approval; a documentary conflict never implies rejection',()=>{
 expect(eligibilityPresentation({bank:'Banco sintético'}).status).toBe('PENDENTE DE DADOS');
 expect(eligibilityPresentation(data).status).not.toBe('NÃO ELEGÍVEL');
 expect(eligibilityPresentation({...data,check:{...data.check,blocked:true}}).status).toBe('NÃO ELEGÍVEL');
});
it('keeps a returned offer distinct from unvalidated eligibility',()=>{
 expect(eligibilityPresentation({bank:'Banco sintético',calculated:true}).status).toBe('OFERTA CALCULADA');
 expect(eligibilityPresentation({...data,calculated:true}).status).toBe('PENDENTE DE DADOS');
});
it('does not render technical evidence for ordinary users',()=>{
 render(<EligibilityResult input={data}/>);expect(screen.queryByText('Detalhes técnicos e fontes')).toBeNull();expect(screen.queryByText(/maxAge/)).toBeNull();
 expect(screen.getByText('UF: confirmar informação.')).toBeTruthy();expect(screen.getByText('Troco mínimo: aguardando cálculo.')).toBeTruthy();
});
it('authorized details start collapsed and preserve all sources when explicitly opened',()=>{
 render(<EligibilityResult input={data} canViewDiagnostics/>);const summary=screen.getByText('Detalhes técnicos e fontes');
 expect(summary.closest('details')?.open).toBe(false);expect(screen.queryByText(/fonte A/)).toBeNull();
 fireEvent.click(summary);fireEvent(summary.closest('details')!,new Event('toggle'));
 expect(screen.getByText(/fonte A/)).toBeTruthy();expect(screen.getByText(/fonte B/)).toBeTruthy();expect(screen.getByText(/Fonte sintética/)).toBeTruthy();
});
it('portal projection omits routing criteria and technical fields even with an incorrectly granted UI flag',()=>{
 render(<EligibilityResult portal canViewDiagnostics input={{...data,message:'INTERNAL_ROUTING tenant-b',commercial:[{label:'INTERNAL_ROUTING',value:'private'}],check:{reason:'INTERNAL_ROUTING tenant-b'}}}/>);
 expect(screen.queryByText(/INTERNAL_ROUTING|tenant-b|Detalhes técnicos/)).toBeNull();
});
it('FACTA renders calculated offers before operational pendencies without duplicated bank prefixes',()=>{
 const {container}=render(<FactaSimulationResults offers={[{code:'s1',name:'Tabela sintética',amount:1000,term:36,rate:1.5,installment:50}]} message='FACTA: FACTA: Saldo mínimo: R$ 2000.00.'/>);
 expect(container.textContent).not.toContain('FACTA: FACTA:');expect(container.textContent!.indexOf('Tabela sintética')).toBeLessThan(container.textContent!.indexOf('Pendências operacionais'));
});
it('FINANTO tables keep their own conditions and missing values remain absent',()=>{
 render(<>{[1,2,3].map(index=><EligibilityResult key={index} input={{bank:'FINANTO',table:'Tabela '+index,product:'INSS',commercial:[{label:'Prazo',value:String(index*12)}]}}/>)}</>);
 expect(screen.getAllByRole('article')).toHaveLength(3);expect(screen.queryByText('Taxa')).toBeNull();expect(screen.getAllByText('Prazo')).toHaveLength(3);
});
it('is responsive and includes explicit light/dark styles without fixed widths',()=>{
 const {container}=render(<EligibilityResult input={{...data,commercial:[{label:'Saldo mínimo',value:'R$ 2.000,00'}]}}/>);
 expect(container.querySelector('dl')?.className).toContain('grid-cols-1');expect(container.querySelector('dl')?.className).toContain('sm:grid-cols-2');
 expect(container.querySelector('article')?.className).toContain('dark:bg-slate-900');
});
it('presentation does not mutate any bank eligibility decision',()=>{
 for(const bank of ['facta','finanto','daycoval','parana','banrisul']){
  const input={operation:'PORT_REFIN',birthDate:'1980-01-01',term:36,benefitType:41,debt:10000,remainingInstallments:36,originalInstallment:900};
  const check=evaluatePortabilityPolicy(bank,'001',30,input)!;const before=JSON.stringify(check);
  eligibilityPresentation({bank,check});expect(JSON.stringify(check)).toBe(before);expect(evaluatePortabilityPolicy(bank,'001',30,input)).toEqual(check);
 }
});
it('offers outrank pending banks; custom bank ordering still breaks ties',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}')));
 render(<OrderedSimulationBanks operation='PORT_REFIN' groups={[{bank:'FACTA',visible:true,resultRank:2,content:'Pendente'},{bank:'FINANTO',visible:true,resultRank:0,content:'Oferta'}]}/>);
 await waitFor(()=>expect(screen.getAllByRole('heading')[0].textContent).toContain('FINANTO'));
});
it('tenant changes invalidate diagnostic permissions without a global authorization cache',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({canDiagnose:true}))).mockResolvedValueOnce(new Response(JSON.stringify({canDiagnose:false})));vi.stubGlobal('fetch',fetch);
 render(<BankPlaybooksPanel input={{operation:'PORT_REFIN',birthDate:'1980-01-01',species:'41',originBank:'001',paidInstallments:30}}/>);
 await waitFor(()=>expect(screen.getAllByText('Detalhes técnicos e fontes').length).toBeGreaterThan(0));
 fireEvent(window,new Event('tenantUpdated'));
 await waitFor(()=>expect(screen.queryByText('Detalhes técnicos e fontes')).toBeNull());expect(fetch).toHaveBeenCalledTimes(2);
});
