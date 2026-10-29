// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {VctexCltActions} from '../src/components/simulation/VctexCltActions';
const pending={caseId:'case-a',preOperationId:'pre-a',status:'awaiting_signature',label:'Termo pendente de assinatura',link:'https://signature.example.invalid/synthetic',terminal:false,employments:[],offers:[]};
const eligible={...pending,status:'finished',label:'Vínculos disponíveis',link:undefined,terminal:true,employments:[{employmentId:'job-a',employer:{name:'Empresa sintética'},eligible:true,availableMarginValue:1000,rates:[{id:'rate-a',name:'Tabela sintética',fee:0.0399,withInsurance:false,allowedInstallments:[12]}]}]};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('requests the link once, refreshes by GET and calculates one dynamic full offer only after finished',async()=>{
  const rows=vi.fn(),fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/connections'))return Response.json([{id:'p-a',name:'Conexão sintética'}]);
    if(url.includes('/start?'))return Response.json(pending);
    if(url.includes('/observe?')){expect(init?.method).toBe('GET');return Response.json(eligible);}
    if(url.includes('/simulate?')){expect(JSON.parse(String(init?.body))).toEqual({executionId:'run-a',employmentId:'job-a',offerId:'rate-a'});return Response.json({quote:{provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'OFFER',simulationId:'sim-a',amount:1200,data:{vctex:{employmentId:'job-a',offerId:'rate-a'}}}});}
    throw Error('Unexpected request');
  });vi.stubGlobal('fetch',fetcher);
  const result=render(<VctexCltActions active scope="tenant-a:user-a" executionId="run-a" onRows={rows}/>);
  await screen.findByRole('link',{name:'Abrir termo oficial'});
  expect(fetcher.mock.calls.filter(([url])=>url.includes('/simulate?'))).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Atualizar consulta pelo ID'}));
  await waitFor(()=>expect(fetcher.mock.calls.filter(([url])=>url.includes('/simulate?'))).toHaveLength(1));
  await waitFor(()=>expect(rows.mock.calls.some(([r])=>r.some((row:any)=>row.simulationId==='sim-a'))).toBe(true));
  result.rerender(<VctexCltActions active scope="tenant-a:user-a" executionId="run-a" onRows={rows}/>);
  expect(fetcher.mock.calls.filter(([url])=>url.includes('/start?'))).toHaveLength(1);
  expect(fetcher.mock.calls.some(([url])=>url.includes('appvctex.com.br'))).toBe(false);
});
it('aborts observation on close and discards a delayed response from the previous customer/tenant',async()=>{
  let finish!: (response:Response)=>void;
  const fetcher=vi.fn(async(url:string)=>url.endsWith('/connections')?Response.json([{id:'p-a',name:'Sintética'}]):new Promise<Response>(r=>{finish=r;})),rows=vi.fn();
  vi.stubGlobal('fetch',fetcher);
  const result=render(<VctexCltActions active scope="tenant-a:user-a" executionId="run-a" onRows={rows}/>);
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  const signal=(fetcher.mock.calls[1] as any)[1]?.signal;
  result.rerender(<VctexCltActions active={false} scope="tenant-b:user-a" executionId="run-b" onRows={rows}/>);
  if(signal)expect(signal.aborted).toBe(true);
  finish(Response.json(eligible));await Promise.resolve();
  expect(screen.queryByText('Empresa sintética')).toBeNull();expect(rows).not.toHaveBeenCalled();
});
it('does not retry an uncertain financial POST automatically',async()=>{
  const fetcher=vi.fn(async(url:string)=>url.endsWith('/connections')?Response.json([{id:'p-a',name:'Sintética'}]):url.includes('/start?')?Response.json(eligible):Response.json({error:'Resultado VCTEX incerto.',uncertain:true},{status:409}));vi.stubGlobal('fetch',fetcher);
  render(<VctexCltActions active scope="tenant-a:user-a" executionId="run-a" onRows={()=>{}}/>);
  await screen.findByRole('alert');
  expect(fetcher.mock.calls.filter(([url])=>url.includes('/simulate?'))).toHaveLength(1);
  expect(screen.getByRole('alert').textContent).toContain('incerto');
});

it('publishes each stable employment once and renders no repeated employment cards in managed pricing',async()=>{
 const duplicate={...eligible,employments:[eligible.employments[0],eligible.employments[0],{...eligible.employments[0],employmentId:'job-b'}]};
 const rows=vi.fn();vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/connections')?Response.json([{id:'p-a',name:'Sintética'}]):Response.json(duplicate)));
 render(<VctexCltActions active managedPricing pricingLocked scope="tenant-a:user-a" executionId="run-a" onRows={rows}/>);
 await waitFor(()=>expect(rows).toHaveBeenCalled());const latest=rows.mock.calls.at(-1)![0];expect(latest.filter((r:any)=>r.state==='DATA')).toHaveLength(2);expect(screen.queryByText('Empresa sintética')).toBeNull();
});
