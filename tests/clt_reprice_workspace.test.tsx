// @vitest-environment jsdom
import React from 'react';import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';import {afterEach,expect,it,vi} from 'vitest';
import {CltJourneyWorkspace} from '../src/components/simulation/CltJourneyWorkspace';
vi.mock('../src/components/simulation/BmgCustomerAuthorization',()=>({BmgCustomerAuthorization:()=>null}));
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});
const root='00000000-0000-4000-8000-000000000211';
it('the actual workspace requests new bank simulations for 200, rather than filtering the previous 529.93 offers',async()=>{
 let posts=0;const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method!=='POST')throw Error('Unexpected read');const b=JSON.parse(String(init.body));posts++;
  const second=posts>1;if(second)expect(b).toMatchObject({action:'SIMULATE',parentExecutionId:root,value:200});else{expect(b.action).toBe('REFRESH');expect(b.value).toBeUndefined();}
  const margin={provider:'Nossa Fintech',institution:'QI',state:'DATA',data:{authorization:{status:'AUTHORIZED'},margin:{available_balance:529.93,can_continue:true}}};
  const final={executionId:second?b.executionId:root,rootExecutionId:second?b.executionId:root,running:false,automaticEnabled:false,customer:{...b,value:second?200:0,term:0},calculation:second?{value:200,mode:'Payment',term:0,banks:['nossa','facta'],requestedAt:'2026-10-29T12:00:00Z',sourceExecutionId:root}:undefined,banks:[{id:'nossa',name:'Nossa Fintech'},{id:'facta',name:'FACTA'}],results:{nossa:{status:'RETURNED',rows:[margin,{provider:'Nossa Fintech',institution:'QI',state:'OFFER',simulationId:second?'new':'old',table:second?'Condição 200':'Condição antiga',amount:2000,installment:second?200:529.93,term:12}]},facta:{status:second?'ERROR':'RETURNED',rows:second?[{provider:'FACTA',institution:'FACTA',state:'ERROR',message:'Falha sintética isolada'}]:[]}}};
  if(!second)return new Response(JSON.stringify(final)+'\n');
  const stream=new ReadableStream({async start(c){const encode=(v:any)=>new TextEncoder().encode(JSON.stringify(v)+'\n');c.enqueue(encode({...final,running:true,results:{nossa:{status:'QUERYING',rows:[margin]},facta:{status:'QUERYING',rows:[]}}}));await new Promise(r=>setTimeout(r,30));c.enqueue(encode(final));c.close();}});return new Response(stream);
 });vi.stubGlobal('fetch',fetcher);render(<CltJourneyWorkspace isOpen scope="t:user-a" onClose={()=>{}}/>);
 for(const [label,value]of [['CPF','52998224725'],['Nome completo','Pessoa sintética'],['Telefone com DDD','11999999999'],['Data de nascimento','28021990'],['E-mail do trabalhador','synthetic@example.invalid']])fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.change(screen.getByLabelText('Sexo informado pelo trabalhador'),{target:{value:'male'}});await act(async()=>fireEvent.click(screen.getByText('CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES')));
 const button=screen.getByRole('button',{name:'SIMULAR CONDIÇÕES'}) as HTMLButtonElement;expect(button.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Parcela desejada (R$)'),{target:{value:'600,00'}});expect(button.disabled).toBe(true);expect(screen.getByText(/supera todas as margens/)).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Parcela desejada (R$)'),{target:{value:'200,00'}});expect(button.disabled).toBe(false);await act(async()=>fireEvent.click(button));
 await screen.findByText('Condição 200');expect(posts).toBe(2);const table=screen.getByRole('table',{name:'Tabela consolidada de simulações'});expect(within(table).queryByText('Condição antiga')).toBeNull();expect(within(table).getByText('Condição 200')).toBeTruthy();expect(within(table).getByText(/200,00/)).toBeTruthy();expect(screen.getByText(/Parcela solicitada:/).textContent).toContain('200,00');expect(screen.getByText('Falha sintética isolada')).toBeTruthy();expect(screen.getByRole('region',{name:'Consulta de margem'}).textContent).toContain('529,93');
});
