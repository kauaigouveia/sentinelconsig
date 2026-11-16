// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {buildPortRefinBreakdown,originContractSuffix,portabilityInstallmentStatus,portabilityBreakdownText} from '../src/lib/portRefinBreakdown';
import {PortRefinInstallmentsTable} from '../src/components/simulation/PortRefinInstallmentsTable';
import {portabilityQuoteCondition} from '../src/lib/portRefinQuote';
afterEach(cleanup);

const contracts=[
 {label:'Contrato 1',bankCode:'041',contractSuffix:'AA1234',originalInstallment:216.30,newInstallment:216.30,returnRate:1.82},
 {label:'Contrato 2',bankCode:'237',contractSuffix:'BB5678',originalInstallment:621.22,newInstallment:610.00,returnRate:2.12},
 {label:'Contrato 4',bankCode:'237',contractSuffix:'CC9012',originalInstallment:64.66,newInstallment:64.66,returnRate:1.76},
];
describe('parcelas portadas X parcela do refinanciamento',()=>{
 it('distingue originais, ajustadas, redução e parcela do novo refin',()=>{
  const detail=buildPortRefinBreakdown(contracts,902.18)!;
  expect(detail.originalPortabilityTotal).toBe(902.18);
  expect(detail.adjustedPortabilityTotal).toBe(890.96);
  expect(detail.refinanceInstallment).toBe(902.18);
  expect(portabilityInstallmentStatus(contracts[0])).toMatchObject({label:'Mantida',difference:0});
  expect(portabilityInstallmentStatus(contracts[1])).toMatchObject({label:'Reduzida',difference:11.22});
  expect(portabilityInstallmentStatus(contracts[2])).toMatchObject({label:'Mantida',difference:0});
  const message=portabilityBreakdownText(detail);
  expect(message).toContain('Contrato 2');
  expect(message).toContain('R$ 621,22');
  expect(message).toContain('R$ 610,00');
  expect(message).toContain('NOVO REFINANCIAMENTO');
 });
 it('não infere que parcela foi mantida quando o cálculo não a informou',()=>{
  const detail=buildPortRefinBreakdown([{...contracts[0],newInstallment:null}],100)!;
  expect(detail.adjustedPortabilityTotal).toBeNull();
  expect(portabilityInstallmentStatus(detail.contracts[0]).label).toBe('Não informada');
 });
 it('salva composição financeira em cotação Daycoval e limita referência do contrato',()=>{
  const offer=portabilityQuoteCondition({
   provider:'DAYCOVAL',troco:10289.01,term:108,
   table:{cod_tabela:'805315',name:'RFN INSS 5'},
   data:{rate:1.79,installment:902.18},installmentChanges:contracts,
  });
  expect(offer.portabilityBreakdown).toMatchObject({originalPortabilityTotal:902.18,adjustedPortabilityTotal:890.96,refinanceInstallment:902.18});
  expect(offer.portabilityBreakdown?.contracts[1]).toMatchObject({bankCode:'237',contractSuffix:'5678',newInstallment:610});
  expect(originContractSuffix('12.345.678-9')).toBe('6789');
 });
 it('exibe a composição de todas as parcelas aberta, sem exigir clique para entender a redução',()=>{
  const detail=buildPortRefinBreakdown(contracts,902.18)!;
  render(<PortRefinInstallmentsTable detail={detail}/>);
  const table=screen.getByRole('table');
  expect(table).toBeTruthy();
  expect(screen.getByText('Contrato 1')).toBeTruthy();
  expect(screen.getByText('Contrato 2')).toBeTruthy();
  expect(screen.getByText('Contrato 4')).toBeTruthy();
  expect(screen.getByText('Reduzida')).toBeTruthy();
  expect(screen.getByText('Parcela do NOVO refinanciamento')).toBeTruthy();
  expect(screen.getAllByText(/902,18/).length).toBeGreaterThan(0);
 });
});
