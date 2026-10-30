// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {BankPlaybooksPanel} from '../src/components/simulation/BankPlaybooksPanel';
afterEach(cleanup);
it('shows independent Paraná/Banrisul, statuses, source uncertainty and individual/all selection',()=>{
 render(<BankPlaybooksPanel input={{operation:'PORT_REFIN',birthDate:'1980-01-01',species:'41',originBank:'001',paidInstallments:30,
  term:36,debt:10000,originalInstallment:900,remainingInstallments:36,state:'SP',amount:1000}}/>);
 expect(screen.getAllByText(/sem vigência\/prioridade/).length).toBeGreaterThan(0);
 fireEvent.click(screen.getByText(/Conferir regras de portabilidade em/));
 const select=screen.getByRole('combobox',{name:'Banco de destino'});
 expect(screen.getByRole('option',{name:'Todos os bancos'})).toBeTruthy();
 fireEvent.change(select,{target:{value:'parana'}});
 expect(screen.getAllByRole('row')).toHaveLength(2);
 expect(screen.getByText('PENDENTE DE DADOS')).toBeTruthy();
 fireEvent.change(select,{target:{value:'banrisul'}});expect(screen.getAllByRole('row')).toHaveLength(2);
 fireEvent.change(select,{target:{value:'ALL'}});expect(screen.getAllByRole('row').length).toBeGreaterThan(9);
});
