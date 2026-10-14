import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeFactaBaseUrl } from '../server/services/factaBaseUrl';
import { FactaBankService } from '../server/services/factaBankService';
import { factaFetch } from '../server/services/factaTransport';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('FACTA URL normalization (mocked gateway, no provider calls)', () => {
  it.each(['production', 'homologation'] as const)('normalizes the legacy proposal address in %s', environment => {
    expect(normalizeFactaBaseUrl('https://proposta.facta.com.br/sistemaPropostas/api', environment)).toBe(environment === 'production' ? 'https://webservice.facta.com.br' : 'https://webservice-homol.facta.com.br');
  });
  it('preserves official HTTPS roots', () => {
    expect(normalizeFactaBaseUrl(' https://webservice-homol.facta.com.br/ ', 'production')).toBe('https://webservice-homol.facta.com.br');
    expect(normalizeFactaBaseUrl('https://webservice.facta.com.br', 'homologation')).toBe('https://webservice.facta.com.br');
  });
  it.each(['http://webservice.facta.com.br', 'https://proposta.facta.com.br.evil.test/api', 'https://evil.test/proposta.facta.com.br', 'https://user:password@webservice.facta.com.br', 'https://webservice.facta.com.br:8443', 'https://webservice.facta.com.br?x=1'])('rejects unsafe URL %s', raw => {
    expect(() => normalizeFactaBaseUrl(raw, 'production')).toThrow();
  });
  it('normalizes the unsaved override before passing it to the unchanged gateway allowlist', async () => {
    vi.stubEnv('FACTA_GATEWAY_URL', 'https://gateway.example.test/facta'); vi.stubEnv('FACTA_GATEWAY_SECRET', 'fictional-secret');
    vi.spyOn(FactaBankService, 'getTenantConfig').mockResolvedValue({ promoterId: 'dg', username: 'fictional', password: 'fictional', enabled: true, environment: 'homologation', baseUrl: 'https://webservice-homol.facta.com.br' } as any);
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ erro: false, token: 'fictional-token-for-unit-test' })));
    vi.stubGlobal('fetch', request);
    const result = await FactaBankService.testConnection({} as any, 'fictional-url-regression', { baseUrl: 'https://proposta.facta.com.br/sistemaPropostas/api', environment: 'production' });
    expect(result).toMatchObject({ success: true, isHomologation: false });
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).url).toBe('https://webservice.facta.com.br/gera-token');
    expect(String(request.mock.calls[0][0])).toBe('https://gateway.example.test/facta');
    await expect(factaFetch('https://proposta.facta.com.br/sistemaPropostas/api/gera-token')).rejects.toThrow('Destino FACTA');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
