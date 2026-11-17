// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {PortabilityResults} from '../src/components/simulation/PortabilityResults';

afterEach(cleanup);
describe('prioridade de unificações Daycoval no portal',()=>{
 it('ordena a paginação por melhores agrupamentos e, depois, por maior troco',()=>{
  const values=[
    {group:[1,2],table:6,troco:9546.63},
    {group:[1,2,3],table:6,troco:9971.91},
    {group:[1,2,4],table:5,troco:10312.75},
    {group:[1,3],table:5,troco:2754.28},
    {group:[1,3,4],table:4,troco:3815.43},
    {group:[2,3],table:6,troco:7506.37},
    {group:[2,3,4],table:5,troco:8375.77},
    {group:[2,4],table:5,troco:7967.12},
    {group:[1,4],table:5,troco:3576.03},
    {group:[3,4],table:1,troco:1406.45},
  ];
  const rows=values.map(item=>({
    provider:'DAYCOVAL',success:true,unified:true,
    contractLabel:'Unificação Daycoval · contratos '+item.group.join(' + '),
    sourceContracts:item.group.map(index=>({id:index})),
    table:{name:'80058'+item.table+' - RFN - INSS '+item.table},
    troco:item.troco,term:108,data:{installment:200,rate:1.85},
  }));
  render(<PortabilityResults rows={rows} selected={null} onSelect={()=>{}}
    conditionFor={row=>({rate:row.data.rate,installment:row.data.installment})}/>);
  fireEvent.click(screen.getByRole('button',{name:/Unificações Daycoval/}));
  const visible=()=>[...document.querySelectorAll('article h4')].map(x=>x.textContent);
  expect(visible()).toEqual([
    'Unificação Daycoval · contratos 1 + 3 + 4',
    'Unificação Daycoval · contratos 3 + 4',
    'Unificação Daycoval · contratos 1 + 2 + 4',
  ]);
  expect(screen.getByText('Página 1 de 4 · 10 grupos')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Próxima'}));
  expect(visible()).toEqual([
    'Unificação Daycoval · contratos 1 + 2 + 3',
    'Unificação Daycoval · contratos 1 + 2',
    'Unificação Daycoval · contratos 2 + 3 + 4',
  ]);
 });
});
