// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {CltJourneyWorkspace} from '../src/components/simulation/CltJourneyWorkspace';
vi.mock('../src/components/simulation/BmgCustomerAuthorization',()=>({BmgCustomerAuthorization:()=>null}));
afterEach(()=>{cleanup();vi.useRealTimers();sessionStorage.clear();vi.unstubAllGlobals();});
const root='00000000-0000-4000-8000-000000000061';
const pending={executionId:root,rootExecutionId:root,automaticEnabled:true,running:false,banks:[{id:'facta',name:'FACTA'},{id:'nossa',name:'Nossa Fintech'}],results:{facta:{status:'RETURNED',rows:[{provider:'FACTA',institution:'FACTA',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED'}]},nossa:{status:'RETURNED',rows:[{provider:'Nossa Fintech',institution:'QI',state:'OFFER',table:'Oferta preservada',amount:1000}]}}};
function fill(){for(const [label,value]of [['CPF','52998224725'],['Nome completo','Pessoa sintética'],['Telefone com DDD','11999999999'],['Data de nascimento','28021990'],['E-mail do trabalhador','synthetic@example.invalid']])fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.change(screen.getByLabelText('Sexo informado pelo trabalhador'),{target:{value:'male'}});fireEvent.click(screen.getByRole('button',{name:'CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES'}));}
it.each([false,true])('polls the real observation route and issues at most one calculation per readiness change, uncertain=%s',async uncertain=>{
  vi.useFakeTimers();let posts=0;
  const ready={...pending,results:{...pending.results,facta:{status:'RETURNED',readyToSimulate:true,readyKey:'synthetic-ready',rows:[{provider:'FACTA',institution:'FACTA',state:'DATA',data:{margin:{can_continue:true,available_balance:300}}}]}}};
  const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
    if(url.includes('/observe')){expect(init?.method).toBeUndefined();return Response.json(ready);}
    if(init?.method==='POST'){posts++;const b=JSON.parse(String(init.body));if(posts===1){expect(b.action).toBe('REFRESH');expect(b.value).toBeUndefined();expect(b.term).toBeUndefined();return new Response(JSON.stringify(pending)+'\n');}
      expect(b.action).toBe('SIMULATE');expect(b.provider).toBe('facta');if(uncertain)throw Error('synthetic timeout');
      return new Response(JSON.stringify({...pending,executionId:b.executionId,results:{...pending.results,facta:{status:'RETURNED',rows:[{provider:'FACTA',institution:'FACTA',state:'OFFER',table:'Oferta FACTA',amount:2000}]}}})+'\n');
    }throw Error('Unexpected request');
  });vi.stubGlobal('fetch',fetcher);const ui=render(<CltJourneyWorkspace isOpen scope="tenant-a:user-a" onClose={()=>{}}/>);
  await act(async()=>{fill();});await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  expect(posts).toBe(2);expect(fetcher.mock.calls.some(([u])=>u.includes('/observe'))).toBe(true);
  await act(async()=>{await vi.advanceTimersByTimeAsync(90000);});expect(posts).toBe(2);
  expect(screen.getByText('Oferta preservada')).toBeTruthy();
  ui.rerender(<CltJourneyWorkspace isOpen={false} scope="tenant-a:user-a" onClose={()=>{}}/>);ui.rerender(<CltJourneyWorkspace isOpen scope="tenant-b:user-a" onClose={()=>{}}/>);
  expect((screen.getByLabelText('CPF') as HTMLInputElement).value).toBe('');const count=fetcher.mock.calls.length;await act(async()=>{await vi.advanceTimersByTimeAsync(120000);});expect(fetcher).toHaveBeenCalledTimes(count);
});
