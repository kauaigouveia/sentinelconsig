import { describe, expect, it, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inssSimulationDraft } from '../server/services/inssSimulationDraft';
import { FinantoService } from '../server/services/finantoService';
import { readJsonResponse } from '../src/lib/httpJson';
import { FinantoInssSimulationModal } from '../src/components/simulation/FinantoInssSimulationModal';
const azure = vi.hoisted(() => ({ stageBlock: vi.fn(), commitBlockList: vi.fn(), getProperties: vi.fn(), deleteIfExists: vi.fn(), url: 'https://example.blob.core.windows.net/docs/file' }));
vi.mock('../server/services/azureBlobStorage', () => ({ getAzureContainerClient: () => ({ containerName: 'docs', getBlockBlobClient: () => azure }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const body = () => ({ operationType: 'NEW', customerData: { birthDate: '1980-01-01', benefitNumber: '123456789', benefitType: 41 }, selectedCondition: { provider: 'Nossa Fintech', tableId: 'abc', tableName: 'Tabela', amount: 20000, installment: 500, rate: 1.85, term: 108 } });
describe('Simulação antes da digitação', () => {
  it('não pede documentos e endereço ao abrir e oferece as duas ações', () => {
    const html = renderToStaticMarkup(<FinantoInssSimulationModal isOpen operationCode="1" partners={[]} onSuccess={() => {}} onClose={() => {}} />);
    expect(html).toContain('Salvar simulação'); expect(html).toContain('Seguir para digitação');
    expect(html).not.toContain('Frente do documento'); expect(html).not.toContain('Logradouro'); expect(html).not.toContain('Dados adicionais do cliente');
  });
  it('salva condição e dados essenciais, descartando arquivos arbitrários', () => {
    const input = { ...body(), files: { front: 'private' }, customerData: { ...body().customerData, files: 'private' } };
    expect(inssSimulationDraft(input).selectedCondition.provider).toBe('Nossa Fintech');
    expect(JSON.stringify(inssSimulationDraft(input))).not.toContain('private');
  });
  it('preserva os dados para a mesa apenas pelos campos permitidos', () => {
    const input = body(); Object.assign(input.customerData, { address: { street: 'Rua', number: '2', secret: 'discard' }, creditBankAccount: { bank: '104', branch: '0052', number: '123', digit: '5' } });
    const draft = inssSimulationDraft(input);
    expect(draft.customerData.address?.street).toBe('Rua'); expect(draft.customerData.creditBankAccount?.branch).toBe('0052'); expect(JSON.stringify(draft)).not.toContain('discard');
  });
  it('não inventa parcela ou taxa ausentes no retorno da integração', () => {
    expect(inssSimulationDraft({ ...body(), selectedCondition: { ...body().selectedCondition, rate: null, installment: null } }).selectedCondition).toMatchObject({ rate: null, installment: null });
  });
  it('rejeita condição vazia e nascimento inválido', () => {
    expect(() => inssSimulationDraft({ ...body(), selectedCondition: null })).toThrow();
    expect(() => inssSimulationDraft({ ...body(), customerData: { ...body().customerData, birthDate: 'bad' } })).toThrow();
  });
  it('mostra erro legível para limite de envio e respostas não JSON', async () => {
    await expect(readJsonResponse(new Response('Request Entity Too Large', { status: 413 }))).rejects.toThrow('limite de tamanho');
    await expect(readJsonResponse(new Response('<html>bad gateway</html>', { status: 502 }))).rejects.toThrow('HTTP 502');
    expect(await readJsonResponse(new Response('{"id":"ok"}'))).toEqual({ id: 'ok' });
  });
});
describe('Documentos em partes menores', () => {
  it('valida tipo, limite, tenant, integridade e validade do token', () => {
    vi.stubEnv('JWT_SECRET', 'fixture-secret');
    expect(() => FinantoService.prepareDocument('a', { name: 'doc', type: 'text/html', size: 10 })).toThrow();
    expect(() => FinantoService.prepareDocument('a', { name: 'doc', type: 'image/png', size: 6 * 1024 * 1024 })).toThrow();
    const ticket = FinantoService.prepareDocument('a', { name: 'doc', type: 'image/png', size: 10 });
    expect(ticket.chunkSize).toBe(512 * 1024); expect(FinantoService.documentTicket('a', ticket.uploadToken).size).toBe(10);
    expect(() => FinantoService.documentTicket('b', ticket.uploadToken)).toThrow();
    expect(() => FinantoService.documentTicket('a', ticket.uploadToken + 'x')).toThrow();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 21 * 60_000);
    expect(() => FinantoService.documentTicket('a', ticket.uploadToken)).toThrow();
  });
  it('aceita só as partes do tamanho correto', async () => {
    vi.stubEnv('JWT_SECRET', 'fixture-secret');
    const { uploadToken } = FinantoService.prepareDocument('a', { name: 'doc', type: 'image/png', size: 10 });
    await expect(FinantoService.uploadDocumentChunk('a', { uploadToken, index: 1, content: Buffer.alloc(10).toString('base64') })).rejects.toThrow();
    await expect(FinantoService.uploadDocumentChunk('a', { uploadToken, index: 0, content: Buffer.alloc(9).toString('base64') })).rejects.toThrow();
    await FinantoService.uploadDocumentChunk('a', { uploadToken, index: 0, content: Buffer.alloc(10).toString('base64') });
    expect(azure.stageBlock).toHaveBeenCalledWith(FinantoService.documentBlockId(0), Buffer.alloc(10), 10);
  });
  it('monta todas as partes, envia pelo Azure e remove o temporário', async () => {
    vi.stubEnv('JWT_SECRET', 'fixture-secret'); vi.stubEnv('AZURE_STORAGE_CONNECTION_STRING', Buffer.alloc(32).toString('base64'));
    const { uploadToken } = FinantoService.prepareDocument('a', { name: 'doc', type: 'image/png', size: 10 });
    azure.getProperties.mockResolvedValue({ contentLength: 10 }); azure.deleteIfExists.mockResolvedValue({});
    const request = vi.spyOn(FinantoService, 'request').mockResolvedValue({ success: true, status: 200, data: { id: 'provider-file' } });
    expect(await FinantoService.uploadTemporaryFile({} as any, 'a', { uploadToken })).toMatchObject({ id: 'provider-file' });
    expect(azure.commitBlockList).toHaveBeenCalledWith([FinantoService.documentBlockId(0)], expect.anything());
    expect(request.mock.calls[0][3]).toBe('/v3/files/upload-by-url'); expect(azure.deleteIfExists).toHaveBeenCalled();
  });
});
