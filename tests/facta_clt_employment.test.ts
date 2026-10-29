import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FactaSimulationService } from '../server/services/factaSimulationService';
import { FactaBankService } from '../server/services/factaBankService';
import { ProductSimulationService } from '../server/services/productSimulationService';
import { NossaFintechService } from '../server/services/nossaFintechService';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';

const prisma = {} as any;
const input = { cpf: '00000000000', name: 'Pessoa sintética', phone: '11999999999', employerDocument: '12345678000100', term: 24, value: 1423.98, mode: 'Payment' as const, eligibility: true };
const worker = { cpf: input.cpf, matricula: '00017000310042', numeroInscricaoEmpregador: input.employerDocument, nomeEmpregador: 'Empresa sintética', nome: input.name, elegivel: true, valorTotalVencimentos: '6000.00', valorMargemDisponivel: '1900.00', dataNascimento: '1980-01-02', dataAdmissao: '2019-01-02' };
const table = { codigoTabela: 'synthetic', tabela: 'Tabela sintética', prazo: 24, contrato: 22000, valor_liquido: 21000, parcela: 1423.98 };
beforeEach(() => {
  vi.spyOn(FactaBankService, 'getTenantConfig').mockResolvedValue({ isConfigured: true, simulationEnabled: true, baseUrl: FactaBankService.HOMOLOGATION_BASE_URL } as any);
  vi.spyOn(FactaBankService, 'getToken').mockResolvedValue('synthetic-token');
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('No real provider calls allowed'); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function bank(workers: any[], policy: any = { aprovado: '1' }) {
  return vi.spyOn(FactaSimulationService, 'request').mockImplementation(async (_p, _t, path, body) => {
    if (path.includes('autoriza-consulta')) return { dados_trabalhador: { dados: workers } };
    if (path.includes('operacoes')) return { tabelas: [{...table,parcela:body?.valor_parcela??table.parcela}] };
    return policy;
  });
}

describe('FACTA CLT employment selection, synthetic only', () => {
  it('rejects a payment above the official margin before requesting operations or credit policy',async()=>{
    const request=bank([{...worker,valorMargemDisponivel:'529.93'}]);
    const result=await FactaSimulationService.product(prisma,'tenant-a','CLT','SIMULATE',{...input,value:600});
    expect(result[0]).toMatchObject({outcome:'INELIGIBLE'});expect(request).toHaveBeenCalledOnce();
  });
  it('derives the automatic payment from the selected bank-returned margin, preserving exact registration', async () => {
    const request = bank([{ ...worker, valorMargemDisponivel: '300.009' }]);
    await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', { ...input, value: 0, term: 0, autoConditions: true, factaRegistration: worker.matricula });
    expect(request.mock.calls[1][3]).toMatchObject({ opcao_valor: 2, valor_parcela: 300 });
    expect(request.mock.calls[1][3]).not.toHaveProperty('prazo');
    expect(request.mock.calls[2][3]).toMatchObject({ matricula: worker.matricula, prazo: 24 });
  });
  it.each([undefined, '0', '-1', 'invalid'])('refuses automatic calculation without a valid returned margin %s', async margin => {
    const request = bank([{ ...worker, valorMargemDisponivel: margin }]);
    const rows = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', { ...input, value: 0, autoConditions: true });
    expect(request).toHaveBeenCalledOnce(); expect(rows[0].state).not.toBe('OFFER');
  });
  it.each(['001', 'A-01/B', '00017000310042', '1', 42])('preserves returned registration %s in policy', async matricula => {
    const request = bank([{ ...worker, matricula }]);
    const result = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', { ...input, factaRegistration: String(matricula) });
    expect(result[0].state).toBe('OFFER');
    expect(request.mock.calls[2][3]).toMatchObject({ matricula: String(matricula), valorEmprestimo: 22000 });
    expect(request.mock.calls[1][3]).toMatchObject({ opcao_valor: 2, valor_parcela: 1423.98, valor_renda: 6000 });
    // Manual v9 documents registration for policy, not for available operations.
    expect(request.mock.calls[1][3]).not.toHaveProperty('matricula');
  });
  it('keeps exact registration and margin in the refresh response without an index fallback', async () => {
    bank([worker]);
    const result = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'REFRESH', input);
    expect(result[0]).toMatchObject({ data: { employment: { work_registration: worker.matricula }, margin: { registration_number: worker.matricula, available_balance: 1900 } } });
  });
  it('does not replace requested installment with available margin', async () => {
    const request = bank([{ ...worker, valorMargemDisponivel: '800.00' }]);
    await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', {...input,value:200});
    expect(request.mock.calls[1][3]).toMatchObject({ opcao_valor: 2, valor_parcela: 200 });
    expect(request.mock.calls[2][3]).toMatchObject({ matricula: worker.matricula });
  });
  it('uses only the selected registration when the employer has multiple employments', async () => {
    const request = bank([{ ...worker, matricula: '1', valorTotalVencimentos: '1000' }, worker]);
    await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', { ...input, factaRegistration: worker.matricula });
    expect(request.mock.calls).toHaveLength(3);
    expect(request.mock.calls[1][3]).toMatchObject({ valor_renda: 6000 });
    expect(request.mock.calls[2][3]).toMatchObject({ matricula: worker.matricula });
  });
  it('matches both employer and registration, never a registration from another employer', async () => {
    const request = bank([worker, { ...worker, matricula: 'other', numeroInscricaoEmpregador: '87654321000199' }]);
    const result = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', { ...input, factaRegistration: 'other' });
    expect(result[0].message).toContain('não encontrado');
    expect(request).toHaveBeenCalledOnce();
  });
  it('requires a choice for ambiguous employments before operations or policy', async () => {
    const request = bank([worker, { ...worker, matricula: 'other' }]);
    const result = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', input);
    expect(result[0].message).toContain('múltiplos vínculos');
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([undefined, '', '   ', 9007199254740992])('rejects missing or unsafe registration %s without guessing', async matricula => {
    const request = bank([{ ...worker, matricula }]);
    const result = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', input);
    expect(result[0].message).toContain('matrícula válida');
    expect(request).toHaveBeenCalledOnce();
  });
  it('rejects a stale selection and does not silently switch to the only remaining employment', async () => {
    const request = bank([worker]);
    const result = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', { ...input, factaRegistration: 'removed' });
    expect(result[0].message).toContain('selecione novamente');
    expect(request).toHaveBeenCalledOnce();
  });
  it('reports an empty employment list specifically', async () => {
    const request = bank([]);
    const result = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', input);
    expect(result[0].message).toContain('Vínculo FACTA');
    expect(request).toHaveBeenCalledOnce();
  });
  it('preserves bank registration refusal without relabeling it as a margin problem', async () => {
    bank([worker], { aprovado: '0', mensagem: 'Informe a matrícula autorizada na consulta.' });
    const result = await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', input);
    expect(result[0]).toMatchObject({ state: 'PENDING', message: 'Informe a matrícula autorizada na consulta.' });
  });
  it('rejects policy from another registration, including stripped leading zeros', async () => {
    bank([worker], { aprovado: '1', matricula: worker.matricula.replace(/^0+/, '') });
    expect((await FactaSimulationService.product(prisma, 'tenant-a', 'CLT', 'SIMULATE', input))[0]).toMatchObject({ state: 'ERROR', message: expect.stringContaining('outro CPF ou vínculo') });
  });
  it('serializes the exact opaque identifier through the real request builder with mocked HTTP', async () => {
    const fetchMock = vi.fn(async (_target: any) => new Response(JSON.stringify({ aprovado: '1' })));
    vi.stubGlobal('fetch', fetchMock);
    await FactaSimulationService.request(prisma, 'tenant-a', '/consignado-trabalhador/analise-politica-credito', { matricula: '000A/01', valorEmprestimo: 22000 });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('matricula')).toBe('000A/01');
  });
  it('retains other providers when FACTA fails', async () => {
    vi.spyOn(NossaFintechService, 'getConfig').mockResolvedValue({ enabled: false } as any);
    vi.spyOn(V8CltSimulationService,'run').mockResolvedValue([{provider:'V8 DIGITAL',institution:'V8',state:'OFFER',amount:5000}]);
    vi.spyOn(FactaSimulationService, 'product').mockRejectedValue(Error('Matrícula FACTA recusada'));
    const result = await ProductSimulationService.run(prisma, 'tenant-a', 'CLT', 'SIMULATE', input);
    expect(result.rows.some(row => row.provider === 'V8 DIGITAL' && row.state === 'OFFER' && row.amount === 5000)).toBe(true);
    expect(result.rows).toContainEqual(expect.objectContaining({ provider: 'FACTA', state: 'ERROR', message: 'Matrícula FACTA recusada' }));
  });
});
