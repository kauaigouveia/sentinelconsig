/** Only documented Novo INSS offers; never expose the customer's bank account or card products. */
export function paranaNovoOffers(payload: any, now = Date.now()) {
  const offers: { id: string; benefit: string; species: number; amount: number; installment: number; term: number; rate: number; contractAmount: number | null; cetMonthly: number | null; cetAnnual: number | null; insurance: boolean; expiresAt: string }[] = [];
  const positive = (value: unknown) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
  for (const group of payload.oportunidades || []) for (const entry of group.ofertas || []) {
    for (const item of [entry.principal, ...(Array.isArray(entry.secundarias) ? entry.secundarias : [])]) {
      if (!item || item.dataType !== 'OfertaNovoInss' || !['Novo', 1].includes(item.tipoOperacao) || !['Consignado', 'ConsignadoComSeguro', 1, 2].includes(item.tipoProduto)) continue;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.oportunidadeId || '')) continue;
      const expiry = Date.parse(item.validadeOferta);
      if (!Number.isFinite(expiry) || expiry <= now || !positive(item.valorLiberadoParaOCliente) || !positive(item.valorDaParcela) || !positive(item.taxaCLMensal) || !Number.isInteger(item.quantidadeDeParcelas) || item.quantidadeDeParcelas < 1 || item.quantidadeDeParcelas > 108) continue;
      const benefit = String(entry.beneficio?.matricula || '').replace(/\D/g, '');
      if (!benefit || !Number.isInteger(entry.beneficio?.especie)) continue;
      offers.push({ id: item.oportunidadeId, benefit, species: entry.beneficio.especie, amount: Number(item.valorLiberadoParaOCliente), installment: Number(item.valorDaParcela), term: item.quantidadeDeParcelas, rate: Number(item.taxaCLMensal), contractAmount: positive(item.valorDaOperacao) ? Number(item.valorDaOperacao) : null, cetMonthly: positive(item.taxaCETMensal) ? Number(item.taxaCETMensal) : null, cetAnnual: positive(item.taxaCETAnual) ? Number(item.taxaCETAnual) : null, insurance: item.seguro?.comSeguro === true, expiresAt: item.validadeOferta });
    }
  }
  return offers;
}
export type ParanaNovoOffer = ReturnType<typeof paranaNovoOffers>[number];
