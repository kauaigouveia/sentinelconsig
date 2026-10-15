import { isValidCpf } from '../../src/lib/utils.js';
import { PresencaBankService as Bank } from './presencaBankService.js';

function positive(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 9999999999.99; }
function validDate(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }

export class PresencaFgtsService {
  static async tables(db: any, tenantId: string, userId: string, input: any) {
    const cpf = String(input.cpf || '').replace(/\D/g, '');
    if (!isValidCpf(cpf)) throw new Error('Informe um CPF válido para consultar FGTS.');
    const ids = await Bank.available(db, tenantId, 'fgts');
    if (!ids.length) throw new Error('Nenhuma conexão Presença FGTS habilitada nesta empresa.');
    const tables: any[] = [], messages: string[] = [];
    for (const promoterId of ids) try {
      const config = await Bank.enabledConfig(db, tenantId, promoterId);
      const data = await Bank.request(db, tenantId, promoterId, '/v3/operacoes/fgts/simulacao/agrupamento', { cpf, cdc: false });
      if (!Array.isArray(data) || data.length > 500) throw new Error('Presença retornou tabelas FGTS em formato não reconhecido.');
      const seen = new Set<number>(); let invalid = 0;
      for (const row of data) {
        if (!row || !Number.isInteger(row.id) || row.id <= 0 || typeof row.nome !== 'string' || !row.nome.trim() || row.nome.length > 200 || !positive(row.taxaJuros) || row.taxaJuros > 100) { invalid++; continue; }
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const table = { id: row.id, name: row.nome, rate: row.taxaJuros };
        tables.push({ ...table, receipt: Bank.receipt({ tenantId, userId, promoterId, cpf, fingerprint: Bank.fingerprint(config) }, 'fgts-table', table) });
      }
      if (invalid) messages.push(`${invalid} tabelas FGTS inconsistentes não puderam ser consultadas. A comparação pode estar incompleta.`);
    } catch (error) { messages.push(error instanceof Error ? error.message : 'Falha na consulta FGTS Presença.'); }
    if (!tables.length && messages.length) throw new Error([...new Set(messages)].join(' '));
    return { tables, messages: [...new Set(messages)], message: tables.length ? `${tables.length} tabelas disponíveis. Consulte cada tabela para comparar os valores liberados.` : 'Nenhuma tabela FGTS disponível para este CPF.' };
  }
  static async simulate(db: any, tenantId: string, userId: string, input: any) {
    const context = await Bank.context(db, tenantId, userId, input.receipt, 'fgts-table', 'fgts'), table = context.data;
    // The table comes from a sealed bank response, never from a caller-provided tabelaId.
    const data = await Bank.request(db, tenantId, context.promoterId, '/v3/operacoes/fgts/simulacao', { cpf: context.cpf, cdc: false, tabelaId: table.id });
    if (!Array.isArray(data) || data.length > 100) throw new Error('Presença retornou simulação FGTS em formato não reconhecido.');
    const offers = data.filter((row: any) => row && Number.isInteger(row.id) && row.id > 0 && positive(row.valorLiquido) && positive(row.saldoTotal) && Number.isInteger(row.prazo) && row.prazo > 0 && row.prazo <= 120 && Array.isArray(row.parcelas) && row.parcelas.length === row.prazo && row.parcelas.every((part: any) => part && validDate(part.dataRepasse) && positive(part.valor))).map((row: any) => ({ id: row.id, tableId: table.id, name: table.name, rate: table.rate, amount: row.valorLiquido, balance: row.saldoTotal, term: row.prazo, payments: row.parcelas.map((part: any) => ({ date: part.dataRepasse, amount: part.valor })) }));
    return { offers, message: offers.length ? 'Simulação retornada pelo Presença. Não representa contratação.' : 'Nenhuma oferta FGTS válida retornada nesta tabela.' };
  }
}
