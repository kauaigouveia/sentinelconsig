// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NossaFintechPortRefinSimulationModal} from '../src/components/simulation/NossaFintechPortRefinSimulationModal';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
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
