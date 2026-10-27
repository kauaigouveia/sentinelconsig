import { V8CltPilot } from '../server/services/v8CltPilot';
import { journeyDatabase } from './helpers/cltJourneyDatabase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../server/logger.js', () => ({ logger: { warn: vi.fn() } }));
import { logger } from '../server/logger.js';
import { V8BankService } from '../server/services/v8BankService';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';
import { ProductSimulationService } from '../server/services/productSimulationService';
import { FactaBankService } from '../server/services/factaBankService';
import { FactaSimulationService } from '../server/services/factaSimulationService';
import { NossaFintechService } from '../server/services/nossaFintechService';
import { FinantoService } from '../server/services/finantoService';
import { cltOutcome, cltPublicMessage } from '../src/lib/cltSimulationOutcome';

const consultId = '00000000-0000-4000-8000-000000000001', secondId = '00000000-0000-4000-8000-000000000002';
const configId = '00000000-0000-4000-8000-000000000003', simulationId = '00000000-0000-4000-8000-000000000004';
const input = { cpf: '00000000000', name: 'Pessoa sintética', phone: '11999999999', employerDocument: '12345678000100', factaRegistration: '000FACTA01', value: 1423.98, term: 24, mode: 'Payment' as const, eligibility: true };
const consultation = { id: consultId, documentNumber: input.cpf, status: 'SUCCESS', name: input.name, availableMarginValue: '1900.00' };
const config = { environment: 'production' as const, enabled: true, cltEnabled: true, fgtsEnabled: false, username: 'synthetic-user', password: 'synthetic-secret', clientId: 'synthetic-client', audience: 'synthetic-audience' };
const offer = { id_simulation: simulationId, number_of_installments: 24, disbursed_issue_amount: 12000, installment_value: 1423.98, issue_amount: 13000 };
let consultations: any[], tables: any[], response: any, db: any, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv('JWT_SECRET', 'synthetic-v8-consult-reservation-key');
  vi.spyOn(V8CltPilot, 'authorize').mockResolvedValue({ allowed: true, tenantId: 'tenant-a', userId: 'synthetic-pilot' });
  // Contract fixtures exercise dormant code under a mocked policy, never bank homologation.
  vi.spyOn(V8CltSimulationService, 'canSimulate').mockReturnValue(true);
  vi.clearAllMocks(); consultations = [{ ...consultation }]; tables = [{ id: configId, slug: 'CLT sintético', number_of_installments: ['24'] }]; response = { ...offer };
  const state = journeyDatabase();
  db = { ...state, systemConfig: { ...state.systemConfig, findMany: vi.fn(async (query: any) => query.where.tenantId === 'tenant-a' ? [{ configKey: 'integration:v8:promoter-a:config' }] : []) } };
  vi.spyOn(V8BankService, 'config').mockImplementation(async (_db, tenant, promoter) => { if (tenant !== 'tenant-a' || promoter !== 'promoter-a') throw Error('Invalid scope'); return config; });
  vi.spyOn(V8BankService, 'token').mockResolvedValue({ token: 'synthetic-token', config });
  fetchMock = vi.fn(async (target: any, options?: any) => {
    const url = new URL(String(target));
    if (url.hostname !== 'bff.v8sistema.com') throw Error('Unexpected destination');
    if (url.pathname.endsWith('/consult')) return new Response(JSON.stringify({ pages: { hasNext: false }, data: consultations }));
    if (url.pathname.endsWith('/configs')) return new Response(JSON.stringify({ configs: tables }));
    if (url.pathname.endsWith('/simulation') && options.method === 'POST') return new Response(JSON.stringify(response));
    throw Error('Unapproved provider request');
  }); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const run = (extra: any = {}, action: 'REFRESH' | 'SIMULATE' | 'AUTHORIZE' = 'SIMULATE', tenant = 'tenant-a') => V8CltSimulationService.run(db, tenant, action, { ...input, ...extra });

describe('V8 CLT adapter with mocked HTTP; unresolved contract choices are not homologated', () => {
  it.each([
    ['WAITING_CONSENT', 'AUTHORIZATION_REQUIRED', 'consentimento'], ['CONSENT_APPROVED', 'PENDING', 'processamento'],
    ['WAITING_CONSULT', 'PENDING', 'base competente'], ['WAITING_CREDIT_ANALYSIS', 'PENDING', 'análise'],
    ['REJECTED', 'INELIGIBLE', 'vínculo'], ['FAILED', 'TECHNICAL_ERROR', 'falhou'],
  ])('preserves consultation identity and correctly handles %s without simulation', async (status, outcome, message) => {
    consultations[0] = { ...consultation, status, ...(status === 'REJECTED' ? { description: 'Trabalhador não possui vínculo empregatício ativo para realização de consulta.' } : {}) };
    const rows = await run({}, 'REFRESH'); expect(rows[0].outcome).toBe(outcome); expect(rows[0].message).toContain(message);
    expect(rows[0].data).toMatchObject({ v8: { consultId, promoterId: 'promoter-a', status } });
    expect(fetchMock.mock.calls.some(([, opts]) => opts.method === 'POST')).toBe(false);
  });
  it('reads configurations dynamically, preserving the raw rate rather than inferring a percentage', async () => {
    tables[0] = { id: configId, slug: 'Tabela sintética sem seguro', number_of_installments: [6, 8, 10, 12, 18, 24, 36, 38, 46], monthly_interest_rate: '0.049800' };
    const rows = await run({}, 'REFRESH');
    expect(rows[0].data).toMatchObject({ v8: { configurations: [{ id: configId, name: 'Tabela sintética sem seguro', terms: [6, 8, 10, 12, 18, 24, 36, 38, 46], rawMonthlyRate: '0.049800' }] } });
    expect(rows[0].rate).toBeUndefined();
  });
  it('creates a consultation with the documented borrower/signatory fields, without accepting terms', async () => {
    const extra = { v8BirthDate: '1980-01-02', v8Gender: 'female', v8Email: 'synthetic@example.invalid' };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: consultId })));
    const rows = await V8CltSimulationService.run(db, 'tenant-a', 'CREATE_CONSULT', { ...input, ...extra, v8Gender: 'female' });
    expect(rows[0]).toMatchObject({ outcome: 'AUTHORIZATION_REQUIRED', data: { v8: { consultId, status: 'WAITING_CONSENT' } } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ borrowerDocumentNumber: input.cpf, gender: 'female', birthDate: extra.v8BirthDate, signerName: input.name, signerEmail: extra.v8Email, signerPhone: { phoneNumber: '999999999', areaCode: '11', countryCode: '55' }, provider: 'QI' });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(String(fetchMock.mock.calls[0][0])).not.toContain('authorize');
    const repeated = await V8CltSimulationService.run(db, 'tenant-a', 'CREATE_CONSULT', { ...input, ...extra, name: 'Nome sintético corrigido', v8Gender: 'female' });
    expect(repeated[0].data).toMatchObject({ v8: { consultId } }); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(db.rows)).not.toContain(extra.v8Email);
    await expect(V8CltSimulationService.request(db, 'tenant-a', 'promoter-a', `/private-consignment/consult/${consultId}/authorize`, {})).rejects.toThrow();
  });
  it('reserves consultation creation across simultaneous requests and never replays an uncertain POST', async () => {
    const data = { ...input, v8BirthDate: '1980-01-02', v8Gender: 'female' as const, v8Email: 'synthetic@example.invalid' };
    fetchMock.mockRejectedValue(Error('synthetic timeout'));
    const results = await Promise.all([V8CltSimulationService.run(db, 'tenant-a', 'CREATE_CONSULT', data), V8CltSimulationService.run(db, 'tenant-a', 'CREATE_CONSULT', data)]);
    expect(results.flat().every(r => r.outcome === 'TECHNICAL_ERROR')).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
    await V8CltSimulationService.run(db, 'tenant-a', 'CREATE_CONSULT', data); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not invent the additional data required to create a consultation', async () => {
    const rows = await V8CltSimulationService.run(db, 'tenant-a', 'CREATE_CONSULT', input);
    expect(rows[0].outcome).toBe('MISSING_DATA'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('derives a payment only from SUCCESS margin and sends exactly one financial field', () => {
    const config = { id: configId, number_of_installments: [12] };
    const body = V8CltSimulationService.simulationPayload({ ...consultation, availableMarginValue: '300.009' }, config, 12, { ...input, value: 0, autoConditions: true });
    expect(body).toEqual({ consult_id: consultId, config_id: configId, installment_face_value: 300, number_of_installments: 12, provider: 'QI' });
    expect(() => V8CltSimulationService.simulationPayload({ ...consultation, status: 'REJECTED' }, config, 12, input)).toThrow();
    expect(() => V8CltSimulationService.simulationPayload(consultation, config, 46, input)).toThrow();
  });
  it('sends only the selected financial field, omitting the inactive field without FACTA fields', async () => {
    const rows = await run();
    expect(rows[0]).toMatchObject({ state: 'OFFER', amount: 12000, contractAmount: 13000, installment: 1423.98, simulationId });
    const call = fetchMock.mock.calls.find(([, options]) => options.method === 'POST')!;
    expect(JSON.parse(call[1].body)).toEqual({ consult_id: consultId, config_id: configId, installment_face_value: 1423.98, number_of_installments: 24, provider: 'QI' });
    expect(call[1].headers.Authorization).toBe('Bearer synthetic-token');
    expect(rows[0].rate).toBeUndefined();
  });
  it('uses the disbursement field in Liquid mode, separately from margin', async () => {
    await run({ mode: 'Liquid', value: 5000 });
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
    expect(body).toMatchObject({ disbursed_amount: 5000 }); expect(body).not.toHaveProperty('installment_face_value');
  });
  it.each([1.234, '1.234', 1234.56789, '1234.56789'])('preserves transport decimal %s without BRL magnitude conversion', async amount => {
    response = { ...offer, disbursed_issue_amount: amount, issue_amount: amount, installment_value: amount };
    const rows = await run();
    expect(rows[0]).toMatchObject({ state: 'OFFER', amount: Number(amount), contractAmount: Number(amount), installment: Number(amount) });
  });
  it('uses the decimal margin format shown by the official CLT webhook', async () => {
    consultations[0].availableMarginValue = '350.00';
    expect((await run({}, 'REFRESH'))[0]).toMatchObject({ state: 'DATA', data: { margin: { available_balance: 350 } } });
  });
  it('keeps the unambiguous comma-formatted legacy compatibility case separate from contract fixtures', async () => {
    consultations[0].availableMarginValue = '1.900,00';
    expect((await run({}, 'REFRESH'))[0]).toMatchObject({ data: { margin: { available_balance: 1900 } } });
  });
  it('does not infer rate units, alter monetary scale or add an undocumented configs query', async () => {
    tables[0].monthly_interest_rate = '1.8';
    response = { ...offer, monthly_interest_rate: 0.018 };
    const rows = await run();
    expect(rows[0].rate).toBeUndefined();
    const configsRequest = fetchMock.mock.calls.find(([url]) => String(url).includes('/simulation/configs'))!;
    expect(String(configsRequest[0])).toBe('https://bff.v8sistema.com/private-consignment/simulation/configs');
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).installment_face_value).toBe(1423.98);
  });
  it('returns a selectable consultation with decimal margin but no invented employer/matricula', async () => {
    const rows = await run({}, 'REFRESH');
    expect(rows[0]).toMatchObject({ state: 'DATA', data: { v8: { consultId, promoterId: 'promoter-a' }, margin: { available_balance: 1900 } } });
    expect((rows[0].data as any).employment).toBeUndefined(); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('requires explicit selection for multiple consultations', async () => {
    consultations.push({ ...consultation, id: secondId });
    expect((await run())[0].outcome).toBe('MISSING_DATA'); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('uses only the selected consultation of multiple records', async () => {
    consultations.push({ ...consultation, id: secondId });
    await run({ v8ConsultId: secondId, v8PromoterId: 'promoter-a' });
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).consult_id).toBe(secondId);
  });
  it('rejects stale or foreign consultation ids without a simulation POST', async () => {
    expect((await run({ v8ConsultId: secondId, v8PromoterId: 'promoter-a' }))[0].outcome).toBe('MISSING_DATA');
    expect(fetchMock.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  });
  it('rejects a selected consultation without its promoter', async () => {
    expect((await run({ v8ConsultId: consultId }))[0].outcome).toBe('MISSING_DATA'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['WAITING_CONSENT', 'CONSENT_APPROVED', 'WAITING_CONSULT', 'WAITING_CREDIT_ANALYSIS'])('does not simulate or silently authorize %s', async status => {
    consultations[0].status = status;
    expect((await run())[0].outcome).toBe(status === 'WAITING_CONSENT' ? 'AUTHORIZATION_REQUIRED' : 'PENDING');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([['REJECTED', 'INELIGIBLE'], ['FAILED', 'TECHNICAL_ERROR']])('classifies %s', async (status, expected) => {
    consultations[0].status = status; expect((await run())[0].outcome).toBe(expected); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([['0,00', 'INELIGIBLE'], [undefined, 'MISSING_DATA'], ['inválido', 'MISSING_DATA']])('classifies margin %s without fabricating values', async (margin, expected) => {
    consultations[0].availableMarginValue = margin; expect((await run())[0].outcome).toBe(expected);
  });
  it('never substitutes available margin for the requested installment', async () => {
    consultations[0].availableMarginValue = '800,00';
    expect((await run())[0].outcome).toBe('INELIGIBLE'); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('reports an empty consultation list as authorization required', async () => {
    consultations = []; expect((await run())[0].outcome).toBe('AUTHORIZATION_REQUIRED');
  });
  it('preserves pending status for an empty configuration list', async () => {
    tables = []; expect((await run())[0].outcome).toBe('PENDING'); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not accept another CPF returned by search', async () => {
    consultations[0].documentNumber = '11111111111'; expect((await run())[0].outcome).toBe('AUTHORIZATION_REQUIRED'); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('does not use connections from another tenant', async () => {
    expect(await run({}, 'SIMULATE', 'tenant-b')).toEqual([]); expect(fetchMock).not.toHaveBeenCalled();
    expect(db.systemConfig.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-b' }) }));
  });
  it('rejects a promoter that is not available in the current tenant', async () => {
    expect((await run({ v8ConsultId: consultId, v8PromoterId: 'foreign' }))[0].outcome).toBe('MISSING_DATA');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports CLT unavailable if the enabled connection has no CLT entitlement flag', async () => {
    vi.mocked(V8BankService.config).mockResolvedValue({ ...config, cltEnabled: false });
    expect((await run())[0].outcome).toBe('UNSUPPORTED'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports incomplete credentials before authentication or consultation', async () => {
    vi.mocked(V8BankService.config).mockResolvedValue({ ...config, password: '' });
    expect((await run())[0].outcome).toBe('MISSING_DATA'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not replace a missing homologation URL with production', async () => {
    vi.mocked(V8BankService.config).mockResolvedValue({ ...config, environment: 'homologation' });
    expect((await run())[0].outcome).toBe('UNSUPPORTED'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('never registers client consent on behalf of the operator', async () => {
    expect((await run({}, 'AUTHORIZE'))[0].outcome).toBe('AUTHORIZATION_REQUIRED'); expect(fetchMock).not.toHaveBeenCalled();
    await expect(V8CltSimulationService.request(db, 'tenant-a', 'promoter-a', '/private-consignment/consult/id/authorize', {})).rejects.toThrow();
  });
  it('redacts permission denial payloads and logs only diagnostic codes', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ type: 'permission_denied', access_token: 'DO-NOT-EXPOSE', documentNumber: input.cpf }), { status: 400 }));
    const rows = await run(); expect(rows[0].message).toContain('permissões CLT');
    expect(JSON.stringify(rows)).not.toContain('DO-NOT-EXPOSE');
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(input.cpf);
  });
  it.each([null, {}, { ...offer, number_of_installments: 36 }, { ...offer, disbursed_issue_amount: 0 }])('rejects an invalid or empty simulation response', async value => {
    response = value; expect((await run())[0].outcome).toBe('TECHNICAL_ERROR');
  });
  it('handles pagination without using the first record from another CPF', async () => {
    const original = fetchMock.getMockImplementation()! as (...args: any[]) => Promise<Response>;
    fetchMock.mockImplementation(async (target: any, options: any) => {
      const url = new URL(String(target));
      if (url.pathname.endsWith('/consult') && url.searchParams.get('page') === '1') return new Response(JSON.stringify({ data: [{ ...consultation, documentNumber: '11111111111' }], pages: { hasNext: true } }));
      return original(target, options);
    });
    expect((await run())[0].state).toBe('OFFER'); expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('adds V8 to the actual shared dispatcher, preserving a FACTA offer when V8 fails', async () => {
    vi.spyOn(NossaFintechService, 'getConfig').mockResolvedValue({ enabled: false } as any);
    vi.spyOn(FinantoService, 'getConfig').mockResolvedValue({ enabled: false } as any);
    vi.spyOn(FactaBankService, 'getTenantConfig').mockResolvedValue({ isConfigured: true, simulationEnabled: true } as any);
    vi.spyOn(FactaSimulationService, 'product').mockResolvedValue([{ provider: 'FACTA', institution: 'FACTA', state: 'OFFER', amount: 1000 }]);
    fetchMock.mockRejectedValue(Error('network'));
    const result = await ProductSimulationService.run(db, 'tenant-a', 'CLT', 'SIMULATE', input);
    expect(result.rows).toContainEqual(expect.objectContaining({ provider: 'FACTA', state: 'OFFER' }));
    expect(result.rows).toContainEqual(expect.objectContaining({ provider: 'V8 DIGITAL', outcome: 'TECHNICAL_ERROR' }));
  });
  it('sanitizes partial callback results as well as the final response', async () => {
    vi.spyOn(NossaFintechService, 'getConfig').mockResolvedValue({ enabled: false } as any);
    vi.spyOn(FinantoService, 'getConfig').mockResolvedValue({ enabled: false } as any);
    vi.spyOn(FactaBankService, 'getTenantConfig').mockResolvedValue({ isConfigured: true, simulationEnabled: true } as any);
    vi.spyOn(FactaSimulationService, 'product').mockRejectedValue(Error('Bearer do-not-show'));
    const snapshots: string[] = [];
    const result = await ProductSimulationService.run(db, 'tenant-a', 'CLT', 'SIMULATE', input, async rows => { snapshots.push(JSON.stringify(rows)); });
    expect(snapshots.some(snapshot => snapshot.includes('FACTA'))).toBe(true);
    expect(snapshots.every(snapshot => !snapshot.includes('do-not-show'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('do-not-show');
  });
  it('classifies result categories and removes raw secrets and HTML', () => {
    expect(cltOutcome({ state: 'ERROR', message: 'Informe a matrícula obrigatória' })).toBe('MISSING_DATA');
    expect(cltOutcome({ state: 'PENDING', message: 'Cliente não elegível' })).toBe('INELIGIBLE');
    expect(cltPublicMessage('<html>internal stack password=secret</html>')).not.toContain('secret');
    expect(cltPublicMessage('Bearer synthetic-token')).not.toContain('synthetic-token');
  });
  it('keeps actual encrypted configuration and OAuth credentials scoped by tenant and promoter', async () => {
    vi.mocked(V8BankService.config).mockRestore(); vi.mocked(V8BankService.token).mockRestore();
    vi.stubEnv('JWT_SECRET', 'synthetic-encryption-key-not-for-production');
    const values: any[] = [];
    const memory: any = {
      promoter: { findMany: vi.fn(async ({ where }: any) => ['a', 'b'].filter(id => where.tenantId === `tenant-${id}` && where.id === `promoter-${id}`).map(id => ({ id: `promoter-${id}`, name: `Synthetic ${id}` }))) },
      systemConfig: {
        findUnique: vi.fn(async ({ where }: any) => values.find(row => row.tenantId === where.tenantId_configKey.tenantId && row.configKey === where.tenantId_configKey.configKey) || null),
        upsert: vi.fn(async ({ create }: any) => { values.push(create); return create; }),
      },
      $transaction: async (fn: any) => fn(memory),
    };
    for (const id of ['a', 'b']) await V8BankService.save(memory, `tenant-${id}`, `promoter-${id}`, { ...config, username: `synthetic-${id}` });
    expect(values.every(row => !row.configValue.includes('synthetic-secret'))).toBe(true);
    fetchMock.mockImplementation(async (target: any) => {
      expect(String(target)).toBe('https://auth.v8sistema.com/oauth/token');
      return new Response(JSON.stringify({ access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 3600 }));
    });
    for (const id of ['a', 'b']) await V8BankService.token(memory, `tenant-${id}`, `promoter-${id}`, 'production', true);
    const forms = fetchMock.mock.calls.map(([, options]) => options.body as URLSearchParams);
    expect(forms.map(body => body.get('username'))).toEqual(['synthetic-a', 'synthetic-b']);
    expect(forms[0].get('grant_type')).toBe('password'); expect(forms[0].get('scope')).toBe('offline_access');
    await expect(V8BankService.config(memory, 'tenant-a', 'promoter-b')).rejects.toThrow('promotora ativa');
    const source = values.find(row => row.tenantId === 'tenant-a' && row.configKey.endsWith(':config'));
    values.find(row => row.tenantId === 'tenant-b' && row.configKey.endsWith(':config')).configValue = source.configValue;
    await expect(V8BankService.config(memory, 'tenant-b', 'promoter-b')).rejects.toThrow('credenciais V8');
  });
});

it('blocks every real V8 simulation entry point before OAuth or bank requests', async () => {
  vi.mocked(V8CltSimulationService.canSimulate).mockRestore();
  const rows = await V8CltSimulationService.run(db, 'tenant-a', 'SIMULATE', input);
  expect(rows[0].outcome).toBe('UNSUPPORTED'); expect(fetchMock).not.toHaveBeenCalled();
  expect(V8BankService.token).not.toHaveBeenCalled();
  await expect(V8CltSimulationService.request(db, 'tenant-a', 'promoter-a', '/private-consignment/simulation', {})).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
