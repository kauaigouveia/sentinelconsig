// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {NossaFintechPortRefinSimulationModal} from '../src/components/simulation/NossaFintechPortRefinSimulationModal';
import {StorageService} from '../src/services/storageService';
import type {ReviewedInssStatement} from '../src/lib/inssStatement';

const fixture:ReviewedInssStatement={
 customer:{cpf:'52998224725',name:'Pessoa sintética',birthDate:'1960-01-01',benefitNumber:'1234567890',benefitType:'41'},
 income:'1621.00',loanMargin:'36.52',cardMargin:'',benefitCardMargin:'',reference:'10/2026',
 uf:'',benefitStart:'',issues:[],illiterate:'NO',benefitContractCount:'2',
 contracts:['623','237'].map((bank,index)=>({
  originLenderCode:bank,originContractNumber:'TEST-'+index,originalTerm:'84',
  openedInstallmentNumber:'27',lastDueBalance:'1500.00',installmentFaceValue:'65.50',
 })),
};
beforeEach(()=>{
 vi.spyOn(StorageService,'getCurrentTenantId').mockReturnValue('tenant-test');
 vi.spyOn(StorageService,'getActiveUser').mockReturnValue({id:'user-test'} as ReturnType<typeof StorageService.getActiveUser>);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('botão único dispara NOVO, C6 e Paraná e recupera unificações Daycoval e compartilhamento',async()=>{
 const calls:Array<{url:string;body:any}>=[];
 const fetchMock=vi.fn(async(url:string,init?:RequestInit)=>{
  const body=init?.body?JSON.parse(String(init.body)):null;
  calls.push({url,body});
  let result:any={offers:[]};
  if(url==='/api/integrations/finanto/config')result={isConfigured:false,enabled:false};
  if(url==='/api/integrations/nossa-fintech/port-refin/simulate-all')
    result={success:true,data:{results:[],excludedTables:[{table:{name:'Sem tabela'},reason:'não elegível'}]}};
  if(url==='/api/integrations/facta/inss/simulate')result={offers:[]};
  if(url==='/api/daycoval/calculate')result={offers:[{
    name:'800584 - RFN INSS 4',code:'800584',amount:950,installment:65.5,term:108,rate:1.74,
    installmentChanges:[{originalInstallment:65.5,newInstallment:63.2,returnRate:1.492}],
  }]};
  if(url==='/api/c6-spreadsheet/calculate')result={offers:[{
    name:'C6 Planilha Port',code:'C6-PORT',amount:550,installment:65.5,term:108,rate:1.85,
  }]};
  if(url==='/api/parana-spreadsheet/calculate')result={offers:[{
    name:'Paraná Port',code:'PR-108',amount:660,installment:65.5,term:108,rate:1.83,
  }]};
  if(url==='/api/daycoval/calculate-groups')result={groups:[{
    indices:[0,1],offers:[{name:'RFN INSS 4',code:'D4',amount:1600,installment:131,term:108,rate:1.75,
      installmentChanges:[
        {originalInstallment:65.5,newInstallment:63.2,returnRate:1.492},
        {originalInstallment:65.5,newInstallment:65.5,returnRate:1.659},
      ]}],
  }],nextOffset:null};
  if(url==='/api/inss/statement/quote')result=body?.operation==='PROJECTED_NEW'
    ? {scenario:'PROJECTED_2027',officialMarginAvailable:false,offers:[{
      provider:'FACTA',institution:'FACTA',table:'NOVO INSS - cenário futuro',
      amount:1956.74,installment:42,rate:1.85,term:108,source:'API',
      scenario:'PROJECTED_2027',nonBinding:true,
    }],notices:[]}
    : {offers:[{
      provider:'FACTA',institution:'FACTA',table:'NOVO INSS',amount:1400,installment:36.52,rate:1.85,term:108,source:'API',
    }],notices:[]};
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 });
 vi.stubGlobal('fetch',fetchMock);
 render(<NossaFintechPortRefinSimulationModal isOpen statement={fixture} autoRunFromStatement
   onClose={()=>{}} onBack={()=>{}} partners={[]} onSuccess={()=>{}}/>);
 await waitFor(()=>expect(calls.some(x=>x.url==='/api/daycoval/calculate-groups')).toBe(true),{timeout:10000});
 await waitFor(()=>expect(calls.some(x=>x.url==='/api/inss/statement/quote')).toBe(true));
 expect(calls.filter(x=>x.url==='/api/c6-spreadsheet/calculate')).toHaveLength(2);
 expect(calls.filter(x=>x.url==='/api/parana-spreadsheet/calculate')).toHaveLength(2);
 for(const call of calls.filter(x=>x.url==='/api/parana-spreadsheet/calculate')){
  expect(call.body.benefitContractCount).toBe(2);
  expect(call.body.refinanceRate).toBeUndefined(); // Banco calcula todas as taxas da planilha
 }
 for(const call of calls.filter(x=>x.url==='/api/c6-spreadsheet/calculate'))expect(call.body.term).toBe(108);
 const group=calls.find(x=>x.url==='/api/daycoval/calculate-groups')!;
 expect(group.body.contracts).toHaveLength(2);
 expect(calls.filter(x=>x.url==='/api/inss/statement/quote'&&x.body?.onlyAdditionalPortBanks===true)).toHaveLength(2);
 const tabPort=screen.getByRole('button',{name:/^PORTABILIDADE \(/});
 const tabNovo=screen.getByRole('button',{name:/^NOVO \(/});
 expect(tabPort.getAttribute('aria-pressed')).toBe('true');
 expect(screen.queryByLabelText('Simulação NOVO pela margem atual')).toBeNull();
 fireEvent.click(tabNovo);
 await waitFor(()=>expect(screen.getByText(/NOVO · Simulações por banco/)).toBeTruthy());
 expect(screen.getByRole('button',{name:/Margem disponível/})).toBeTruthy();
 expect(screen.getByRole('button',{name:/Aumento projetado/})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/Aumento projetado/}));
 expect(screen.getByLabelText('Prévia bancária de aumento de margem 2027')).toBeTruthy();
 await waitFor(()=>expect(calls.some(x=>x.url==='/api/inss/statement/quote'&&x.body.operation==='PROJECTED_NEW')).toBe(true));
 await waitFor(()=>expect(screen.getByText(/API · cenário 2027/)).toBeTruthy());
 expect(screen.getByText(/R\$\s*1\.956,74/)).toBeTruthy();
 fireEvent.click(tabPort);
 expect(tabPort.getAttribute('aria-pressed')).toBe('true');
 const unification=screen.getByRole('button',{name:/Unificações Daycoval/});
 fireEvent.click(unification);
 await waitFor(()=>expect(screen.getAllByText(/Unificação Daycoval/).length).toBeGreaterThan(0));
 const selectable=screen.getAllByRole('button',{name:'Selecionar cotação'});
 fireEvent.click(selectable[0]);
 fireEvent.click(tabNovo);
 fireEvent.click(tabPort);
 expect(screen.getByRole('button',{name:/Unificações Daycoval/}).getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByRole('region',{name:'Cotações selecionadas preservadas'}).textContent).toContain('Unificação');
 const copied=vi.fn().mockResolvedValue(undefined);
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copied}});
 fireEvent.click(screen.getByRole('button',{name:'Copiar para WhatsApp'}));
 await waitFor(()=>expect(copied).toHaveBeenCalledOnce());
 expect(String(copied.mock.calls[0][0])).toContain('PORTABILIDADE');
 expect(String(copied.mock.calls[0][0])).toMatch(/daycoval/i);
});

it('extrato sem empréstimos inicia apenas NOVO e não chama portabilidade dos bancos',async()=>{
  const calls:Array<{url:string;body:any}>=[];
  const fetchMock=vi.fn(async(url:string,init?:RequestInit)=>{
    const body=init?.body?JSON.parse(String(init.body)):null;
    calls.push({url,body});
    if(url!=='/api/inss/statement/quote')
      throw new Error('Consulta de portabilidade indevida em extrato sem contratos: '+url);
    return new Response(JSON.stringify({offers:[{
      provider:'C6',institution:'C6',table:'INSS NOVO real consultado',
      amount:3000,installment:87.06,rate:1.85,term:108,source:'API',
    }],notices:[]}),{status:200,headers:{'Content-Type':'application/json'}});
  });
  vi.stubGlobal('fetch',fetchMock);
  render(<NossaFintechPortRefinSimulationModal
    isOpen statement={{...fixture,contracts:[],loanMargin:'87.06',benefitContractCount:''}}
    autoRunFromStatement onClose={()=>{}} onBack={()=>{}} partners={[]} onSuccess={()=>{}}/>);
  await waitFor(()=>expect(calls.some(call=>call.body?.operation==='NEW')).toBe(true));
  await waitFor(()=>expect(screen.getByRole('button',{name:/^NOVO \(1\)/})).toBeTruthy());
  expect(screen.queryByRole('button',{name:/PORTABILIDADE \(/})).toBeNull();
  expect(screen.getByText(/INSS · NOVO pela margem do extrato/)).toBeTruthy();
  expect(screen.queryByText(/alternativas em 60 meses quando elegíveis/)).toBeNull();
  expect(calls.every(call=>call.url==='/api/inss/statement/quote')).toBe(true);
  expect(calls.every(call=>call.body?.operation==='NEW')).toBe(true);
});
