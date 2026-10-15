import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParanaCltService as Clt } from '../server/services/paranaCltService';
import { ParanaBankService as Bank } from '../server/services/paranaBankService';
const id = '11111111-2222-4333-8444-555555555555';
const cpf = '52998224725';
const config: any = { environment: 'homologation', enabled: true, clientId: 'fake-id', clientSecret: 'fake-secret', bankId: 'demo', promoterCode: 'demo' };
const db: any = { promoter: { findMany: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' ? [{ id: 'promoter-a', name: 'Promotora fictícia' }] : []) } };
const limits = { tipoCondicao: 'SemSeguro', taxaMinima: 5, taxaMaxima: 7, valorMinimoDaParcela: 100, valorMaximoDaParcela: 1000, quantidadeMinimaDeParcelas: 6, quantidadeMaximaDeParcelas: 24, valorMinimoLiberado: 1000, valorMaximoLiberado: 20000 };
const oldSecret = process.env.JWT_SECRET;
beforeEach(() => { process.env.JWT_SECRET = 'fictional-clt-test-key'; vi.spyOn(Bank, 'config').mockImplementation(async (_db, tenant) => ({ ...config, enabled: tenant === 'tenant-a' })); vi.spyOn(Bank, 'token').mockResolvedValue('fictional-token'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
async function eligible() {
  const request = vi.spyOn(Clt, 'request').mockResolvedValue({ id });
  const pending = await Clt.start(db, 'tenant-a', 'promoter-a', { cpf }, 'eligibility');
  request.mockResolvedValue({ cpf, status: 'Concluido', produtos: [{ produto: 'CreditoTrabalhador', vinculos: [{ elegivel: true, matricula: '1234', numeroInscricaoEmpregador: '12345678', condicoes: [limits] }, { elegivel: false, condicoes: [limits] }] }] });
  const result = await Clt.assessment(db, 'tenant-a', pending.receipt);
  return { request, receipt: result.choices[0].receipt, pending, result };
}
describe('Paraná Crédito Trabalhador — mocked bank only', () => {
  it('uses root CLT paths, OAuth headers and split phone, with SMS disabled', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({ status: 'Solicitado', linkConsentimento: 'https://example.test/consent' }), { status: 202 })); vi.stubGlobal('fetch', mock);
    expect(await Clt.start(db, 'tenant-a', 'promoter-a', { cpf, name: 'Cliente Ficticio', phone: '11999999999' }, 'consent')).toMatchObject({ status: 'Solicitado', link: 'https://example.test/consent' });
    const call: any = mock.mock.calls[0]; expect(call[0]).toBe('https://api-marketplace-hom.paranabanco.com.br/v1/consentimentos');
    expect(call[1].headers).toMatchObject({ Authorization: 'Bearer fictional-token', 'x-client-id': 'fake-id' });
    expect(JSON.parse(call[1].body)).toEqual({ produto: 'CreditoTrabalhador', cpf, nome: 'Cliente Ficticio', ddd: '11', telefone: '999999999', parametros: { origem: 'Link', enviarSms: false } });
    await expect(Clt.request(db, 'tenant-a', 'promoter-a', 'POST', '/v1/propostas', {})).rejects.toThrow('não permitida');
  });
  it('keeps reported consent status and does not invent approval', async () => {
    vi.spyOn(Clt, 'request').mockResolvedValue({ cpf, consentimentos: [{ produto: 'CreditoTrabalhador', status: 'Solicitado' }] });
    const result = await Clt.start(db, 'tenant-a', 'promoter-a', { cpf }, 'status');
    expect(result.statuses?.[0].status).toBe('Solicitado'); expect(result).not.toHaveProperty('approved');
  });
  it('binds eligibility to tenant, connection, CPF and expiry, accepting only completed eligible employments', async () => {
    const { receipt, pending, result, request } = await eligible(); expect(result.choices).toHaveLength(1); expect(receipt).not.toContain(cpf);
    await expect(Clt.readContext(db, 'tenant-b', receipt, 'eligible')).rejects.toThrow('outra empresa');
    await expect(Clt.readContext(db, 'tenant-a', receipt + 'tampered', 'eligible')).rejects.toThrow();
    request.mockResolvedValue({ cpf, status: 'EmProcessamento' }); expect((await Clt.assessment(db, 'tenant-a', pending.receipt)).choices).toEqual([]);
    request.mockResolvedValue({ cpf: '11111111111', status: 'Concluido' }); await expect(Clt.assessment(db, 'tenant-a', pending.receipt)).rejects.toThrow('diverge');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000); await expect(Clt.readContext(db, 'tenant-a', receipt, 'eligible')).rejects.toThrow('vencida');
  });
  it('validates bank limits and sends either installment or amount with required margin', async () => {
    const { receipt, request } = await eligible();
    const response = { cpf, simulacoes: [{ produto: 'CreditoTrabalhador', tipoDaOperacao: 'Novo', codigoDaSimulacao: id, valorLiberadoDaOperacao: 5000, valorDaParcela: 300, totalDeParcelas: 24, taxaCLMensal: 5 }], erros: [{ codigo: null, mensagem: null }] };
    request.mockResolvedValue(response);
    const input = { receipt, mode: 'INSTALLMENT', term: 24, rate: 5, value: 300, rule: 'DEMO-1', insurance: false };
    expect((await Clt.simulate(db, 'tenant-a', input)).offers[0].amount).toBe(5000);
    expect(request.mock.calls.at(-1)?.[5]).toMatchObject({ produtos: [{ valorDaParcela: 300, codigoDaRegra: 'DEMO-1' }] });
    await expect(Clt.simulate(db, 'tenant-a', { ...input, rate: 8 })).rejects.toThrow('limites');
    await expect(Clt.simulate(db, 'tenant-a', { ...input, mode: 'AMOUNT', value: 5000 })).rejects.toThrow('margem');
    await Clt.simulate(db, 'tenant-a', { ...input, mode: 'AMOUNT', value: 5000, margin: 300 });
    const payload: any = request.mock.calls.at(-1)?.[5]; expect(payload.produtos[0]).toMatchObject({ valorSolicitado: 5000, margemDisponivel: 300 }); expect(payload.produtos[0]).not.toHaveProperty('valorDaParcela');
    request.mockResolvedValue({ ...response, simulacoes: [{ ...response.simulacoes[0], valorLiberadoDaOperacao: -1 }] }); expect((await Clt.simulate(db, 'tenant-a', input)).offers).toEqual([]);
  });
});
