// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const fixture = vi.hoisted(() => ({ type: 'NOVO', save: vi.fn(async (data: any) => ({ ...data, id: 'fictional-proposal' })), rules: vi.fn(() => ({ valid: true, errors: [] })) }));
vi.mock('../src/services/storageService', () => ({ StorageService: {
  getProducts: () => [{ id: 'product', name: fixture.type, type: fixture.type, active: true }], getProductsForConvenio: () => [{ id: 'product', name: fixture.type, type: fixture.type, active: true }],
  getConvenios: () => [{ id: 'inss', name: 'INSS', active: true }], getBanks: () => [{ id: 'bank', name: 'Banco fictício', active: true }],
  getPromoters: () => [{ id: 'dg', name: 'Promotora fictícia', active: true }], getPromotersForBank: () => [{ id: 'dg', name: 'Promotora fictícia', active: true }],
  getPartners: () => [{ id: 'partner', fullName: 'Parceiro fictício', login: 'TEST', active: true }], getCurrentTenantId: () => 'fictional-tenant',
  lookupClientAndPendingData: () => ({ client: null, pendingData: null }), isBankPromoterAllowed: () => true, isProductCompatibleWithConvenio: () => true,
  validateProposalAgainstRules: fixture.rules, getOrCreateClientAsync: async () => ({ id: 'client' }), getProposalsByClientId: () => [], createProposalAsync: fixture.save,
} }));
vi.mock('../src/components/common/PartnerSearchSelect', () => ({ PartnerSearchSelect: () => <div>Parceiro fictício</div> }));
import { NewProductionModal } from '../src/components/production/NewProductionModal';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fixture.save.mockClear(); fixture.rules.mockClear(); });
describe('manual proposal term and installment (mocked services)', () => {
  it.each(['NOVO', 'PORTABILIDADE'])('sends the selected term and installment for %s', async type => {
    fixture.type = type;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url !== '/api/partners') throw new Error('Network forbidden'); return { ok: true, json: async () => [] }; }));
    render(<NewProductionModal isOpen onClose={() => {}} onSuccess={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('000.000.000-00 ou 00000000000'), { target: { value: '12345678909' } });
    fireEvent.change(screen.getByPlaceholderText('Ex: MARIA JOSE ALEXANDRE'), { target: { value: 'Cliente fictício' } });
    fireEvent.change(screen.getByPlaceholderText('833085808 ou UUID'), { target: { value: 'TEST-ADE' } });
    fireEvent.change(screen.getByLabelText('Prazo da proposta 1 (meses)'), { target: { value: '108' } });
    fireEvent.change(screen.getByLabelText('Valor da parcela da proposta 1'), { target: { value: '227,09' } });
    fireEvent.click(screen.getByRole('button', { name: 'SALVAR TODAS AS ADEs' }));
    await waitFor(() => expect(fixture.save).toHaveBeenCalledTimes(1));
    expect(fixture.save.mock.calls[0][0]).toMatchObject({ installmentsCount: 108, installmentValue: 227.09 });
    expect(fixture.rules).toHaveBeenCalledWith(expect.objectContaining({ installmentsCount: 108 }));
  });
});
