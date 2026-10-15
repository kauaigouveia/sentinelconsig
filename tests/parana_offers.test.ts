import { describe, expect, it } from 'vitest';
import { paranaNovoOffers } from '../src/lib/paranaOffers';
import { inssSimulationDraft } from '../server/services/inssSimulationDraft';
const id = '11111111-2222-4333-8444-555555555555';
const offer = { oportunidadeId: id, dataType: 'OfertaNovoInss', tipoOperacao: 'Novo', tipoProduto: 'Consignado', validadeOferta: '2099-01-01T00:00:00Z', valorLiberadoParaOCliente: 2000, valorDaParcela: 60, taxaCLMensal: 1.85, quantidadeDeParcelas: 108 };
const payload = (principal: any, secundarias: any[] = []) => ({ oportunidades: [{ ofertas: [{ principal, secundarias, beneficio: { matricula: '0000000001', especie: 41 }, dadosBancarios: { conta: 'private' } }] }] });
describe('Paraná Novo offer contract', () => {
  it('extracts primary and secondary Novo offers without card or personal bank data', () => {
    const offers = paranaNovoOffers(payload(offer, [{ ...offer, tipoProduto: 'ConsignadoComSeguro', seguro: { comSeguro: true } }, { ...offer, dataType: 'OfertaCartaoInss' }]));
    expect(offers).toHaveLength(2); expect(offers[1].insurance).toBe(true);
    expect(JSON.stringify(offers)).not.toContain('private');
  });
  it.each([{ valorLiberadoParaOCliente: -1 }, { valorLiberadoParaOCliente: 0 }, { validadeOferta: '2020-01-01' }, { validadeOferta: 'invalid' }, { quantidadeDeParcelas: 0 }, { valorDaParcela: null }])('excludes invalid offers %j', change => {
    expect(paranaNovoOffers(payload({ ...offer, ...change }))).toEqual([]);
  });
  it('preserves source, insurance and expiry in the existing simulation draft; rejects expired or wrong operations', () => {
    const body = { operationType: 'NEW', customerData: { birthDate: '1980-01-01', benefitNumber: '0000000001', benefitType: 41 }, selectedCondition: { provider: 'Paraná Banco', tableId: id, tableName: 'Novo', amount: 2000, installment: 60, term: 108, rate: 1.85, promoterId: 'demo', environment: 'homologation', expiresAt: offer.validadeOferta, hasInsurance: true } };
    expect(inssSimulationDraft(body)).toMatchObject({ customerData: { hasInsurance: true }, selectedCondition: { promoterId: 'demo', environment: 'homologation', expiresAt: offer.validadeOferta } });
    expect(() => inssSimulationDraft({ ...body, operationType: 'PORT' })).toThrow();
    expect(() => inssSimulationDraft({ ...body, selectedCondition: { ...body.selectedCondition, expiresAt: '2020-01-01' } })).toThrow();
  });
});
