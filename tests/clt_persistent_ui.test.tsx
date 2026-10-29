// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {CltJourneyWorkspace} from '../src/components/simulation/CltJourneyWorkspace';
import {V8CltActions} from '../src/components/simulation/V8CltActions';
vi.mock('../src/components/simulation/BmgCustomerAuthorization',()=>({BmgCustomerAuthorization:()=>null}));
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const id='00000000-0000-4000-8000-000000000095';
const reference={consultId:'00000000-0000-4000-8000-000000000096',promoterId:'synthetic-promoter',status:'SUCCESS',consentRecorded:true,simulationReady:true};
const state={executionId:id,running:false,banks:[{id:'v8',name:'V8 DIGITAL'},{id:'finanto',name:'FINANTO'}],results:{v8:{status:'RETURNED',rows:[{provider:'V8 DIGITAL',institution:'V8',state:'DATA',data:{v8:reference,margin:{can_continue:true,available_balance:300}}}]},finanto:{status:'RETURNED',rows:[{provider:'FINANTO',institution:'QI',state:'OFFER',table:'Oferta histórica FINANTO',amount:5000}]}},customer:{cpf:'52998224725',name:'Pessoa sintética',phone:'11999999999',v8BirthDate:'1990-02-28',v8Gender:'male',v8Email:'synthetic@example.invalid',mode:'Payment',term:0,value:0}};
it('binds one consultation without a manual choice and excludes historical FINANTO from the operational view',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(async(url:string,init?:RequestInit)=>url.includes('capabilities')?Response.json({connections:[{promoterId:reference.promoterId,simulationReady:true}]}):init?.method==='POST'?new Response(JSON.stringify(state)+'\n'):Response.json(state));vi.stubGlobal('fetch',fetcher);
 render(<CltJourneyWorkspace isOpen scope="tenant-a:user-a" onClose={()=>{}}/>);
 for(const [label,value]of [['CPF','52998224725'],['Nome completo','Pessoa sintética'],['Telefone com DDD','11999999999'],['Data de nascimento','28021990'],['E-mail do trabalhador','synthetic@example.invalid']])fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.change(screen.getByLabelText('Sexo informado pelo trabalhador'),{target:{value:'male'}});
 await act(async()=>{fireEvent.click(screen.getByText('CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES'));});
 const details=screen.getAllByRole('button',{name:'Selecionar V8 DIGITAL'});expect(details).toHaveLength(1);await act(async()=>fireEvent.click(details[0]));
 expect(screen.getByText('Consulta vinculada automaticamente ao acompanhamento.')).toBeTruthy();expect(screen.queryByRole('button',{name:/Selecionar consulta para acompanhamento/})).toBeNull();expect(screen.queryByText('FINANTO')).toBeNull();expect(screen.queryByText('Oferta histórica FINANTO')).toBeNull();
 fireEvent.change(screen.getByLabelText('Parcela desejada (R$)'),{target:{value:'100,00'}});fireEvent.click(screen.getByRole('button',{name:'SIMULAR CONDIÇÕES'}));await act(async()=>{});
 const posts=fetcher.mock.calls.filter(([,o])=>o?.method==='POST');expect(JSON.parse(String(posts.at(-1)?.[1]?.body))).toMatchObject({v8ConsultId:reference.consultId,v8PromoterId:reference.promoterId,provider:'v8',action:'SIMULATE'});
});
it.each([false,true])('recovers an opaque execution on a real page reload through GET only, scoped to the same actor and tenant, initially open=%s',async(initiallyOpen)=>{
 vi.useFakeTimers();Object.defineProperty(performance,'getEntriesByType',{configurable:true,value:vi.fn(()=>[{type:'reload'}])});sessionStorage.setItem('sentinel:clt-execution:tenant-a:user-a',id);
 const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>Response.json({...state,banks:[{id:'v8',name:'V8 DIGITAL'}]}));vi.stubGlobal('fetch',fetcher);
 const ui=render(<CltJourneyWorkspace isOpen={initiallyOpen} scope="tenant-a:user-a" onClose={()=>{}}/>);if(!initiallyOpen){expect(fetcher).not.toHaveBeenCalled();ui.rerender(<CltJourneyWorkspace isOpen scope="tenant-a:user-a" onClose={()=>{}}/>);}await act(async()=>{});
 expect(fetcher.mock.calls.some(c=>String(c[0]).endsWith('/'+id))).toBe(true);expect(fetcher.mock.calls.some(c=>(c[1] as any)?.method==='POST')).toBe(false);expect(sessionStorage.getItem('sentinel:clt-execution:tenant-a:user-a')).toBe(id);
 ui.rerender(<CltJourneyWorkspace isOpen scope="tenant-b:user-a" onClose={()=>{}}/>);expect((screen.getByLabelText('CPF') as HTMLInputElement).value).toBe('');const reads=fetcher.mock.calls.length;await act(async()=>vi.advanceTimersByTimeAsync(20000));expect(fetcher).toHaveBeenCalledTimes(reads);
 Object.defineProperty(performance,'getEntriesByType',{configurable:true,value:undefined});
});
it('does not offer duplicate creation or device authorization when the API has already confirmed consent',()=>{
 render(<V8CltActions capabilities={{connections:[{promoterId:reference.promoterId}]}} form={{}} setForm={vi.fn()} start={vi.fn()} rows={[{data:{v8:reference}},{data:{v8:reference}}]} busy={false}/>);
 expect(screen.queryByRole('button',{name:'Criar consulta V8'})).toBeNull();expect(screen.queryByLabelText('Autorização V8 pela API')).toBeNull();
});
it('never merges offers from a different execution when recovering another customer',async()=>{
 const second='00000000-0000-4000-8000-000000000097';
 const first={...state,banks:[{id:'facta',name:'FACTA'}],results:{facta:{status:'RETURNED',rows:[{provider:'FACTA',institution:'FACTA',state:'OFFER',table:'Oferta de outra execução',amount:1000}]}}};
 const recovered={...state,executionId:second,banks:[{id:'nossa',name:'Nossa Fintech'}],results:{nossa:{status:'RETURNED',rows:[{provider:'Nossa Fintech',institution:'QI',state:'PENDING',outcome:'INELIGIBLE',message:'Caso sintético separado'}]}}};
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>url.endsWith('/history')?Response.json({executions:[{executionId:second,banks:['Nossa Fintech']}]}):init?.method==='POST'?new Response(JSON.stringify(first)+'\n'):Response.json(recovered)));
 render(<CltJourneyWorkspace isOpen scope="tenant-a:user-a" onClose={()=>{}}/>);
 for(const [label,value]of [['CPF','52998224725'],['Nome completo','Pessoa sintética'],['Telefone com DDD','11999999999'],['Data de nascimento','28021990'],['E-mail do trabalhador','synthetic@example.invalid']])fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.change(screen.getByLabelText('Sexo informado pelo trabalhador'),{target:{value:'male'}});await act(async()=>fireEvent.click(screen.getByText('CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES')));
 expect(screen.getByText('Oferta de outra execução')).toBeTruthy();fireEvent.click(screen.getByText('Editar dados'));fireEvent.click(screen.getByText('Recuperar acompanhamento',{selector:'summary'}));
 await vi.waitFor(()=>expect((screen.getByLabelText('Execução para recuperar') as HTMLSelectElement).options.length).toBe(2));fireEvent.change(screen.getByLabelText('Execução para recuperar'),{target:{value:second}});await act(async()=>fireEvent.click(screen.getByText('Recuperar acompanhamento selecionado')));
 expect(screen.queryByText('Oferta de outra execução')).toBeNull();expect(screen.queryByText('FACTA')).toBeNull();expect(screen.getAllByText('Nossa Fintech').length).toBeGreaterThan(0);
});
