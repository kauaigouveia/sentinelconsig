// @vitest-environment jsdom
import React from 'react';import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';import {afterEach,expect,it,vi} from 'vitest';
import {CltJourneyWorkspace} from '../src/components/simulation/CltJourneyWorkspace';
import {snapshotOfBank,canonicalNossaInstitution} from '../src/lib/cltInstitution';
import {presentedMargins,presentedOffers} from '../src/lib/cltPresentation';
vi.mock('../src/components/simulation/BmgCustomerAuthorization',()=>({BmgCustomerAuthorization:()=>null}));
vi.mock('../src/components/simulation/VctexCltActions',()=>({VctexCltActions:({visible=true}:any)=>visible?<div>Controles VCTEX</div>:null}));
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
const id='00000000-0000-4000-8000-000000000301';
const customer={cpf:'52998224725',name:'Pessoa sintética',phone:'11999999999',v8BirthDate:'1990-02-28',v8Email:'synthetic@example.invalid',v8Gender:'male',value:0,term:0,mode:'Payment'};
function fixture():any{return {executionId:id,rootExecutionId:id,running:false,automaticEnabled:false,customer,banks:[{id:'nossa',name:'Nossa Fintech'},{id:'facta',name:'FACTA'},{id:'v8',name:'V8 DIGITAL'},{id:'vctex',name:'VCTEX DIGITAL'}],results:{nossa:{executionId:id,status:'RETURNED',rows:[{provider:'Nossa Fintech',institution:'QITECH',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',origin:{providerId:'nossa',subInstitutionId:'qi',connectionId:'nossa-p',executionId:id},data:{authorization:{status:'PENDING'}}},{provider:'Nossa Fintech',institution:'UY3',state:'DATA',origin:{providerId:'nossa',subInstitutionId:'uy3'},data:{margin:{available_balance:529.93,can_continue:true},authorization:{status:'AUTHORIZED'}}},{provider:'Nossa Fintech',institution:'UY3',state:'OFFER',table:'Oferta UY3',simulationId:'uy3',amount:2000,installment:300,term:12}]},facta:{executionId:id,status:'RETURNED',rows:[{provider:'FACTA',institution:'FACTA',state:'OFFER',table:'Oferta FACTA',simulationId:'facta',amount:2500,installment:300,term:12}]},v8:{executionId:id,status:'RETURNED',rows:[{provider:'V8 DIGITAL',institution:'V8',state:'DATA',data:{v8:{consultId:'v8-consult',promoterId:'v8-p',status:'SUCCESS',consentRecorded:true},margin:{available_balance:500,can_continue:true}}},{provider:'V8 DIGITAL',institution:'V8',state:'OFFER',table:'Oferta V8',simulationId:'v8',amount:3000,installment:300,term:12}]},vctex:{executionId:id,status:'RETURNED',rows:[{provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'OFFER',table:'Oferta VCTEX',simulationId:'vctex',amount:4000,installment:300,term:12}]}}};}
async function open(data=fixture()){
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.includes('/capabilities'))return Response.json({connections:[]});
  if(url.includes('/observe'))return Response.json(data);
  if(init?.method==='POST'){
   const b=JSON.parse(String(init.body));if(b.action==='SIMULATE'){expect(b.provider).toBe('nossa');expect(b.value).toBe(200);return new Response(JSON.stringify({...data,executionId:b.executionId,results:{...data.results,nossa:{...data.results.nossa,request:{value:200,term:0,mode:'Payment',requestedAt:'2026-10-29T12:00:00Z'},rows:[data.results.nossa.rows[0],data.results.nossa.rows[1],{...data.results.nossa.rows[2],table:'Nova UY3 200',installment:200}]}}})+'\n');}
   return new Response(JSON.stringify(data)+'\n');
  }return Response.json(data);
 });vi.stubGlobal('fetch',fetcher);render(<CltJourneyWorkspace isOpen scope="t:user-a" onClose={()=>{}}/>);
 for(const [label,value]of [['CPF','52998224725'],['Nome completo','Pessoa sintética'],['Telefone com DDD','11999999999'],['Data de nascimento','28021990'],['E-mail do trabalhador','synthetic@example.invalid']])fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.change(screen.getByLabelText('Sexo informado pelo trabalhador'),{target:{value:'male'}});await act(async()=>fireEvent.click(screen.getByText('CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES')));return fetcher;
}
it('uses exact canonical IDs and drops conflicting origin metadata without guessing by a bank name',()=>{
 expect(canonicalNossaInstitution('QITECH')).toBe('qi');expect(canonicalNossaInstitution('empresa com qi tech')).toBeUndefined();const data=fixture();data.results.nossa.rows.push({...data.results.vctex.rows[0],provider:'Nossa Fintech',origin:{providerId:'vctex'}});
 const own=snapshotOfBank(data,'nossa');expect(presentedOffers(own).map(o=>o.row.table)).toEqual(['Oferta UY3']);expect(presentedMargins(own).some(r=>r.subInstitutionId==='qi')).toBe(true);expect(snapshotOfBank(data,'not-a-bank')).toBeNull();
});
it.each([390,1440])('shows only the selected institution at width %s and keeps QI pending visible next to UY3',async width=>{
 vi.stubGlobal('innerWidth',width);await open();const margin=screen.getByRole('region',{name:'Consulta de margem'});expect(within(margin).getByText('QI Tech')).toBeTruthy();expect(within(margin).getByText('UY3')).toBeTruthy();
 const offers=screen.getByRole('table',{name:'Tabela consolidada de simulações'});expect(within(offers).getByText('Oferta UY3')).toBeTruthy();for(const title of ['Oferta VCTEX','Oferta V8','Oferta FACTA'])expect(within(offers).queryByText(title)).toBeNull();
 expect(screen.queryByText('Controles VCTEX')).toBeNull();expect(screen.queryByText('Ações específicas V8')).toBeNull();expect(screen.queryByLabelText('Modelo do dispositivo')).toBeNull();expect(screen.getAllByRole('button',{name:'Atualizar status'})).toHaveLength(1);expect(screen.getAllByRole('button',{name:'SIMULAR CONDIÇÕES'})).toHaveLength(1);
});
it('explains a missing QI response without creating a fictitious consultation',async()=>{
 const data=fixture();data.results.nossa.rows=data.results.nossa.rows.filter((r:any)=>r.institution!=='QITECH');const fetcher=await open(data);const margin=screen.getByRole('region',{name:'Consulta de margem'});expect(within(margin).getByText('QI Tech')).toBeTruthy();expect(within(margin).getByText('Não disponibilizada nesta resposta')).toBeTruthy();expect(within(margin).getByText(/Nenhuma consulta foi criada/)).toBeTruthy();expect(fetcher.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});
it('switches banks without restarting consultations or losing offers, and isolates the general comparison',async()=>{
 const fetcher=await open();fireEvent.click(screen.getByRole('button',{name:'Selecionar FACTA'}));expect(screen.getByRole('table',{name:'Tabela consolidada de simulações'}).textContent).toContain('Oferta FACTA');expect(screen.queryByText('Oferta UY3')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Selecionar Nossa Fintech'}));expect(screen.getByText('Oferta UY3')).toBeTruthy();expect(fetcher.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Comparar todos os bancos'}));const table=screen.getByRole('table',{name:'Tabela consolidada de simulações'});for(const title of ['Oferta UY3','Oferta FACTA','Oferta V8','Oferta VCTEX'])expect(within(table).getByText(title)).toBeTruthy();expect(screen.queryByRole('region',{name:'Consulta de margem'})).toBeNull();expect(screen.queryByRole('button',{name:'Atualizar status'})).toBeNull();
 for(const title of ['Oferta UY3','Oferta FACTA','Oferta V8'])fireEvent.click(screen.getByLabelText('Comparar '+title));expect((screen.getByLabelText('Comparar Oferta VCTEX') as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Selecionar Nossa Fintech'}));expect(screen.queryByText('Oferta FACTA')).toBeNull();expect(screen.getByText('Oferta UY3')).toBeTruthy();
});
it('reprices only Nossa with 200, updates status using GET only, and preserves other banks in the background',async()=>{
 const fetcher=await open();fireEvent.change(screen.getByLabelText('Parcela desejada (R$)'),{target:{value:'200,00'}});await act(async()=>fireEvent.click(screen.getByRole('button',{name:'SIMULAR CONDIÇÕES'})));expect(screen.getByText('Nova UY3 200')).toBeTruthy();expect(screen.queryByText('Oferta UY3')).toBeNull();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Atualizar status'})));expect(fetcher.mock.calls.some(([u,o])=>u.includes('provider=nossa')&&o?.method===undefined)).toBe(true);expect(fetcher.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Selecionar FACTA'}));expect(screen.getByText('Oferta FACTA')).toBeTruthy();expect((screen.getByLabelText('Parcela desejada (R$)') as HTMLInputElement).value).toBe('');fireEvent.click(screen.getByRole('button',{name:'Selecionar Nossa Fintech'}));expect((screen.getByLabelText('Parcela desejada (R$)') as HTMLInputElement).value).toContain('200');
});
