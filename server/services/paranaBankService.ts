import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { bankPromoterConfigKey, resolveBankPromoter } from './bankPromoterConfig.js';
import { resolveMappedBankStatus } from './bankStatusMappings.js';

const HOSTS = { homologation: 'https://api-marketplace-hom.paranabanco.com.br', production: 'https://api-marketplace.paranabanco.com.br' };
type Config = { environment: keyof typeof HOSTS; enabled: boolean; clientId: string; clientSecret: string; bankId: string; promoterCode: string };
const tokens = new Map<string, { token: string; expires: number; fingerprint: string }>();
function key() { const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET; if (!secret) throw new Error('Segredo de autenticação não configurado.'); return createHash('sha256').update(`sentinel:parana:${secret}`).digest(); }
function seal(value: unknown) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv); const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return [iv, cipher.getAuthTag(), data].map(item => item.toString('base64')).join('.'); }
function open(value: string) { const [iv, tag, data] = value.split('.').map(item => Buffer.from(item, 'base64')); const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag); return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')); }
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
export function isParanaBank(bank: { code?: string; name?: string } | null) { return !!bank && (bank.code === '254' || /PARANA/.test(String(bank.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase())); }
export function paranaFinancial(row: any) {
  const values = row.simulacao || row;
  const result: any = {};
  for (const [target, source] of [['releasedValue', 'valorLiberadoParaOCliente'], ['contractValue', 'valorBruto'], ['installmentValue', 'valorDaParcela'], ['debtBalance', 'saldoDevedor']] as const) {
    const raw = values[source];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 9999999999.99) throw new Error('Paraná retornou valores financeiros inválidos. Nenhum valor foi atualizado.');
    result[target] = value;
  }
  const count = values.totalDeParcelas ?? values.quantidadeDeParcelas;
  if (count !== undefined && count !== null) {
    if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 1000) throw new Error('Paraná retornou prazo inválido.');
    result.installmentsCount = Number(count);
  }
  return result;
}
export class ParanaBankService {
  static configKey(promoterId: string) { return bankPromoterConfigKey('parana', promoterId, 'config'); }
  static async config(db: any, tenantId: string, promoterId: string, environment?: string): Promise<Config> {
    if (environment !== undefined && !Object.hasOwn(HOSTS, environment)) throw new Error('Selecione Produção ou Homologação.');
    const read = (configKey: string) => db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey } } });
    if (environment) {
      const saved = await read(`${this.configKey(promoterId)}:${environment}`);
      if (saved) return open(saved.configValue);
    }
    const row = await read(this.configKey(promoterId));
    const active = row ? open(row.configValue) : null;
    if (active && (!environment || active.environment === environment)) return active;
    return { environment: (environment || 'homologation') as Config['environment'], enabled: false, clientId: '', clientSecret: '', bankId: '', promoterCode: '' };
  }
  static metadata(config: Config) { const { clientSecret, ...safe } = config; return { ...safe, hasClientSecret: !!clientSecret }; }
  static async save(db: any, tenantId: string, promoterId: string, input: any) {
    if (!Object.keys(HOSTS).includes(input.environment)) throw new Error('Selecione Produção ou Homologação.');
    const old = await this.config(db, tenantId, promoterId, input.environment);
    const value: Config = { environment: input.environment, enabled: input.enabled === true, clientId: String(input.clientId || '').trim(), clientSecret: String(input.clientSecret || old.clientSecret).trim(), bankId: String(input.bankId || ''), promoterCode: String(input.promoterCode || '').trim() };
    if ([value.clientId, value.clientSecret].some(item => item.length > 10000 || /[\r\n]/.test(item))) throw new Error('Credenciais inválidas.');
    const bank = value.bankId ? await db.bank.findFirst({ where: { id: value.bankId, tenantId, status: 'ATIVO' } }) : null;
    if (value.bankId && !isParanaBank(bank)) throw new Error('Selecione o cadastro do Paraná Banco desta empresa.');
    if (value.enabled && (!value.clientId || !value.clientSecret || !bank || !value.promoterCode)) throw new Error('Preencha client_id, client_secret, código do promotor no Paraná e selecione o banco.');
    const configKey = this.configKey(promoterId), configValue = seal(value);
    await db.$transaction(async (tx: any) => {
      // Preserve the previous active credentials before switching environments, including legacy connections.
      const previous = await this.config(tx, tenantId, promoterId);
      for (const [storedKey, storedValue] of [
        [`${configKey}:${previous.environment}`, seal(previous)],
        [`${configKey}:${value.environment}`, configValue],
        [configKey, configValue],
      ]) {
        await tx.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey: storedKey } }, create: { tenantId, configKey: storedKey, configValue: storedValue, isSecret: true }, update: { configValue: storedValue, isSecret: true } });
      }
    });
    tokens.delete(`${tenantId}:${promoterId}:${value.environment}`);
    return this.metadata(value);
  }
  static async token(db: any, tenantId: string, promoterId: string, force = false, environment?: string) {
    const config = await this.config(db, tenantId, promoterId, environment);
    if (!config.enabled || !config.clientId || !config.clientSecret) throw new Error('Cadastre e habilite a conexão Paraná desta promotora.');
    const cacheKey = `${tenantId}:${promoterId}:${config.environment}`, fingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex'), cached = tokens.get(cacheKey);
    if (!force && cached?.fingerprint === fingerprint && cached.expires > Date.now()) return cached.token;
    const response = await fetch(`${HOSTS[config.environment]}/v1/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'X-Client-Id': config.clientId }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'openid', client_id: config.clientId, client_secret: config.clientSecret }).toString(), signal: AbortSignal.timeout(15000), redirect: 'error' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || typeof payload?.access_token !== 'string' || !payload.access_token || /[\r\n]/.test(payload.access_token)) throw new Error(`Paraná não autenticou a conexão (HTTP ${response.status}). Confira ambiente, credenciais e liberação do acesso.`);
    const seconds = Number(payload.expires_in);
    if (Number.isFinite(seconds) && seconds > 30) tokens.set(cacheKey, { token: payload.access_token, fingerprint, expires: Date.now() + (Math.min(seconds, 86400) - 30) * 1000 });
    return payload.access_token as string;
  }
  static async request(db: any, tenantId: string, promoterId: string, method: 'GET' | 'POST', path: string, body?: any) {
    if (!((method === 'GET' && /^\/v1\/propostas(?:\?|$)/.test(path)) || (method === 'POST' && path === '/v2/propostas/consultar'))) throw new Error('Operação Paraná não autorizada nesta integração de consulta.');
    const config = await this.config(db, tenantId, promoterId), token = await this.token(db, tenantId, promoterId);
    const response = await fetch(`${HOSTS[config.environment]}/consignado-cartao${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'X-Client-Id': config.clientId, Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json-patch+json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000), redirect: 'error' });
    if (response.status === 204) return { propostas: [], indiceDaPagina: null };
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.propostas) || data.propostas.length > 100 || data?.erros?.length) throw new Error(`Consulta Paraná não concluída (HTTP ${response.status}). Nenhuma proposta foi gravada.`);
    return data;
  }
  static async list(db: any, tenantId: string, promoterId: string, query: any) {
    const count = Number(query.quantidadeDeItens || 100);
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Quantidade de itens deve estar entre 1 e 100.');
    const params = new URLSearchParams({ QuantidadeDeItens: String(count) });
    for (const [input, output] of [['indiceDaPagina', 'IndiceDaPagina'], ['numeroDaProposta', 'numeroDaProposta'], ['codigoDaProposta', 'codigoDaProposta'], ['situacao', 'situacao'], ['codigoDoConvenio', 'codigoDoConvenio']] as const) {
      const value = String(query[input] || '').trim(); if (value.length > 100) throw new Error('Filtro Paraná inválido.'); if (value) params.set(output, value);
    }
    const data = await this.request(db, tenantId, promoterId, 'GET', `/v1/propostas?${params}`), config = await this.config(db, tenantId, promoterId);
    const scoped = data.propostas.filter((row: any) => String(row.codigoDoPromotor || '') === config.promoterCode);
    return { indiceDaPagina: data.indiceDaPagina && data.indiceDaPagina !== query.indiceDaPagina ? data.indiceDaPagina : null, ignoredCount: data.propostas.length - scoped.length, propostas: scoped.map((row: any) => ({ codigoDaProposta: row.codigoDaProposta, numeroDaProposta: row.numeroDaProposta, status: row.status, tipoDaOperacao: row.tipoDaOperacao, dataDeCadastro: row.dataDeCadastro, valorLiberadoParaOCliente: row.valorLiberadoParaOCliente, quantidadeDeParcelas: row.quantidadeDeParcelas, valorDaParcela: row.valorDaParcela })) };
  }
  static async sync(db: any, tenantId: string, proposalId: string, userId: string) {
    const proposal = await db.proposal.findFirst({ where: { id: proposalId, tenantId, deletedAt: null }, include: { client: true, bank: true } });
    if (!proposal || !isParanaBank(proposal.bank) || !proposal.promoterId) throw new Error('Proposta Paraná não encontrada ou sem promotora vinculada.');
    if (proposal.finantoSimulationId || proposal.nossaFintechDebtKey) throw new Error('Proposta vinculada a outro provedor. Utilize sua conexão de origem.');
    const source = await db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: `workbank:source:${proposal.id}` } } });
    if (source) throw new Error('Esta proposta pertence à WorkBank. Utilize a conexão de origem.');
    await resolveBankPromoter(db, tenantId, proposal.promoterId);
    const config = await this.config(db, tenantId, proposal.promoterId);
    if (config.bankId !== proposal.bankId) throw new Error('A conexão Paraná desta promotora está vinculada a outro cadastro de banco.');
    const cpf = digits(proposal.client.cpf), identifier = String(proposal.proposalNumber || '').trim();
    if (cpf.length !== 11 || !identifier) throw new Error('CPF ou número da proposta ausente.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    const data = await this.request(db, tenantId, proposal.promoterId, 'POST', '/v2/propostas/consultar', { cpf, ...(uuid ? { codigoDaProposta: identifier } : { numeroDaProposta: identifier }) });
    const matches = data.propostas.filter((row: any) => digits(row.cliente?.cpf) === cpf && (uuid ? String(row.codigoDaProposta || '').toLowerCase() === identifier.toLowerCase() : String(row.numeroDaProposta) === identifier));
    if (matches.length !== 1) throw new Error('A consulta Paraná não retornou uma proposta única com o mesmo CPF e identificador. Nenhum dado foi alterado.');
    const row = matches[0];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(row.codigoDaProposta || ''))) throw new Error('Paraná retornou um código de proposta inválido. Atualização bloqueada.');
    if (config.promoterCode && String(row.codigoDoPromotor || '') !== config.promoterCode) throw new Error('Código do promotor retornado diverge desta conexão. Atualização bloqueada.');
    const financial = paranaFinancial(row), status = String(row.status || ''), target = await resolveMappedBankStatus(db, tenantId, proposal.promoterId, 'parana', [status]);
    const bindingKey = bankPromoterConfigKey('parana', proposal.promoterId, `proposal:${proposal.id}`);
    await db.$transaction(async (tx: any) => {
      if (JSON.stringify(await this.config(tx, tenantId, proposal.promoterId)) !== JSON.stringify(config)) throw new Error('A conexão foi alterada durante a consulta. Consulte novamente.');
      const updated = await tx.proposal.updateMany({ where: { id: proposal.id, tenantId, promoterId: proposal.promoterId, bankId: config.bankId, deletedAt: null, version: proposal.version, partnerId: proposal.partnerId, clientId: proposal.clientId }, data: { ...financial, ...(target ? { statusId: target.id, standardCategory: target.standardCategory } : {}), version: { increment: 1 } } });
      if (updated.count !== 1) throw new Error('Proposta alterada durante a consulta. Recarregue e tente novamente.');
      if (target && target.id !== proposal.statusId) await tx.statusHistory.create({ data: { tenantId, proposalId: proposal.id, userId, statusId: target.id, statusName: target.name, notes: 'Paraná Banco: consulta da conexão da promotora vinculada.' } });
      const configValue = seal({ environment: config.environment, codigoDaProposta: row.codigoDaProposta, numeroDaProposta: row.numeroDaProposta, status, lastSyncAt: new Date().toISOString() });
      await tx.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey: bindingKey } }, create: { tenantId, configKey: bindingKey, configValue, isSecret: true }, update: { configValue, isSecret: true } });
    }, { timeout: 15000 });
    return { success: true, statusMapped: !!target, bankStatus: status, proposalId: proposal.id };
  }
}
