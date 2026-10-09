import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FactaBankService } from '../server/services/factaBankService';
import { FactaSimulationService, factaNumber } from '../server/services/factaSimulationService';
import { ProductSimulationService } from '../server/services/productSimulationService';
import { NossaFintechService } from '../server/services/nossaFintechService';
import { FinantoService } from '../server/services/finantoService';
import { FactaSimulationResults } from '../src/components/simulation/FactaSimulationResults';
import { mapFactaStatusToInternal } from '../server/services/factaStatusMapper';

const config = { simulationEnabled: true, isConfigured: true, baseUrl: FactaBankService.PRODUCTION_BASE_URL };
const prisma = {} as any;
const input = { cpf: '12345678901', birthDate: '1980-01-02', benefitNumber: '123456', benefitType: 41, operation: 'NEW' as const, term: 108, mode: 'INSTALLMENT' as const, value: 500 };
const productInput = { cpf: input.cpf, name: 'Cliente', phone: '11999999999', term: 24, value: 500, mode: 'Payment' as const, eligibility: true };
beforeEach(() => {
  vi.spyOn(FactaBankService, 'getTenantConfig').mockResolvedValue(config as any);
  vi.spyOn(FactaBankService, 'getToken').mockResolvedValue('fixture-token');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const table = { codigoTabela: '1', tabela: 'NORMAL', taxa: 1.85, prazo: 108, contrato: 22000, parcela: 500, valor_liquido: 21000 };
const worker = { cpf: input.cpf, matricula: '001', numeroInscricaoEmpregador: '12345678000100', nomeEmpregador: 'Empresa', nome: 'Cliente', elegivel: true, valorTotalVencimentos: '3000.00', valorBaseMargem: '3000.00', valorMargemDisponivel: '800.00', dataNascimento: '1980-01-02', dataAdmissao: '2019-01-02' };

describe('FACTA simulações conforme manuais oficiais', () => {
  it.each([['3.046,08', 3046.08], ['97,00', 97], ['3000.00', 3000], [undefined, undefined]])('normaliza valor %s', (value, expected) => expect(factaNumber(value)).toBe(expected));
  it('envia os parâmetros INSS minúsculos e calcula por parcela sem valor artificial', async () => {
    const request = vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ erro: false, tabelas: [table] });
    const result = await FactaSimulationService.inss(prisma, 'tenant', input);
    expect(request.mock.calls[0][3]).toMatchObject({ cpf: input.cpf, data_nascimento: '02/01/1980', opcao_valor: 2, valor_parcela: 500, tipo_operacao: 13, averbador: 3 });
    expect(request.mock.calls[0][3]).not.toHaveProperty('valor');
    expect(result.offers[0]).toMatchObject({ code: '1', amount: 21000, contractAmount: 22000 });
  });
  it('envia valor do contrato no modo por valor sem preencher parcela artificial', async () => {
    const request = vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ tabelas: [table] });
    await FactaSimulationService.inss(prisma, 'tenant', { ...input, mode: 'AMOUNT', value: 5000 });
    expect(request.mock.calls[0][3]).toMatchObject({ opcao_valor: 1, valor: 5000 });
    expect(request.mock.calls[0][3]).not.toHaveProperty('valor_parcela');
  });
  it('não transforma valor bruto em líquido', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ tabelas: [{ ...table, valor_liquido: undefined }] });
    const result = await FactaSimulationService.inss(prisma, 'tenant', input);
    expect(result.offers[0].amount).toBeUndefined();
    const html = renderToStaticMarkup(<FactaSimulationResults offers={result.offers} message="" />);
    expect(html).toContain('Valor do contrato'); expect(html).toContain('Não informado');
  });
  it('filtra espécies, invalidez, LOAS, taxa e prazo explicitamente restritos', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ tabelas: [table, { ...table, tabela: 'BNF 32' }, { ...table, tabela: 'INVALIDEZ' }, { ...table, tabela: 'LOAS' }, { ...table, prazo: 84 }, { ...table, taxa: 1.8 }] });
    expect((await FactaSimulationService.inss(prisma, 'tenant', { ...input, rate: 1.85 })).offers).toHaveLength(1);
  });
  it('não chama API se integração estiver desabilitada', async () => {
    vi.spyOn(FactaBankService, 'getTenantConfig').mockResolvedValue({ ...config, simulationEnabled: false } as any);
    const request = vi.spyOn(FactaSimulationService, 'request');
    expect((await FactaSimulationService.inss(prisma, 'tenant', input)).offers).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
  it('combina portabilidade e refin apenas pelo grupo retornado, usando troco líquido', async () => {
    const request = vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ tabelas_portabilidade: [{ ...table, codigoTabela: 'p1', grupos: 'GRUPO 3', prazo: 15 }, { ...table, codigoTabela: 'p2', grupos: 'GRUPO 2', prazo: 15 }], tabelas_refin_portabilidade: [{ ...table, grupos: 'GRUPO 3', valor_liquido: 1500 }, { ...table, grupos: '' }, { ...table, grupos: 'GRUPO LOAS 3' }] });
    const result = await FactaSimulationService.inss(prisma, 'tenant', { ...input, operation: 'PORT_REFIN', debt: 5000, originalTerm: 84, remainingTerm: 15, originalInstallment: 500 });
    expect(result.offers).toHaveLength(1); expect(result.offers[0]).toMatchObject({ portabilityCode: 'p1', amount: 1500 });
    expect(request.mock.calls[0][3]).toMatchObject({ tipo_operacao: '003500', saldo_devedor: 5000, prazo_restante: 15 });
  });
  it('portabilidade usa prazo restante sem confundir com prazo do refin', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ tabelas_portabilidade: [{ ...table, prazo: 15 }] });
    expect((await FactaSimulationService.inss(prisma, 'tenant', { ...input, operation: 'PORT', debt: 5000, originalTerm: 84, remainingTerm: 15, originalInstallment: 500 })).offers).toHaveLength(1);
  });
  it('contratos refin só aparecem no benefício consultado', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ lista_contratos_refin: { c1: { matricula: input.benefitNumber, saldo_devedor: '3.046,08', valor_parcela: '97,00' }, c2: { matricula: 'outro' } } });
    expect(await FactaSimulationService.contracts(prisma, 'tenant', input.cpf, input.benefitNumber)).toEqual([{ code: 'c1', debt: 3046.08, installment: 97 }]);
  });
  it('refin exige contrato selecionado e renda antes de consultar valores', async () => {
    await expect(FactaSimulationService.inss(prisma, 'tenant', { ...input, operation: 'REFIN' })).rejects.toThrow('selecione um contrato');
  });
  it('FGTS usa código comercial de tabela e zera períodos não selecionados', async () => {
    const request = vi.spyOn(FactaSimulationService, 'request').mockImplementation(async (_p, _t, path) => path === '/fgts/saldo' ? { retorno: { dataRepasse_1: '01/03/2027', valor_1: 100, dataRepasse_2: '01/03/2028', valor_2: 200 } } : path === '/comercial/tabelas-coeficientes' ? { dados: [{ CD_TABELA_FF: '48291', CD_TABELA: 'internal', TABELA: 'LIGHT' }] } : { permitido: 'SIM', valor_liquido: 90, taxa: 1.8, parcelas_selecionadas: 1 });
    const rows = await FactaSimulationService.product(prisma, 'tenant', 'FGTS', 'SIMULATE', { ...productInput, term: 1 });
    expect(request.mock.calls[2][4]).toMatchObject({ tabela: '48291', parcelas: [{ valor_1: 100 }, { valor_2: 0 }] });
    expect(rows[0]).toMatchObject({ state: 'OFFER', amount: 90, term: 1 });
  });
  it('FGTS não oferece valor recusado e isola falhas por tabela', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockImplementation(async (_p, _t, path, _q, body: any) => {
      if (path === '/fgts/saldo') return { retorno: { dataRepasse_1: '01/03/2027', valor_1: 100 } };
      if (path === '/comercial/tabelas-coeficientes') return { dados: [{ CD_TABELA_FF: 'a' }, { CD_TABELA_FF: 'b' }] };
      if (body.tabela === 'a') throw new Error('Tabela indisponível');
      return { permitido: 'NAO', valor_liquido: 90, mensagem: 'Sem autorização' };
    });
    const rows = await FactaSimulationService.product(prisma, 'tenant', 'FGTS', 'SIMULATE', productInput);
    expect(rows.map(item => item.state)).toEqual(['ERROR', 'PENDING']); expect(rows.every(item => !item.amount)).toBe(true);
  });
  it('solicita autorização CLT explícita, averbador correto e telefone formatado', async () => {
    const request = vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ mensagem: 'Aguarde assinatura' });
    expect((await FactaSimulationService.product(prisma, 'tenant', 'CLT', 'AUTHORIZE', productInput))[0].message).toBe('Aguarde assinatura');
    expect(request.mock.calls[0]).toEqual([prisma, 'tenant', '/solicita-autorizacao-consulta', {}, { averbador: '10010', nome: 'Cliente', cpf: input.cpf, celular: '(11) 99999-9999', tipo_envio: 'SMS' }, true]);
  });
  it('consulta CLT apresenta CNPJ, margem e motivo de restrição', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ dados_trabalhador: { dados: [{ ...worker, elegivel: false, erro_mensagem: 'CNAE restrito' }] } });
    const rows = await FactaSimulationService.product(prisma, 'tenant', 'CLT', 'REFRESH', productInput);
    expect(rows[0]).toMatchObject({ state: 'DATA', message: expect.stringContaining('CNAE restrito'), data: { margin: { can_continue: false, available_balance: 800, employer: { document: '12345678000100' } } } });
  });
  it('rejeita outro CPF em CLT', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ dados_trabalhador: { dados: [{ ...worker, cpf: '99999999999' }] } });
    await expect(FactaSimulationService.product(prisma, 'tenant', 'CLT', 'REFRESH', productInput)).rejects.toThrow('outro CPF');
  });
  it('valida política com prazo e contrato reais retornados, preservando recusa', async () => {
    const request = vi.spyOn(FactaSimulationService, 'request').mockImplementation(async (_p, _t, path) => path.includes('autoriza-consulta') ? { dados_trabalhador: { dados: [worker] } } : path.includes('operacoes') ? { tabelas: [{ ...table, prazo: 24 }] } : { aprovado: '0', mensagem: 'CNPJ restrito' });
    const rows = await FactaSimulationService.product(prisma, 'tenant', 'CLT', 'SIMULATE', productInput);
    expect(rows[0]).toMatchObject({ state: 'PENDING', message: 'CNPJ restrito' });
    expect(request.mock.calls[2][3]).toMatchObject({ matricula: '001', prazo: 24, valorEmprestimo: 22000, dataAdmissao: '02/01/2019' });
  });
  it('orquestra FACTA sem substituir resultados das demais integrações', async () => {
    vi.spyOn(NossaFintechService, 'getConfig').mockResolvedValue({ enabled: false } as any);
    vi.spyOn(FinantoService, 'getConfig').mockResolvedValue({ enabled: false } as any);
    vi.spyOn(FactaSimulationService, 'product').mockResolvedValue([{ provider: 'FACTA', institution: 'FACTA', state: 'OFFER', amount: 1000 }]);
    expect((await ProductSimulationService.run(prisma, 'tenant', 'CLT', 'SIMULATE', productInput)).rows[0].provider).toBe('FACTA');
  });
});

describe('FACTA transporte e vínculo de propostas', () => {
  it('mascara CPF com onze dígitos nos registros de sincronização', () => {
    expect(FactaBankService.sanitizeFactaResponse({ cpf: '123.456.789-01' }).cpf).toBe('123******01');
  });
  it('mantém períodos zerados e rejeita cálculo FGTS de tabela diferente', async () => {
    const request = vi.spyOn(FactaSimulationService, 'request').mockImplementation(async (_p, _t, path) => path === '/fgts/saldo' ? { retorno: { dataRepasse_1: '01/03/2027', valor_1: 0, dataRepasse_2: '01/03/2028', valor_2: 200 } } : path === '/comercial/tabelas-coeficientes' ? { dados: [{ CD_TABELA_FF: '1' }] } : { permitido: 'SIM', tabela: '2 - OUTRA', valor_liquido: 90 });
    const rows = await FactaSimulationService.product(prisma, 'tenant', 'FGTS', 'SIMULATE', productInput);
    expect(request.mock.calls[2][4]).toMatchObject({ parcelas: [{ valor_1: 0 }, { valor_2: 200 }] });
    expect(rows[0]).toMatchObject({ state: 'ERROR', message: expect.stringContaining('outra tabela') });
  });
  it('rejeita política de crédito de outra matrícula', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockImplementation(async (_p, _t, path) => path.includes('autoriza-consulta') ? { dados_trabalhador: { dados: [worker] } } : path.includes('operacoes') ? { tabelas: [{ ...table, prazo: 24 }] } : { aprovado: '1', cpf: input.cpf, matricula: 'outra' });
    const rows = await FactaSimulationService.product(prisma, 'tenant', 'CLT', 'SIMULATE', productInput);
    expect(rows[0]).toMatchObject({ state: 'ERROR', message: expect.stringContaining('outro CPF ou vínculo') });
  });
  it('rejeita erro de negócio mesmo em HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ erro: true, mensagem: 'CPF sem autorização' }))));
    await expect(FactaSimulationService.request(prisma, 'tenant', '/fgts/saldo')).rejects.toThrow('CPF sem autorização');
  });
  it('reautentica uma vez em 401 para leitura', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response('{"erro":false}'));
    vi.stubGlobal('fetch', fetch); const invalidate = vi.spyOn(FactaBankService, 'invalidateTokenCache');
    await FactaSimulationService.request(prisma, 'tenant', '/fgts/saldo');
    expect(fetch).toHaveBeenCalledTimes(2); expect(invalidate).toHaveBeenCalledWith('tenant');
  });
  it('não repete automaticamente envio de autorização', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 })); vi.stubGlobal('fetch', fetch);
    await expect(FactaSimulationService.request(prisma, 'tenant', '/solicita-autorizacao-consulta', {}, { cpf: input.cpf }, true)).rejects.toThrow('401');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('erro HTTP 200 de consulta de propostas não vira lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"erro":true,"mensagem":"Permissão negada"}')));
    await expect(FactaBankService.queryAndamentoPropostas(prisma, 'tenant', {})).rejects.toThrow('Permissão negada');
  });
  it('associação exige banco FACTA e identificador, jamais CPF sozinho', async () => {
    const findMany = vi.fn().mockResolvedValue([]); const db = { proposal: { findMany } } as any;
    await FactaBankService.findMatchingProposal(db, 'tenant', { codigo_af: 'af', cpf: input.cpf });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant', bank: { OR: [{ name: { contains: 'FACTA', mode: 'insensitive' } }, { code: '149' }] } });
    expect(JSON.stringify(findMany.mock.calls[0])).not.toContain('c6OperationNumber');
    findMany.mockClear(); await FactaBankService.findMatchingProposal(db, 'tenant', { cpf: input.cpf }); expect(findMany).not.toHaveBeenCalled();
  });
  it('não vincula identificador duplicado ou CPF divergente', async () => {
    const findMany = vi.fn().mockResolvedValue([{ client: { cpf: '99999999999' } }]); const db = { proposal: { findMany } } as any;
    expect((await FactaBankService.findMatchingProposal(db, 'tenant', { codigo_af: 'af', cpf: input.cpf })).proposal).toBeNull();
    findMany.mockResolvedValue([{}, {}]); expect((await FactaBankService.findMatchingProposal(db, 'tenant', { codigo_af: 'af' })).matchType).toBe('MULTIPLE_MATCHES');
  });
  it('AF é identificador, não código de status; suspensão e desaverbação não são pago/integrado', () => {
    expect(mapFactaStatusToInternal({ codigo_af: '123960456' }).isMapped).toBe(false);
    expect(mapFactaStatusToInternal({ status_proposta: '208 - SUSPENSAO JUDICIAL LIMINAR' }).isMapped).toBe(false);
    expect(mapFactaStatusToInternal({ status_proposta: '231 - DESAVERBADO APÓS PAGAMENTO' }).isMapped).toBe(false);
  });
  it('não apresenta dados INSS como consulta CLT', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockResolvedValue({ erro: false, borrower: { name: 'Cliente' }, tabelas: [table] });
    await expect(FactaSimulationService.product(prisma, 'tenant', 'CLT', 'REFRESH', productInput)).rejects.toThrow('incompatível');
  });
  it('não oferece tabela com averbador INSS na simulação CLT', async () => {
    vi.spyOn(FactaSimulationService, 'request').mockImplementation(async (_p, _t, path) => path.includes('autoriza-consulta') ? { dados_trabalhador: { dados: [worker] } } : { tabelas: [{ ...table, prazo: 24, idAverbador: 3 }] });
    const rows = await FactaSimulationService.product(prisma, 'tenant', 'CLT', 'SIMULATE', productInput);
    expect(rows[0]).toMatchObject({ state: 'ERROR', message: expect.stringContaining('outro produto') });
  });
  it('acompanha por AF proposta pendente antiga e respeita janela de substabelecidos', async () => {
    vi.spyOn(FactaBankService, 'getTenantConfig').mockResolvedValue({ ...config, consultaSub: 'S', pageSize: 100 } as any);
    const query = vi.spyOn(FactaBankService, 'queryAndamentoPropostas').mockResolvedValue({ data: [], totalRecords: 0 });
    const sync = vi.spyOn(FactaBankService, 'syncProposalStatus').mockResolvedValue({ success: true, hasChanged: true, statusMapped: true });
    const findMany = vi.fn().mockResolvedValue([{ id: 'old-pending', factaAfCode: 'af-old' }]);
    const result = await FactaBankService.processBatchProposals({ proposal: { findMany } } as any, 'tenant', { daysBack: 30 });
    expect(sync).toHaveBeenCalledWith(expect.anything(), 'old-pending', 'tenant', { queriedBy: 'AUTO_WORKER' });
    expect(result.updatedCount).toBe(1);
    const params = query.mock.calls[0][2];
    const parse = (value: string) => new Date(value.split('/').reverse().join('-')).getTime();
    expect((parse(params.data_fim!) - parse(params.data_ini!)) / 86400000).toBeLessThanOrEqual(10);
    expect(findMany.mock.calls[0][0].where.standardCategory).toEqual({ notIn: ['PAGO', 'CANCELADO', 'RECUSADO'] });
  });
  it('consulta individual rejeita AF divergente sem alterar status interno', async () => {
    vi.spyOn(FactaBankService, 'queryAndamentoPropostas').mockResolvedValue({ data: [{ codigo_af: 'outro', status_proposta: 'PAGO' }], totalRecords: 1 });
    const transaction = vi.fn();
    const db = { proposal: { findFirst: vi.fn().mockResolvedValue({ id: 'p', factaAfCode: 'af', status: { name: 'PENDENTE' }, client: { cpf: input.cpf } }), update: vi.fn() }, factaSyncHistory: { create: vi.fn() }, $transaction: transaction } as any;
    await expect(FactaBankService.syncProposalStatus(db, 'p', 'tenant')).rejects.toThrow('divergente');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('vínculo manual impede reutilizar identificador em outra proposta', async () => {
    const update = vi.fn();
    const db = { proposal: { findFirst: vi.fn().mockResolvedValueOnce({ id: 'p' }).mockResolvedValueOnce({ id: 'duplicate' }), update } } as any;
    await expect(FactaBankService.linkFactaIdentifiers(db, 'p', 'tenant', { factaAfCode: 'af' })).rejects.toThrow('já vinculado');
    expect(update).not.toHaveBeenCalled();
  });
});
