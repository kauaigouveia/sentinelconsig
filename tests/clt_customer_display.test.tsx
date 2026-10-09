import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CltCustomerDataCard } from '../src/components/simulation/CltCustomerDataCard';

describe('Dados CLT legíveis', () => {
  it('destaca o motivo retornado e não oferece seleção do vínculo restrito', () => {
    const html = renderToStaticMarkup(<CltCustomerDataCard selectedEmployer="" onSelectEmployer={() => {}} row={{ institution: 'QI Tech', provider: 'Nossa Fintech', data: { margin: { can_continue: false, employer: { document: '12345678000190' }, restrictions: [{ code: 'CNAE', description: 'CNAE 4712100 restrito para este tipo de operação' }] } } }} />);
    expect(html).toContain('Restrição informada pelo banco');
    expect(html).toContain('CNAE 4712100 restrito para este tipo de operação');
    expect(html).not.toContain('Usar este vínculo');
  });
  it('não afirma ter condições disponíveis quando a FINANTO retorna lista vazia', () => {
    const html = renderToStaticMarkup(<CltCustomerDataCard selectedEmployer="" onSelectEmployer={() => {}} row={{ institution: 'QI Tech', provider: 'FINANTO', message: 'Nenhuma condição de crédito retornada. O banco não informou o motivo.', data: { borrower: { name: 'Cliente' }, items: [] } }} />);
    expect(html).toContain('Nenhuma oferta retornada');
    expect(html).toContain('O banco não informou o motivo');
    expect(html).not.toContain('A consulta retornou condições de crédito');
  });
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
    const html = renderToStaticMarkup(<CltCustomerDataCard selectedEmployer="" onSelectEmployer={() => {}} row={{ institution: 'QITECH', provider: 'Nossa Fintech', data: { margin: { name: 'Cliente', document: '12345678900', available_balance: 0, utilizable_balance: null, employer: { name: 'Empresa' } } } }} />);
    expect(html).toContain('CPF retornado');
    expect(html).toContain('123.456.789-00');
    expect(html).toContain('Margem disponível');
    expect(html).toContain('0,00');
    expect(html).toContain('Não informado');
    expect(html).not.toContain('<pre');
  });
});
