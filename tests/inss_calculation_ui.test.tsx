import {StorageService} from '../src/services/storageService';
// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NossaFintechPortRefinSimulationModal} from '../src/components/simulation/NossaFintechPortRefinSimulationModal';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('calls Daycoval/C6 read-only calculators from the real form, keeps estimates despite independent FACTA failure, and never saves automatically',async()=>{
 const fetch=vi.fn(async(url:any,init?:RequestInit)=>{
  if(url==='/api/bank-playbooks')return new Response(JSON.stringify({canDiagnose:false}));
  if(url==='/api/integrations/finanto/config')return new Response(JSON.stringify({enabled:false}));
  if(url==='/api/integrations/nossa-fintech/port-refin/simulate-all')return new Response(JSON.stringify({success:false,error:'Fixture Nossa sem oferta'}));
  if(url==='/api/integrations/facta/inss/simulate')return new Response(JSON.stringify({error:'FACTA HTTP 200 com corpo vazio'}),{status:502});
  if(url==='/api/parana-spreadsheet/calculate')return new Response(JSON.stringify({error:'Paraná: parcela mínima não atendida'}),{status:422});
  if(url==='/api/c6-spreadsheet/calculate')return new Response(JSON.stringify({error:'Prazo 84 não disponível na planilha C6'}),{status:422});
  if(url==='/api/daycoval/calculate')return new Response(JSON.stringify({offers:[{code:'synthetic',name:'SYNTHETIC_TABLE',amount:100,installment:43,term:84,rate:1,requiresReview:true}]}));
  throw Error('Unexpected request in synthetic test');
 });vi.stubGlobal('fetch',fetch);
 render(<NossaFintechPortRefinSimulationModal isOpen onClose={()=>{}}/>);
 const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
 change('CPF','00000000191');change('Data de nascimento','1959-10-30');change('Número do benefício','123456789');
 fireEvent.change(screen.getByRole('combobox',{name:/Espécie/}),{target:{value:'41'}});fireEvent.click(screen.getByRole('button',{name:'41 - Aposentadoria por Idade'}));
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 change('Banco de origem','001');change('Número do contrato','SYNTHETIC');change('Prazo original (meses)','84');change('Parcelas restantes','57');change('Saldo devedor (R$)','3.481,19');change('Parcela atual (R$)','43,00');change('Prazo do novo refinanciamento','84');
 fireEvent.submit(screen.getByRole('button',{name:'Comparar ofertas'}).closest('form')!);
 await screen.findByText('SYNTHETIC_TABLE');
 const call=fetch.mock.calls.find(([url])=>url==='/api/daycoval/calculate')!;
 expect(JSON.parse(String(call[1]?.body))).toMatchObject({term:84,contracts:[{originBank:'001',originalTerm:84,remaining:57,balance:3481.19,installment:43}]});
 expect(screen.getByText(/FACTA HTTP 200 com corpo vazio/)).toBeTruthy();expect(screen.getByText(/Prazo 84 não disponível na planilha C6/)).toBeTruthy();
 expect(screen.getByRole('button',{name:'Selecionar'}).hasAttribute('disabled')).toBe(true);
 expect(fetch.mock.calls.filter(([url])=>url==='/api/daycoval/calculate')).toHaveLength(1);
 expect(fetch.mock.calls.some(([url])=>url==='/api/simulations')).toBe(false);
 expect(fetch.mock.calls.filter(([url])=>url==='/api/parana-spreadsheet/calculate')).toHaveLength(1);
 expect(screen.queryByText('UF: confirmar informação.')).toBeNull();expect(screen.queryByText('Banco com exigência de 13 parcelas pagas não identificado.')).toBeNull();
});

it('filters lower FINANTO tiers before requesting calculations for an installment above 300',async()=>{
 const rules=['ESSENCIAL ≥ 50','SELECT ≥ 100','PRIME ≥ 300','PRIME ≥ 300 +90DIAS'].map((name,index)=>({id:`rule-${index}`,name,product:{id:'inss'},items:[{term:108,rate:1.85}]}));
 const fetch=vi.fn(async(url:any,init?:RequestInit)=>{
  if(url==='/api/bank-playbooks')return new Response(JSON.stringify({canDiagnose:false}));
  if(url==='/api/integrations/finanto/config')return new Response(JSON.stringify({enabled:true,isConfigured:true}));
  if(url==='/api/integrations/finanto/request'){
   const request=JSON.parse(String(init?.body));
   if(request.endpoint.includes('loan-products/'))return new Response(JSON.stringify({items:[{id:'inss',type:{code:20}}]}));
   if(request.endpoint.includes('loan-product-rules/'))return new Response(JSON.stringify({items:rules}));
   if(request.endpoint.includes('/calculation'))return new Response(JSON.stringify({refinancing:{netValue:500,installmentValue:319.56}}));
   throw Error('Unexpected FINANTO mock endpoint');
  }
  return new Response(JSON.stringify({offers:[],success:false,error:'Synthetic integration without offer'}));
 });vi.stubGlobal('fetch',fetch);
 render(<NossaFintechPortRefinSimulationModal isOpen onClose={()=>{}}/>);
 const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
 change('CPF','00000000191');change('Data de nascimento','1980-01-01');change('Número do benefício','123456789');
 fireEvent.change(screen.getByRole('combobox',{name:/Espécie/}),{target:{value:'41'}});fireEvent.click(screen.getByRole('button',{name:'41 - Aposentadoria por Idade'}));
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 change('Banco de origem','001');change('Número do contrato','SYNTHETIC');change('Prazo original (meses)','84');change('Parcelas restantes','57');change('Saldo devedor (R$)','3.481,19');change('Parcela atual (R$)','319,56');change('Prazo do novo refinanciamento','108');
 fireEvent.submit(screen.getByRole('button',{name:'Comparar ofertas'}).closest('form')!);
 await screen.findByText('PRIME ≥ 300 +90DIAS');
 const requests=fetch.mock.calls.filter(([url])=>url==='/api/integrations/finanto/request').map(([,init])=>JSON.parse(String(init?.body))).filter(row=>row.endpoint.endsWith('/calculation'));
 expect(requests.map(row=>row.body.ruleId).sort()).toEqual(['rule-2','rule-3']);
 expect(screen.getAllByRole('button',{name:'Selecionar'})).toHaveLength(2);
});

it('runs all six individual bank paths for two contracts and one explicit Daycoval group request',async()=>{
 const fetch=vi.fn(async(url:any,init?:RequestInit)=>{
  if(url==='/api/bank-playbooks')return new Response(JSON.stringify({canDiagnose:false}));
  if(url==='/api/integrations/finanto/config')return new Response(JSON.stringify({enabled:false}));
  if(url==='/api/daycoval/calculate-groups')return new Response(JSON.stringify({groups:[{indices:[0,1],offers:[{code:'UNIFIED',name:'Synthetic unified',amount:600,installment:80,term:84,rate:1.85}]}]}));
  if(url==='/api/daycoval/calculate')return new Response(JSON.stringify({offers:[{code:'INDIVIDUAL',name:'Synthetic individual',amount:100,installment:43,term:84,rate:1.85,requiresReview:true}]}));
  return new Response(JSON.stringify({offers:[],success:false,error:'Synthetic unavailable bank'}));
 });vi.stubGlobal('fetch',fetch);
 render(<NossaFintechPortRefinSimulationModal isOpen onClose={()=>{}}/>);
 const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
 change('CPF','00000000191');change('Data de nascimento','1980-01-01');change('Número do benefício','123456789');
 fireEvent.change(screen.getByRole('combobox',{name:/Espécie/}),{target:{value:'41'}});fireEvent.click(screen.getByRole('button',{name:'41 - Aposentadoria por Idade'}));
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 change('Banco de origem','001');change('Número do contrato','SYNTHETIC-A');change('Prazo original (meses)','84');change('Parcelas restantes','57');change('Saldo devedor (R$)','3.481,19');change('Parcela atual (R$)','43,00');change('Prazo do novo refinanciamento','84');
 fireEvent.click(screen.getByRole('button',{name:'Adicionar contrato à lista'}));
 for(const label of ['Banco de origem','Número do contrato','Prazo original (meses)','Parcelas restantes','Saldo devedor (R$)','Parcela atual (R$)'])expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('');
 expect((screen.getByLabelText('CPF') as HTMLInputElement).value.replace(/\D/g,'')).toBe('00000000191');
 change('Banco de origem','001');change('Número do contrato','SYNTHETIC-B');change('Prazo original (meses)','84');change('Parcelas restantes','57');change('Saldo devedor (R$)','3.481,19');change('Parcela atual (R$)','48,00');
 fireEvent.click(screen.getByRole('button',{name:'Adicionar contrato à lista'}));
 expect((screen.getByLabelText('Número do contrato') as HTMLInputElement).value).toBe('');
 expect((screen.getByRole('button',{name:'Comparar ofertas'}).closest('form') as HTMLFormElement).checkValidity()).toBe(true);
 fireEvent.click(screen.getByRole('checkbox',{name:/Calcular também unificações/}));
 const submit=screen.getByRole('button',{name:'Comparar ofertas'}).closest('form')!;
 fireEvent.submit(submit);fireEvent.submit(submit);
 await screen.findByRole('button',{name:/Unificações Daycoval/});
 fireEvent.click(screen.getByRole('button',{name:/Unificações Daycoval/}));
 await screen.findByText('Synthetic unified');
 expect(screen.getByText('Soma das parcelas originais').textContent).toContain('91,00');
 expect(screen.getByText('Nova parcela unificada').textContent).toContain('80,00');
 for(const url of ['/api/daycoval/calculate','/api/c6-spreadsheet/calculate','/api/parana-spreadsheet/calculate','/api/integrations/finanto/config','/api/integrations/facta/inss/simulate','/api/integrations/nossa-fintech/port-refin/simulate-all'])expect(fetch.mock.calls.filter(([path])=>path===url)).toHaveLength(2);
 const groups=fetch.mock.calls.filter(([path])=>path==='/api/daycoval/calculate-groups');expect(groups).toHaveLength(1);
 expect(JSON.parse(String(groups[0][1]?.body)).contracts.map((c:any)=>c.contractNumber)).toEqual(['SYNTHETIC-A','SYNTHETIC-B']);
 expect(screen.getAllByRole('button',{name:'Selecionar'}).every(button=>button.hasAttribute('disabled'))).toBe(true);
 expect(fetch.mock.calls.some(([path])=>path==='/api/simulations')).toBe(false);
});

it('clears personal fields and queued contracts when the selected company changes',()=>{
 let tenant='synthetic-a';vi.spyOn(StorageService,'getCurrentTenantId').mockImplementation(()=>tenant);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({canDiagnose:false}))));
 render(<NossaFintechPortRefinSimulationModal isOpen onClose={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('CPF'),{target:{value:'00000000191'}});
 tenant='synthetic-b';fireEvent(window,new Event('credit_gestao_storage_update'));
 expect((screen.getByLabelText('CPF') as HTMLInputElement).value).toBe('');
 expect(screen.queryByText(/Contrato 1 · banco/)).toBeNull();
});
