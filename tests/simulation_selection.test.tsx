import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationFlowSelectorModal } from '../src/components/simulation/SimulationFlowSelectorModal';
import { filterInssBenefitTypes, InssBenefitTypeSelect } from '../src/components/simulation/InssBenefitTypeSelect';
import { HappyBankService } from '../server/services/happyBankService';
import { HappyTokenManager } from '../server/services/happyTokenManager';
import { FinantoInssSimulationModal } from '../src/components/simulation/FinantoInssSimulationModal';

afterEach(() => vi.restoreAllMocks());

describe('Seleção de simulação e espécie', () => {
  it('usa cabeçalho do produto e botão de cálculo sem bancos ou contagem', () => {
    const html = renderToStaticMarkup(<FinantoInssSimulationModal isOpen operationCode="1" onClose={() => {}} partners={[]} onSuccess={() => {}} />);
    expect(html).toMatch(/<h2[^>]*>INSS Novo<\/h2>/);
    expect(html).toContain('Calcular simulação');
    expect(html).not.toContain('Calcular em');
    expect(html).not.toContain('enviados diretamente à FINANTO');
    expect(html).not.toContain('Criar simulação FINANTO');
  });
  it.each([[true, true], [true, false], [false, true]])('exibe um único Port/Refin e nomes genéricos com integrações %s/%s', (finantoEnabled, nossaFintechEnabled) => {
    const html = renderToStaticMarkup(<SimulationFlowSelectorModal isOpen onClose={() => {}} onSelectFlow={() => {}} finantoEnabled={finantoEnabled} nossaFintechEnabled={nossaFintechEnabled} happySimulationAccessEnabled={false} />);
    expect(html.match(/INSS Portabilidade \+ Refinanciamento/g)).toHaveLength(1);
    expect(html).not.toMatch(/>FINANTO<|Nossa Fintech|disponíveis da FINANTO/);
    expect(html).toContain('INSS Novo');
  });

  it('a busca por 4 mantém as alternativas 4, 41, 42 e não mistura espécie 84', () => {
    const codes = filterInssBenefitTypes('4').map(([code]) => code);
    expect(codes).toEqual(expect.arrayContaining([4, 40, 41, 42, 49]));
    expect(codes).not.toContain(84);
    expect(filterInssBenefitTypes('41').map(([code]) => code)).toEqual([41]);
    expect(filterInssBenefitTypes('aposentadoria').length).toBeGreaterThan(1);
    expect(filterInssBenefitTypes('LOAS').map(([code]) => code)).toEqual([87, 88]);
    expect(filterInssBenefitTypes('invalidez').map(([code]) => code)).toContain(32);
  });

  it('usa combobox próprio e IDs diferentes para cada campo', () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(<><InssBenefitTypeSelect value="" onChange={onChange} required /><InssBenefitTypeSelect value="41" onChange={onChange} required /></>);
    expect(html).not.toContain('<datalist');
    expect(html.match(/role="combobox"/g)).toHaveLength(2);
    const ids = [...html.matchAll(/<input[^>]* id="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([true, false])('o checkbox da API Happy controla novas simulações: %s', async ativo => {
    vi.spyOn(HappyBankService, 'getTenantConfig').mockResolvedValue({ ativo } as any);
    vi.spyOn(HappyTokenManager, 'invalidateToken').mockImplementation(() => {});
    const prisma = { systemConfig: { upsert: vi.fn() }, tenant: { update: vi.fn() } } as any;
    await HappyBankService.saveTenantConfig(prisma, 'tenant', { ativo });
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 'tenant' }, data: { happySimulationAccessEnabled: ativo, simulationAccessEnabled: ativo } });
  });

  it('salvar credenciais sem alterar o checkbox não modifica o bloqueio', async () => {
    vi.spyOn(HappyBankService, 'getTenantConfig').mockResolvedValue({} as any);
    vi.spyOn(HappyTokenManager, 'invalidateToken').mockImplementation(() => {});
    const prisma = { systemConfig: { upsert: vi.fn() }, tenant: { update: vi.fn() } } as any;
    await HappyBankService.saveTenantConfig(prisma, 'tenant', { usuario: 'fixture' });
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});
