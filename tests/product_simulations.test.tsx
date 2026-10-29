import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ProductSimulationService } from '../server/services/productSimulationService';
import { NossaFintechService } from '../server/services/nossaFintechService';
import { FactaBankService } from '../server/services/factaBankService';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';
import { FinantoService } from '../server/services/finantoService';
import { SimulationFlowSelectorModal } from '../src/components/simulation/SimulationFlowSelectorModal';

const input = { cpf: 'fixture', name: 'Cliente', phone: '11999999999', term: 4, value: 500, mode: 'Payment' as const, eligibility: true };
beforeEach(() => {vi.spyOn(V8CltSimulationService,'run').mockResolvedValue([]);vi.spyOn(FactaBankService, 'getTenantConfig').mockResolvedValue({ simulationEnabled: false, isConfigured: false } as any);});
afterEach(() => vi.restoreAllMocks());
function configs() {
  vi.spyOn(NossaFintechService, 'getConfig').mockResolvedValue({ enabled: true, isConfigured: true } as any);
  vi.spyOn(FinantoService, 'getConfig').mockResolvedValue({ enabled: false, isConfigured: false } as any);
}
describe('Simulações CLT e FGTS na central', () => {
  it.each(['REFRESH', 'SIMULATE'] as const)('preserva motivo CNAE da Nossa Fintech na ação %s', async action => {
    configs();
    const reason = 'CNAE 4712100 restrito para este tipo de operação';
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint) => ({ success: true, status: 200, data: { success: true, data: endpoint.includes('banking') ? ['QITECH'] : endpoint.includes('check-authorization') ? { status: 'AUTHORIZED' } : { margin_key: 'margin', can_continue: false, restrictions: [{ code: 'CNAE', description: reason }] } } }));
    const result = await ProductSimulationService.run({} as any, 'tenant', 'CLT', action, { ...input, employerDocument: '12345678000100' });
    expect(result.rows[0].message).toContain(reason);
    expect(result.rows[0].state).toBe('PENDING');expect(result.rows[0].outcome).toBe('INELIGIBLE');
    expect(request.mock.calls.some(call => /simulate-loan|list-rebates/.test(call[3]))).toBe(false);
  });
  it('mantém autorização não confirmada quando a própria consulta oficial retorna erro', async () => {
    configs();
    vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint) => endpoint.includes('banking') ? { success: true, status: 200, data: { success: true, data: ['QITECH'] } } : { success: false, status: 422, data: { success: false, message: 'Não elegível', data: { restrictions: ['CNAE restrito'] } } });
    const result = await ProductSimulationService.run({} as any, 'tenant', 'CLT', 'REFRESH', input);
    expect(result.rows[0]).toMatchObject({state:'ERROR',outcome:'TECHNICAL_ERROR',data:{authorization:{status:'UNCONFIRMED'}}});
  });
  it('preserva o motivo retornado na mensagem externa da consulta de margem', async () => {
    configs();
    vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint) => ({ success: true, status: 200, data: endpoint.includes('banking') ? { success: true, data: ['QITECH'] } : endpoint.includes('check-authorization') ? { success: true, data: { status: 'AUTHORIZED' } } : { success: true, message: 'CNAE restrito', data: { can_continue: false, restrictions: [] } } }));
    const result = await ProductSimulationService.run({} as any, 'tenant', 'CLT', 'REFRESH', { ...input, employerDocument: '12345678000100' });
    expect(result.rows[0].message).toBe('CNAE restrito');
  });
  it('preserva os produtos existentes da FINANTO fora da jornada CLT',async()=>{
    configs();const request=vi.spyOn(FinantoService,'request');
    const result=await ProductSimulationService.run({} as any,'tenant','CLT','REFRESH',input,undefined,['finanto']);expect(result.rows).toHaveLength(0);expect(request).not.toHaveBeenCalled();
  });
  it('aceita o documento abreviado do empregador conforme exemplo CLT documentado', async () => {
    configs();
    const margin = { margin_key: 'margin', document: '12345678900', employer: { document: '89412850' }, available_balance: 500, utilizable_balance: 400, base_margin_value: 4500, total_gross_salary: null };
    vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint) => ({ success: true, status: 200, data: { success: true, data: endpoint.includes('banking') ? ['QITECH'] : endpoint.includes('check-authorization') ? { status: 'AUTHORIZED' } : margin } }));
    const result = await ProductSimulationService.run({} as any, 'tenant', 'CLT', 'REFRESH', { ...input, cpf: '12345678900', employerDocument: '00000089412850' });
    expect(result.rows[0]).toMatchObject({ state: 'DATA', data: { margin, employment: { employer_cnpj: '00000089412850' } } });
  });
  it('timeout interno do J17 não impede as ofertas FGTS dos demais bancos', async () => {
    configs();
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint, body: any) => {
      if (body.service_type === 'j17') return { success: false, status: 500, data: { message: 'cURL error 28: Connection timed out after 10002 milliseconds for https://zitadel.dev.j17bank.com.br/oauth/v2/token' } };
      if (endpoint.endsWith('/balance')) return { success: true, status: 200, data: { key: 'balance', status: 'completed', eligible: true } };
      if (endpoint === '/nossa/v2/simulation') return { success: true, status: 200, data: [{ cod_produto: 200, cod_tabela: 'a', name: 'Tabela' }] };
      return { success: true, status: 200, data: { key: 'simulation', disbursed_issue_amount: 2000, number_of_valid_installments: 4 } };
    });
    const result = await ProductSimulationService.run({} as any, 'tenant', 'FGTS', 'SIMULATE', input);
    expect(result.rows.filter(row => row.state === 'OFFER')).toHaveLength(2);
    const j17 = result.rows.find(row => row.institution === 'J17');
    expect(j17).toMatchObject({ state: 'ERROR' });
    expect(j17?.message).toContain('J17 não respondeu à Nossa Fintech');
    expect(j17?.message).not.toContain('https://');
    expect(j17?.amount).toBeUndefined();
    expect(request.mock.calls.filter(call => (call[4] as any).service_type === 'j17')).toHaveLength(1);
  });
  it('atualiza vínculos e margem sem exigir valor nem disparar simulação ou novo SMS', async () => {
    configs();
    const margin = { margin_key: 'margin', name: 'Nome retornado', available_balance: 500, utilizable_balance: 400, employer: { document: '12345678000100', name: 'Empresa retornada' }, can_continue: true, birth_date: '1980-01-01', restrictions: [], base_margin_value: 4500 };
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint) => {
      const data = endpoint.includes('banking') ? ['QITECH'] : endpoint.includes('check-authorization') ? { status: 'AUTHORIZED' }
        : endpoint.includes('check-employee') ? [{ employer_cnpj: '12345678000100', employer_name: 'Empresa retornada', work_registration: 'registration' }] : margin;
      return { success: true, status: 200, data: { success: true, data } };
    });
    const result = await ProductSimulationService.run({} as any, 'tenant', 'CLT', 'REFRESH', { ...input, term: 0, value: 0 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ state: 'DATA', data: { margin, employment: { employer_cnpj: '12345678000100' }, authorization: { status: 'AUTHORIZED' } } });
    expect(request.mock.calls.some(call => /simulate-loan|list-rebates|request-authorization/.test(call[3]))).toBe(false);
  });
  it('exibe um cartão CLT e um FGTS sem banco no título', () => {
    const html = renderToStaticMarkup(<SimulationFlowSelectorModal isOpen onClose={() => {}} onSelectFlow={() => {}} happySimulationAccessEnabled />);
    expect(html.match(/Crédito do trabalhador/g)).toHaveLength(1);
    expect(html.match(/Antecipação FGTS/g)).toHaveLength(1);
    expect(html).not.toContain('btn-flow-happy-clt');
  });
  it('FGTS consulta três instituições, usa a chave real e não lê períodos como ofertas', async () => {
    configs();
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint, body: any) => {
      if (endpoint === '/nossa/v1/balance') return { success: true, status: 200, data: { key: `${body.service_type}-balance`, status: 'completed', eligible: true, data: { periods: [] } } };
      if (endpoint === '/nossa/v2/simulation') return { success: true, status: 200, data: [{ cod_produto: 200, cod_tabela: 'a', name: 'Tabela A' }, { cod_produto: 200, cod_tabela: 'b', name: 'Tabela B' }] };
      return { success: true, status: 200, data: { key: 'simulation-key', cod_tabela: 'b', disbursed_issue_amount: 2000, number_of_valid_installments: 4 } };
    });
    const result = await ProductSimulationService.run({} as any, 'tenant', 'FGTS', 'SIMULATE', input);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every(row => row.state === 'OFFER' && row.amount === 2000 && row.table === 'Tabela B')).toBe(true);
    expect(request.mock.calls.filter(call => call[3] === '/nossa/v1/simulation')).toHaveLength(3);
    for (const call of request.mock.calls.filter(call => call[3] === '/nossa/v1/simulation')) expect(call[4]).toMatchObject({ key: `${(call[4] as any).service_type}-balance`, eligibility: true, number_of_installments: 4 });
  });
  it('saldo FGTS pendente não dispara simulação', async () => {
    configs();
    const request = vi.spyOn(NossaFintechService, 'request').mockResolvedValue({ success: true, status: 200, data: { status: 'pending', key: 'pending' } });
    const result = await ProductSimulationService.run({} as any, 'tenant', 'FGTS', 'SIMULATE', input);
    expect(result.rows.every(row => row.state === 'PENDING' && row.amount === undefined)).toBe(true);
    expect(request.mock.calls.every(call => call[3] === '/nossa/v1/balance')).toBe(true);
  });
  it('CLT bloqueia consulta de margem antes da autorização e não envia SMS automaticamente', async () => {
    configs();
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint) => ({ success: true, status: 200, data: { success: true, data: endpoint.includes('banking') ? ['QITECH', 'UY3'] : { status: 'PENDING', authorization_link: 'https://example.com/authorization' } } }));
    const result = await ProductSimulationService.run({} as any, 'tenant', 'CLT', 'SIMULATE', { ...input, term: 0 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(row => row.state === 'PENDING')).toBe(true);
    expect(request.mock.calls.some(call => call[3].includes('request-authorization') || call[3].includes('get-margin'))).toBe(false);
  });
  it('CLT autorizado consulta todas as bancarizadoras e não duplica códigos de tabelas', async () => {
    configs();
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, _m, endpoint) => {
      const data = endpoint.includes('banking') ? ['QITECH', 'UY3'] : endpoint.includes('check-authorization') ? { status: 'AUTHORIZED' }
        : endpoint.includes('get-margin') ? { margin_key: 'margin', can_continue: true, available_balance:600 }
          : endpoint.includes('list-rebates') ? [{ cod_tabela: 'a', name: 'Tabela A', number_of_installments: 24 }, { cod_tabela: 'a', number_of_installments: 12 }]
            : { simulation_key: 'simulation', disbursement_amount: 5000, num_periods: 24, schedule: [{ payment: 500 }], interest_rate: 0.02 };
      return { success: true, status: 200, data: { success: true, data } };
    });
    const result = await ProductSimulationService.run({} as any, 'tenant', 'CLT', 'SIMULATE', { ...input, term: 0, employerDocument: '12345678000100' });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(row => row.state === 'OFFER' && row.amount === 5000 && row.rate === 2)).toBe(true);
    expect(request.mock.calls.filter(call => call[3].includes('simulate-loan'))).toHaveLength(2);
  });
  it('FINANTO não participa da operação CLT, mesmo com configuração habilitada',async()=>{
    configs();const api=vi.spyOn(FinantoService,'request');const result=await ProductSimulationService.run({} as any,'tenant','CLT','SIMULATE',input,undefined,['finanto']);expect(result.rows).toHaveLength(0);expect(api).not.toHaveBeenCalled();
  });
});
