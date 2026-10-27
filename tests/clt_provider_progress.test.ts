import { afterEach, expect, it, vi } from 'vitest';
import { ProductSimulationService } from '../server/services/productSimulationService';
import { NossaFintechService } from '../server/services/nossaFintechService';
afterEach(() => vi.restoreAllMocks());
it('publishes an offer before another institution of the same integration finishes authorization', async () => {
  let release!: () => void;
  const slow = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(NossaFintechService, 'getConfig').mockResolvedValue({ enabled: true, isConfigured: true } as any);
  vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_db, _tenant, _method, path, body: any) => {
    let data: any;
    if (path.endsWith('banking-institutions')) data = ['qi', 'synthetic-second-bank'];
    else if (path.endsWith('check-authorization')) { if (body.service_type === 'synthetic-second-bank') { await slow; data = { status: 'WAITING' }; } else data = { status: 'AUTHORIZED' }; }
    else if (path.endsWith('check-employee-enrollment')) data = [{ employer_cnpj: '12345678000100' }];
    else if (path.endsWith('get-margin')) data = { margin_key: 'synthetic-margin', available_balance: 1900, can_continue: true };
    else if (path.includes('list-rebates')) data = [{ cod_tabela: 'synthetic-table', number_of_installments: 24 }];
    else if (path.endsWith('simulate-loan')) data = { disbursement_amount: 12000, num_periods: 24, schedule: [{ payment: 1423.98 }], simulation_key: 'synthetic-simulation' };
    else throw Error('Unexpected provider operation');
    return { success: true, status: 200, data } as any;
  });
  const updates: any[] = [];
  const execution = ProductSimulationService.run({} as any, 'tenant-synthetic', 'CLT', 'SIMULATE', { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', term: 24, value: 1423.98, mode: 'Payment', eligibility: true }, async rows => { updates.push(rows.map(row => ({ ...row }))); }, ['nossa']);
  await vi.waitFor(() => expect(updates.some(rows => rows.some((row: any) => row.state === 'OFFER' && row.institution === 'qi'))).toBe(true));
  expect(updates.at(-1).some((row: any) => row.institution === 'synthetic-second-bank')).toBe(false);
  release();
  const result = await execution;
  expect(result.rows.some(row => row.state === 'OFFER')).toBe(true);
  expect(result.rows.some(row => row.institution === 'synthetic-second-bank' && row.outcome === 'AUTHORIZATION_REQUIRED')).toBe(true);
});
