// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {BankPlaybooksView} from '../src/components/simulation/BankPlaybooksView';
import {BankPlaybooksPanel} from '../src/components/simulation/BankPlaybooksPanel';
const book={id:'daycoval',name:'Daycoval',convenios:['INSS'],sections:[{id:'complete',title:'Texto integral',page:0,topics:['Portabilidade'],paragraphs:['Detalhe preservado da fonte'],tables:[]}],guide:{summary:[{label:'Idade mínima',value:'18 anos'},{label:'Parcela mínima',value:'R$ 20,00'}],restrictions:['Não permite portabilidade pura.'],sources:[{file:'Documento sintético',receivedAt:'2026-10-30',effectiveAt:null}],details:['Divergência documental preservada'],agreements:[],hasConflicts:true}};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('centralizes filters and keeps complete sources collapsed until requested, without bank calls',async()=>{
 const fetch=vi.fn(async(..._args:any[])=>new Response(JSON.stringify({rows:[book],canDiagnose:false})));vi.stubGlobal('fetch',fetch);
 render(<BankPlaybooksView/>);await screen.findByRole('button',{name:'Consultar Daycoval'});
 fireEvent.click(screen.getByRole('button',{name:'Consultar Daycoval'}));
 expect(screen.getByRole('heading',{name:'Resumo'})).toBeTruthy();expect(screen.getByRole('heading',{name:'Restrições'})).toBeTruthy();
 const details=screen.getByText('Detalhes · regras completas e fontes').closest('details')!;expect(details.open).toBe(false);
 fireEvent.click(screen.getByText('Detalhes · regras completas e fontes'));expect(details.open).toBe(true);expect(within(details).getByText('Detalhe preservado da fonte')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Convênio'),{target:{value:'CLT'}});expect(screen.getByText(/Nenhum roteiro disponível/)).toBeTruthy();
 expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toBe('/api/bank-playbooks');
});
it('does not expose contract exclusions or priority rules in the partner panel',()=>{
 render(<BankPlaybooksPanel portal input={{birthDate:'1980-01-01',species:'41',operation:'PORT_REFIN',originBank:'012',paidInstallments:20}}/>);
 expect(screen.queryByRole('table')).toBeNull();expect(screen.queryByText(/Divergência documental/)).toBeNull();
});
