// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FinantoInssSimulationModal} from '../src/components/simulation/FinantoInssSimulationModal';
const captured=vi.hoisted(()=>({input:null as any}));
vi.mock('../src/components/simulation/BankPlaybooksPanel',()=>({BankPlaybooksPanel:({input}:any)=>{captured.input=input;return <div data-testid="policy-input"/>;}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();captured.input=null;});
it('carries the entered contract into the Offers policy panel, without bank access',async()=>{
 const fetch=vi.fn(async(..._args:any[])=>new Response(JSON.stringify({items:[],offers:[],message:'Fixture sintética sem oferta'})));vi.stubGlobal('fetch',fetch);
 render(<FinantoInssSimulationModal isOpen operationCode="4" partners={[]} onClose={()=>{}} onSuccess={()=>{}}/>);
 const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
 change('CPF','00000000191');change('Data de nascimento','1959-10-30');change('Número do benefício','123456789');
 const species=screen.getByRole('combobox',{name:/Espécie/});fireEvent.change(species,{target:{value:'41'}});fireEvent.click(screen.getByRole('button',{name:'41 - Aposentadoria por Idade'}));
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 change('Banco de origem','001');change('Número do contrato','SYNTHETIC');change('Prazo original (meses)','84');change('Parcelas restantes','15');change('Valor da parcela atual (R$)','25.91');change('Saldo devedor (R$)','1548.18');
 change('Prazo do refinanciamento (meses)','108');
 fireEvent.click(screen.getByRole('button',{name:'Comparar ofertas'}));
 await waitFor(()=>expect(screen.getByTestId('policy-input')).toBeTruthy());
 expect(captured.input).toMatchObject({operation:'PORT_REFIN',originBank:'001',debt:1548.18,originalInstallment:25.91,remainingInstallments:15,paidInstallments:69,term:108,birthDate:'1959-10-30',species:'41'});
 // With no official rate returned by the mock catalog, financial submission remains blocked.
 expect(fetch.mock.calls.some(args=>args[0]==='/api/integrations/facta/inss/simulate')).toBe(false);
});
