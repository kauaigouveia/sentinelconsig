// @vitest-environment jsdom
import React,{useState} from 'react';import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';import {afterEach,expect,it,vi} from 'vitest';
import {CltMarginResults,CltOfferResults} from '../src/components/simulation/CltResults';
import {presentedMargins,presentedOffers} from '../src/lib/cltPresentation';
import {readV8Device} from '../src/lib/v8Device';
import {V8ApiAuthorization} from '../src/components/simulation/V8ApiAuthorization';
const snapshot:any={executionId:'synthetic',banks:[{id:'v8',name:'V8'},{id:'nossa',name:'Nossa'},{id:'facta',name:'FACTA'},{id:'bmg',name:'BMG'},{id:'finanto',name:'FINANTO'}],results:{v8:{status:'RETURNED',rows:[{provider:'V8 DIGITAL',institution:'V8',state:'DATA',data:{v8:{consultId:'synthetic',consentRecorded:true},margin:{available_balance:529.93,can_continue:true}}},{provider:'V8 DIGITAL',institution:'V8',table:'Tabela sintética',state:'OFFER',simulationId:'s',amount:2350.44,installment:200,term:12,data:{v8:{monthlyInterestRate:0.0498,operationAmount:2400,issueAmount:2415.38,iofAmount:64.94,isInsured:false,insuranceAmount:0,firstInstallmentDate:'2027-01-28'}}}]},nossa:{status:'RETURNED',rows:[{provider:'Nossa Fintech',institution:'QI',state:'PENDING',data:{authorization:{status:'PENDING'}}}]},facta:{status:'RETURNED',rows:[{provider:'FACTA',institution:'FACTA',state:'DATA',data:{margin:{available_balance:400,used_balance:20,residual_balance:380}}}]},bmg:{status:'CONTEXTUAL',rows:[]},finanto:{status:'RETURNED',rows:[{provider:'FINANTO',institution:'QI',state:'OFFER',amount:999}]}}};
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('keeps official margin separate from net cash, unknown fields unknown, and never infers authorization from offers',()=>{
 const rows=presentedMargins(snapshot);expect(rows.find(r=>r.bank==='v8')).toMatchObject({available:529.93,authorization:'Confirmada pela API'});expect(rows.find(r=>r.bank==='nossa')?.available).toBeUndefined();expect(rows.find(r=>r.bank==='facta')).toMatchObject({used:20,residual:380});expect(rows.find(r=>r.bank==='bmg')?.authorization).toBeUndefined();expect(rows.some(r=>r.bank==='finanto')).toBe(false);
 const offers=presentedOffers(snapshot);expect(offers).toHaveLength(1);expect(offers[0]).toMatchObject({rate:4.9799999999999995,iof:64.94,issueAmount:2415.38,nominalTotal:2400,insurance:false,insuranceAmount:0});expect(offers[0].row.amount).toBe(2350.44);expect(offers[0].row.cetAnnual).toBeUndefined();
});
it('deduplicates exact conditions while preserving different terms and different originating banks',()=>{
 const s=structuredClone(snapshot);s.results.v8.rows.push(s.results.v8.rows[1],{...s.results.v8.rows[1],term:24});s.results.facta.rows.push({...s.results.v8.rows[1],provider:'FACTA',institution:'FACTA'});expect(presentedOffers(s)).toHaveLength(3);expect(presentedOffers({...s,executionId:'another'})[0].key).not.toBe(presentedOffers(s)[0].key);
});
it.each([390,1440])('renders one scrollable table with all reported fields at width %s, without offer cards',width=>{
 vi.stubGlobal('innerWidth',width);render(<><CltMarginResults snapshot={snapshot}/><CltOfferResults offers={presentedOffers(snapshot)} compared={[]} setCompared={vi.fn()} selected="" setSelected={vi.fn()}/></>);
 const table=screen.getByRole('table',{name:'Tabela consolidada de simulações'});expect(table.querySelectorAll('th')).toHaveLength(16);expect(table.parentElement?.className).toContain('overflow-auto');expect(table.querySelector('thead')?.className).toContain('sticky');expect(within(table).getByText('4,98%')).toBeTruthy();expect(within(table).getByText(/2\.350,44/)).toBeTruthy();expect(screen.queryByRole('heading',{name:'Oferta disponível'})).toBeNull();expect(within(table).getAllByText('Não informado').length).toBeGreaterThan(1);
});
it('orders actual conditions and limits comparison to three without changing bank values',()=>{
 const base=presentedOffers(snapshot)[0],offers=[1,2,3,4].map(n=>({...base,key:String(n),row:{...base.row,table:'Table '+n,amount:n*100,term:n*12}}));function Harness(){const [compared,setCompared]=useState<string[]>([]);return <CltOfferResults offers={offers} compared={compared} setCompared={setCompared} selected="" setSelected={()=>{}}/>;}render(<Harness/>);
 for(const n of [1,2,3])fireEvent.click(screen.getByLabelText('Comparar Table '+n));expect((screen.getByLabelText('Comparar Table 4') as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByText('Valor liberado ↕'));expect(screen.getAllByRole('row')[1].textContent).toContain('100,00');expect(offers[0].row.amount).toBe(100);
});
it.each([
 ['Win32','Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Windows','desktop','PC','Computador Windows'],
 ['Linux armv8l','Mozilla/5.0 (Linux; Android 14; Mobile)','Android','mobile','Dispositivo móvel','Dispositivo móvel Android'],
 ['Linux armv8l','Mozilla/5.0 (Linux; Android 14)','Android','tablet','Tablet','Tablet Android'],
 ['iPhone','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)','iOS','mobile','Dispositivo móvel','Dispositivo móvel iOS'],
])('constructs class descriptions from actual browser evidence: %s',async(platform,userAgent,os,type,model,name)=>{
 expect(await readV8Device({platform,userAgent})).toEqual({operationalSystem:os,deviceType:type,deviceModel:model,deviceName:name});expect((await readV8Device({platform,userAgent})).operationalSystem).not.toBe('Windows 11');
});
it('auto-authorizes a bound consultation once, without technical inputs or an automatic retry after timeout',async()=>{
 vi.spyOn(navigator,'platform','get').mockReturnValue('Win32');const fetcher=vi.fn().mockRejectedValue(Error('synthetic timeout'));vi.stubGlobal('fetch',fetcher);
 const props={automatic:true,executionId:'e',reference:{consultId:'c',promoterId:'p'},onRecorded:vi.fn()};const ui=render(<V8ApiAuthorization {...props}/>);await act(async()=>{});await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());const payload=JSON.parse(fetcher.mock.calls[0][1].body);expect(payload).toMatchObject({consultId:'c',promoterId:'p',operationalSystem:'Windows',deviceType:'desktop',deviceModel:'PC',deviceName:'Computador Windows'});expect(screen.getByLabelText('Modelo do dispositivo').closest('fieldset')?.hidden).toBe(true);ui.rerender(<V8ApiAuthorization {...props}/>);await act(async()=>{});expect(fetcher).toHaveBeenCalledOnce();expect(props.onRecorded).not.toHaveBeenCalled();
});
