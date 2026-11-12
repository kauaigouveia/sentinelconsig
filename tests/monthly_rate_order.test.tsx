import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {PortabilityResults} from '../src/components/simulation/PortabilityResults';
import {higherMonthlyRateFirst} from '../src/lib/monthlyRateOrder';

it('destaca a maior taxa disponível mesmo quando outra condição tem mais troco',()=>{
  const rows = [
    {provider:'Banco',success:true,troco:900,rate:null,table:{name:'Sem taxa'}},
    {provider:'Banco',success:true,troco:750,rate:'1,79',table:{name:'Tabela menor'}},
    {provider:'Banco',success:true,troco:500,rate:'1,85',table:{name:'Tabela maior'}},
    {provider:'Banco',success:false,troco:0,rate:'1,90',table:{name:'Sem oferta'}}
  ];
  const render=(items:typeof rows)=>renderToStaticMarkup(<PortabilityResults rows={items} selected={null} onSelect={()=>{}} conditionFor={row=>({rate:row.rate})}/>);
  const html=render(rows);
  expect(html.indexOf('Tabela maior')).toBeLessThan(html.indexOf('<details'));
  expect(html.indexOf('Tabela menor')).toBeLessThan(html.indexOf('Sem taxa'));
  expect(render(rows.filter(row=>row.rate!=='1,85')).indexOf('Tabela menor')).toBeLessThan(render(rows.filter(row=>row.rate!=='1,85')).indexOf('<details'));
});
it('compara taxas numéricas e percentuais sem inventar taxa ausente',()=>{
  expect([null,'1,79%',1.85,0].sort(higherMonthlyRateFirst)).toEqual([1.85,'1,79%',0,null]);
});
