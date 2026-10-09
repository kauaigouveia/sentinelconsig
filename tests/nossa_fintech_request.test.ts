import { afterEach, describe, expect, it, vi } from 'vitest';
import { NossaFintechService } from '../server/services/nossaFintechService';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  vi.spyOn(NossaFintechService, 'getConfig').mockResolvedValue({ enabled: true, isConfigured: true } as any);
  vi.spyOn(NossaFintechService as any, 'token').mockResolvedValue('fixture-token');
}
describe('Consulta de tabelas Nossa Fintech', () => {
  it('GET mantém query e nomes retornados, sem corpo nem Content-Type mesmo recebendo JSON vazio', async () => {
    setup();
    const tables = [{ cod_tabela: 'a', name: 'INSS NOVO INVALIDEZ' }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tables), { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    const endpoint = '/inss/v1/rebates_parceiro?op_type=NOVO&legal_rep=false';
    const result = await NossaFintechService.request({} as any, 'tenant', 'get', endpoint, {});
    expect(result.data).toEqual(tables); expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain(endpoint);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Content-Type');
  });
  it('a renovação de token continua sem corpo no GET', async () => {
    setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response('[]', { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    await NossaFintechService.request({} as any, 'tenant', 'GET', '/inss/v1/rebates_parceiro?op_type=NOVO', { stale: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) expect(init).not.toHaveProperty('body');
  });
  it('preserva JSON em chamadas POST', async () => {
    setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    await NossaFintechService.request({} as any, 'tenant', 'POST', '/inss/v1/simulation', { cod_produto: 200 });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ body: '{"cod_produto":200}', headers: { 'Content-Type': 'application/json' } });
  });
});
