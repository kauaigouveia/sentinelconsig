import { isValidCpf } from '../../src/lib/utils.js';
import { PresencaBankService as Bank } from './presencaBankService.js';

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
function amount(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 9999999999.99 ? value : null; }
function date(value: unknown) { if (typeof value !== 'string') return null; const day = value.slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day ? day : null; }
function text(value: unknown) { return typeof value === 'string' && value.trim().length <= 150 ? value.trim() : null; }
export class PresencaInssLookup {
  static async list(db: any, tenantId: string, userId: string, input: any) {
    const cpf = digits(input.cpf); if (!isValidCpf(cpf)) throw new Error('Informe um CPF válido.');
    const ids = await Bank.available(db, tenantId, 'inss-lookup');
    if (!ids.length) throw new Error('Habilite a consulta de benefícios INSS na conexão Presença da empresa.');
    const benefits: any[] = [], messages: string[] = [];
    for (const promoterId of ids) try {
      const config = await Bank.enabledConfig(db, tenantId, promoterId);
      const data = await Bank.request(db, tenantId, promoterId, `/v2/consultas/inss/${cpf}/beneficios`, undefined, 'GET');
      if (!Array.isArray(data) || data.length > 100) throw new Error('Retorno de benefícios Presença não reconhecido.');
      const seen = new Set<string>();
      for (const row of data) {
        if (!row || !/^\d{1,20}$/.test(String(row.numeroBeneficio)) || !/^\d{1,3}$/.test(String(row.especie))) throw new Error('Presença retornou benefício incompleto. Consulte novamente.');
        const benefit = String(row.numeroBeneficio); if (seen.has(benefit)) continue; seen.add(benefit);
        benefits.push({ benefit, species: String(Number(row.especie)), income: amount(row.valorBeneficio), receipt: Bank.receipt({ tenantId, userId, promoterId, cpf, fingerprint: Bank.fingerprint(config) }, 'inss-benefit', { benefit }) });
      }
    } catch (error) { messages.push(error instanceof Error ? error.message : 'Falha na consulta de benefícios.'); }
    if (!benefits.length && messages.length) throw new Error([...new Set(messages)].join(' '));
    return { benefits, messages: [...new Set(messages)] };
  }
  static async detail(db: any, tenantId: string, userId: string, input: any) {
    const context = await Bank.context(db, tenantId, userId, input.receipt, 'inss-benefit', 'inss-lookup');
    const row = await Bank.request(db, tenantId, context.promoterId, `/v2/consultas/inss/${context.cpf}/beneficio/${context.data.benefit}/detalhe`, undefined, 'GET');
    if (!row || digits(row.cpf) !== context.cpf || String(row.numeroBeneficio) !== context.data.benefit || !/^\d{1,3}$/.test(String(row.especie))) throw new Error('O benefício retornado não corresponde ao CPF e benefício consultados.');
    // Allowlisted fields only. Payment account is not assumed to be a loan disbursement account.
    return { detail: { cpf: context.cpf, name: text(row.nome), birthDate: date(row.dataNascimento), benefit: context.data.benefit, species: String(Number(row.especie)), income: amount(row.valorBeneficio), benefitStartDate: date(row.dataConcessao), benefitState: typeof row.ufBeneficio === 'string' && /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(row.ufBeneficio) ? row.ufBeneficio : null, margin: amount(row.margemResidual), cardMargin: amount(row.margemCartao), benefitCardMargin: amount(row.margemCartaoBeneficio), sex: text(row.sexo) } };
  }
}
