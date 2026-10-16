import { resolveBankPromoter } from './bankPromoterConfig.js';
import { createHash } from 'node:crypto';
import { ParanaBankService } from './paranaBankService.js';
import { isValidCpf } from '../../src/lib/utils.js';
const HOSTS = { homologation: 'https://api-marketplace-hom.paranabanco.com.br', production: 'https://api-marketplace.paranabanco.com.br' };
const product = 'CreditoTrabalhador';
const cleanCpf = (value: any) => String(value || '').replace(/\D/g, '');
const uuid = (value: any) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || ''));
const fingerprint = (config: unknown) => createHash('sha256').update(JSON.stringify(config)).digest('hex');
function validCpf(cpf: string, environment: string) { return isValidCpf(cpf) || environment === 'homologation' && cpf === '01234567890'; }
function link(value: unknown) { try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; } catch { return null; } }
function within(value: any, min: any, max: any, integer = false) { return typeof value === 'number' && Number.isFinite(value) && value > 0 && (!integer || Number.isInteger(value)) && typeof min === 'number' && typeof max === 'number' && value >= min && value <= max; }
export class ParanaCltService {
  static async connections(db: any, tenantId: string) {
    const promoters = await db.promoter.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true }, orderBy: { id: 'asc' } });
    const ids: string[] = [];
    for (const promoter of promoters) if ((await ParanaBankService.config(db, tenantId, promoter.id)).enabled) ids.push(promoter.id);
    if (!ids.length) throw new Error('Nenhuma conexão Paraná CLT habilitada nesta empresa.');
    return ids;
  }
  static async request(db: any, tenantId: string, promoterId: string, method: 'GET' | 'POST', path: string, body?: any) {
    const allowed = method === 'POST' ? ['/v1/consentimentos', '/v1/consentimentos/status', '/v1/elegibilidades', '/v1/simulacoes'].includes(path) : /^\/v1\/elegibilidades\/[a-f0-9-]{36}$/i.test(path);
    if (!allowed) throw new Error('Operação Paraná CLT não permitida.');
    const config = await ParanaBankService.config(db, tenantId, promoterId);
    const token = await ParanaBankService.token(db, tenantId, promoterId, false, config.environment);
    const response = await fetch(`${HOSTS[config.environment]}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'x-client-id': config.clientId, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000), redirect: 'error' });
    const data = await response.json().catch(() => null);
    if (![200, 202, 208].includes(response.status) || !data) throw new Error(ParanaBankService.bankError(data, response.status, { environment: config.environment, operation: 'Crédito Trabalhador', sensitive: [config.clientId, config.clientSecret, token, String(body?.cpf || ''), String(body?.nome || ''), String(body?.telefone || '')] }));
    return data;
  }
  static async readContext(db: any, tenantId: string, receipt: any, kind: string) {
    if (typeof receipt !== 'string' || receipt.length > 100000) throw new Error('Consulta de elegibilidade inválida.');
    const context = ParanaBankService.decodeContext(receipt);
    if (context.tenantId !== tenantId || context.kind !== kind || !Number.isFinite(context.expires) || context.expires < Date.now()) throw new Error('Elegibilidade vencida ou de outra empresa. Consulte novamente.');
    await resolveBankPromoter(db, tenantId, context.promoterId);
    const config = await ParanaBankService.config(db, tenantId, context.promoterId);
    if (!config.enabled || fingerprint(config) !== context.fingerprint) throw new Error('A conexão Paraná mudou. Consulte novamente a elegibilidade.');
    return context;
  }
  static async start(db: any, tenantId: string, promoterId: string, input: any, action: 'consent' | 'status' | 'eligibility') {
    const config = await ParanaBankService.config(db, tenantId, promoterId), cpf = cleanCpf(input.cpf);
    if (!validCpf(cpf, config.environment)) throw new Error('Informe um CPF válido; em homologação, utilize os cenários de teste do manual.');
    if (action === 'consent') {
      const nome = String(input.name || '').trim(), phone = String(input.phone || '').replace(/\D/g, '');
      if (nome.length < 3 || nome.length > 100 || phone.length !== 11) throw new Error('Informe nome completo e telefone com DDD (11 dígitos).');
      const data = await this.request(db, tenantId, promoterId, 'POST', '/v1/consentimentos', { produto: product, cpf, nome, ddd: phone.slice(0, 2), telefone: phone.slice(2), parametros: { origem: 'Link', enviarSms: false } });
      return { status: String(data.status || 'Solicitado'), link: link(data.linkConsentimento) };
    }
    if (action === 'status') {
      const data = await this.request(db, tenantId, promoterId, 'POST', '/v1/consentimentos/status', { produto: product, cpf });
      if (cleanCpf(data.cpf) !== cpf || !Array.isArray(data.consentimentos)) throw new Error('Status de consentimento incompatível com o cliente consultado.');
      return { statuses: data.consentimentos.filter((row: any) => row.produto === product).map((row: any) => ({ status: String(row.status || ''), expiresAt: row.dataValidadeConsentimento, link: link(row.linkConsentimento) })) };
    }
    const data = await this.request(db, tenantId, promoterId, 'POST', '/v1/elegibilidades', { produto: product, cpf });
    if (!uuid(data.id)) throw new Error('O Paraná não retornou um identificador válido de elegibilidade.');
    return { receipt: ParanaBankService.encodeContext({ kind: 'pending', tenantId, promoterId, cpf, id: data.id, fingerprint: fingerprint(config), expires: Date.now() + 60 * 60 * 1000 }), status: 'Elegibilidade solicitada' };
  }
  static async assessment(db: any, tenantId: string, receipt: any) {
    const context = await this.readContext(db, tenantId, receipt, 'pending');
    const data = await this.request(db, tenantId, context.promoterId, 'GET', `/v1/elegibilidades/${context.id}`);
    if (cleanCpf(data.cpf) !== context.cpf) throw new Error('CPF da elegibilidade diverge do cliente consultado.');
    if (data.status !== 'Concluido') return { status: String(data.status || 'Em processamento'), choices: [] };
    const choices: any[] = [];
    for (const item of Array.isArray(data.produtos) ? data.produtos : []) {
      if (item.produto !== product) continue;
      for (const employment of Array.isArray(item.vinculos) ? item.vinculos : []) {
        if (employment.elegivel !== true || employment.erros?.some((error: any) => error.codigo || error.mensagem)) continue;
        for (const condition of Array.isArray(employment.condicoes) ? employment.condicoes : []) {
          const fields = ['tipoCondicao', 'taxaMinima', 'taxaMaxima', 'valorMinimoDaParcela', 'valorMaximoDaParcela', 'quantidadeMinimaDeParcelas', 'quantidadeMaximaDeParcelas', 'valorMinimoLiberado', 'valorMaximoLiberado'];
          const limits = Object.fromEntries(fields.map(key => [key, condition[key]]));
          const binding = { ...context, kind: 'eligible', limits, matricula: String(employment.matricula || ''), employer: String(employment.numeroInscricaoEmpregador || ''), expires: Date.now() + 15 * 60 * 1000 };
          choices.push({ employerName: String(employment.nomeEmpregador || ''), employer: binding.employer, registration: binding.matricula, limits, receipt: ParanaBankService.encodeContext(binding) });
        }
      }
    }
    return { status: 'Concluido', choices, message: choices.length ? 'Selecione o vínculo e a condição retornados pelo Paraná.' : 'O banco não retornou vínculos elegíveis com condições de simulação.' };
  }
  static async simulate(db: any, tenantId: string, input: any) {
    const context = await this.readContext(db, tenantId, input.receipt, 'eligible'), limits = context.limits;
    if (!within(input.term, limits.quantidadeMinimaDeParcelas, limits.quantidadeMaximaDeParcelas, true) || !within(input.rate, limits.taxaMinima, limits.taxaMaxima)) throw new Error('Prazo ou taxa fora dos limites retornados pelo banco.');
    if (!['INSTALLMENT', 'AMOUNT'].includes(input.mode) || !(Number.isFinite(input.value) && input.value > 0)) throw new Error('Informe um valor válido para a simulação.');
    if (input.mode === 'INSTALLMENT' && !within(input.value, limits.valorMinimoDaParcela, limits.valorMaximoDaParcela)) throw new Error('Parcela fora dos limites retornados pelo banco.');
    if (input.mode === 'AMOUNT' && (!within(input.value, limits.valorMinimoLiberado, limits.valorMaximoLiberado) || !(typeof input.margin === 'number' && Number.isFinite(input.margin) && input.margin > 0))) throw new Error('Valor solicitado fora dos limites do banco ou margem disponível inválida.');
    if (limits.tipoCondicao === 'SeguroPrestamista' && input.insurance !== true) throw new Error('A condição selecionada exige seguro prestamista.');
    const rule = String(input.rule || '').trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(rule)) throw new Error('Informe o código da regra fornecido pelo Paraná.');
    const data = await this.request(db, tenantId, context.promoterId, 'POST', '/v1/simulacoes', { cpf: context.cpf, produtos: [{ produto: product, tipoDaOperacao: 'Novo', quantidadeDeParcelas: input.term, ...(input.mode === 'INSTALLMENT' ? { valorDaParcela: input.value } : { valorSolicitado: input.value, margemDisponivel: input.margin }), taxa: input.rate, gerarComSeguro: input.insurance === true, codigoDaRegra: rule }] });
    if (cleanCpf(data.cpf) !== context.cpf || !Array.isArray(data.simulacoes)) throw new Error('Retorno da simulação incompatível com o cliente consultado.');
    return { offers: data.simulacoes.filter((row: any) => row.produto === product && row.tipoDaOperacao === 'Novo' && uuid(row.codigoDaSimulacao) && [row.valorLiberadoDaOperacao, row.valorDaParcela, row.taxaCLMensal].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0) && Number.isInteger(row.totalDeParcelas) && row.totalDeParcelas > 0).map((row: any) => ({ id: row.codigoDaSimulacao, amount: row.valorLiberadoDaOperacao, installment: row.valorDaParcela, term: row.totalDeParcelas, rate: row.taxaCLMensal, cetMonthly: row.taxaCETMensal, cetAnnual: row.taxaCETAnual, insurance: row.incluirSeguroPrestamista === true })), message: data.erros?.some((error: any) => error.codigo || error.mensagem) ? 'O banco retornou erros para parte da consulta; somente ofertas válidas são exibidas.' : '' };
  }
  static async journey(db: any, tenantId: string, input: any, action: string) {
    if (action === 'assessment') return this.assessment(db, tenantId, input.receipt);
    if (action === 'simulate') return this.simulate(db, tenantId, input);
    if (!['consent', 'status', 'eligibility'].includes(action)) throw new Error('Ação CLT inválida.');
    const ids = await this.connections(db, tenantId), results = [], messages = [];
    for (const id of ids) try { results.push(await this.start(db, tenantId, id, input, action as 'consent' | 'status' | 'eligibility')); } catch (error) { messages.push(error instanceof Error ? error.message : 'Falha na conexão Paraná CLT.'); }
    if (!results.length) throw new Error([...new Set(messages)].join(' '));
    return { results, messages: [...new Set(messages)] };
  }
}
