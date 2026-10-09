import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CltCustomerDataCard } from '../src/components/simulation/CltCustomerDataCard';

describe('Dados CLT legíveis', () => {
  it('apresenta condições FINANTO sem expor JSON ou identificadores internos', () => {
    const html = renderToStaticMarkup(<CltCustomerDataCard selectedEmployer="" onSelectEmployer={() => {}} row={{ institution: 'QI Tech', provider: 'FINANTO', data: { borrower: { id: 'internal-secret-id', name: 'Cliente', birthDate: '1990-02-03' }, items: [{ employerName: 'Empresa', employerDocument: '12345678000190', term: 24, rate: 2, netValue: 5000, installmentValue: 250 }] } }} />);
    expect(html).toContain('Integração: FINANTO');
    expect(html).toContain('Banco: QI Tech');
    expect(html).toContain('12.345.678/0001-90');
    expect(html).toContain('03/02/1990');
    expect(html).toContain('24 meses');
    expect(html).toContain('Usar este vínculo');
    expect(html).not.toContain('<pre');
    expect(html).not.toContain('internal-secret-id');
  });
  it('preserva margem zero e distingue valores ausentes na Nossa Fintech', () => {
    const html = renderToStaticMarkup(<CltCustomerDataCard selectedEmployer="" onSelectEmployer={() => {}} row={{ institution: 'QITECH', provider: 'Nossa Fintech', data: { margin: { name: 'Cliente', available_balance: 0, utilizable_balance: null, employer: { name: 'Empresa' } } } }} />);
    expect(html).toContain('Margem disponível');
    expect(html).toContain('0,00');
    expect(html).toContain('Não informado');
    expect(html).not.toContain('<pre');
  });
});
