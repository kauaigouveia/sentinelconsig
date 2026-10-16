import { isValidCpf } from '../../src/lib/utils.js';
import { paranaNovoOffers } from '../../src/lib/paranaOffers.js';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { bankPromoterConfigKey, resolveBankPromoter } from './bankPromoterConfig.js';
import { resolveMappedBankStatus } from './bankStatusMappings.js';

const HOSTS = { homologation: 'https://api-marketplace-hom.paranabanco.com.br', production: 'https://api-marketplace.paranabanco.com.br' };
type Config = { environment: keyof typeof HOSTS; enabled: boolean; inssEnabled?: boolean; clientId: string; clientSecret: string; bankId: string; promoterCode: string };
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
  static encodeContext(value: unknown) { return seal(value); }
  static decodeContext(value: string) { try { const parts = value.split('.'); if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9+/]+={0,2}$/.test(part) || Buffer.from(part, 'base64').toString('base64') !== part) || Buffer.from(parts[0], 'base64').length !== 12 || Buffer.from(parts[1], 'base64').length !== 16) throw new Error('Invalid context'); return open(value); } catch { throw new Error('Consulta Paraná inválida ou vencida. Consulte a elegibilidade novamente.'); } }
  static metadata(config: Config) { const { clientSecret, ...safe } = config; return { ...safe, inssEnabled: config.inssEnabled !== false, hasClientSecret: !!clientSecret }; }
  static async save(db: any, tenantId: string, promoterId: string, input: any) {
    if (!Object.keys(HOSTS).includes(input.environment)) throw new Error('Selecione Produção ou Homologação.');
    const old = await this.config(db, tenantId, promoterId, input.environment);
    const value: Config = { environment: input.environment, enabled: input.enabled === true, inssEnabled: input.inssEnabled === undefined ? old.inssEnabled !== false : input.inssEnabled === true, clientId: String(input.clientId || '').trim(), clientSecret: String(input.clientSecret || old.clientSecret).trim(), bankId: String(input.bankId || ''), promoterCode: String(input.promoterCode || '').trim() };
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
  static bankError(data: any, status: number, context?: { environment: string; operation: string; sensitive?: string[] }) {
    const known: Record<string, string> = { MKT_007: 'Configuração do parceiro não encontrada pelo Paraná. Confira o client_id do ambiente selecionado em Integrações e solicite ao banco a confirmação do cadastro e da habilitação para Crédito Trabalhador nesse ambiente.', CLCD_0020: 'O cliente não possui consentimento ativo.', CLCD_0023: 'CPF inválido.', CLCD_0024: 'CPF obrigatório.', PESSD_0027: 'CPF inválido.', PESSD_0070: 'CPF não localizado pelo banco.', IE: 'Benefício bloqueado para empréstimo pelo beneficiário.', IF: 'Benefício bloqueado na concessão.', IT: 'Benefício bloqueado por TBM.' };
    const sanitize = (value: unknown) => {
      if (typeof value !== 'string') return '';
      let text = value;
      for (const secret of context?.sensitive || []) if (secret.length >= 3) text = text.split(secret).join('[omitido]');
      return text.replace(/https?:\/\/[^\s]+/gi, '[link omitido]')
        .replace(/(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token omitido]')
        .replace(/(?:client[_-]?secret|client[_-]?id|authorization|access[_-]?token|publicKey|clientKey|password|senha)\s*[:=]\s*[^,;\s]+/gi, '[credencial omitida]')
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento omitido]')
        .replace(/\(?\d{2}\)?[ -]?\d{4,5}[ -]?\d{4}\b/g, '[telefone omitido]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail omitido]')
        .replace(/<[^>]*>|[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 350);
    };
    const messages: string[] = [];
    const add = (item: any) => {
      if (typeof item === 'string') { const text = sanitize(item); if (text) messages.push(text); return; }
      if (!item || typeof item !== 'object') return;
      const code = String(item.codigo || item.code || item.Codigo || '').trim();
      const safeCode = /^[A-Z][A-Z0-9_]{0,35}$/.test(code) ? code : '';
      const text = known[code] || sanitize(item.mensagem || item.message || item.descricao || item.description || item.Mensagem);
      if (text || safeCode) messages.push(`${safeCode ? `${safeCode}: ` : ''}${text || 'Solicitação recusada pelo banco.'}`);
    };
    for (const source of [data?.erros, data?.errors, data?.Erros]) {
      if (Array.isArray(source)) source.slice(0, 8).forEach(add);
      else if (source && typeof source === 'object') for (const values of Object.values(source).slice(0, 8)) (Array.isArray(values) ? values : [values]).slice(0, 4).forEach(add);
    }
    if (!messages.length) add(typeof data === 'string' ? data : data?.detail || data?.mensagem || data?.message || data?.error_description || data?.error || data?.title);
    const location = context ? `${context.operation} · ${context.environment === 'production' ? 'Produção' : 'Homologação'} · ` : '';
    const detail = [...new Set(messages)].slice(0, 4).join(' ') || 'O banco não retornou um motivo legível. Confira os dados e a habilitação da conexão.';
    const hint = context?.environment === 'homologation' ? ' Homologação utiliza os cenários e CPFs de teste definidos pelo Paraná; não equivale à consulta de clientes em produção.' : '';
    return `Paraná · ${location}HTTP ${status}: ${detail}${hint}`;
  }
  static async consentRequest(db: any, tenantId: string, promoterId: string, path: string, body: any) {
    if (!['/v1/inss/beneficio/consentimento', '/v1/inss/beneficio/consentimento/ativo'].includes(path)) throw new Error('Recurso de consentimento inválido.');
    if ((await this.config(db, tenantId, promoterId)).inssEnabled === false) throw new Error('INSS Paraná desabilitado nesta conexão.');
    const config = await this.config(db, tenantId, promoterId), token = await this.token(db, tenantId, promoterId, false, config.environment);
    const response = await fetch(`${HOSTS[config.environment]}/consignado-cartao${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Client-Id': config.clientId, 'Content-Type': 'application/json-patch+json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000), redirect: 'error' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.erros?.length) throw new Error(this.bankError(data, response.status, { environment: config.environment, operation: path.endsWith('/ativo') ? 'Confirmar consentimento' : 'Gerar consentimento', sensitive: [config.clientId, config.clientSecret, token, ...Object.values(body).filter((value): value is string => typeof value === 'string')] }));
    return data;
  }
  static async consent(db: any, tenantId: string, promoterId: string, input: any, generate: boolean) {
    const cpf = digits(input?.cpf);
    if (!isValidCpf(cpf)) throw new Error('Informe um CPF válido.');
    if (!generate) {
      const data = await this.consentRequest(db, tenantId, promoterId, '/v1/inss/beneficio/consentimento/ativo', { cpf });
      const expiry = data.dataDeValidadeDaAutorizacao;
      return { active: data.tokenAtivo === true && (expiry == null || (Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) > Date.now())) };
    }
    const nome = String(input?.name || '').trim(), telefone = digits(input?.phone);
    if (nome.length < 3 || nome.length > 100 || telefone.length !== 11) throw new Error('Informe nome completo e telefone com DDD (11 dígitos) para gerar o consentimento.');
    const data = await this.consentRequest(db, tenantId, promoterId, '/v1/inss/beneficio/consentimento', { cpf, nome, telefone, enviarSms: false });
    let link: URL;
    try { link = new URL(data.linkConsentimento); } catch { throw new Error('Paraná não retornou um link de consentimento válido.'); }
    if (link.protocol !== 'https:' || link.username || link.password) throw new Error('Link de consentimento inválido.');
    return { link: link.toString(), active: false };
  }
  static async novoConnections(db: any, tenantId: string, allowEmpty = false) {
    const promoters = await db.promoter.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true }, orderBy: { id: 'asc' } });
    const active = [];
    for (const promoter of promoters) { const config = await this.config(db, tenantId, promoter.id); if (config.enabled && config.inssEnabled !== false) active.push(promoter.id); }
    if (!active.length && !allowEmpty) throw new Error('Nenhuma conexão Paraná INSS habilitada nesta empresa.');
    return active as string[];
  }
  static async novoJourney(db: any, tenantId: string, input: any, action: 'consent' | 'status' | 'offers') {
    const ids = await this.novoConnections(db, tenantId);
    const results: any[] = [], errors: string[] = [];
    for (const id of ids) {
      try {
        if (action === 'offers') results.push(await this.opportunities(db, tenantId, id, input));
        else results.push(await this.consent(db, tenantId, id, input, action === 'consent'));
      } catch (error) { errors.push(error instanceof Error ? error.message : 'Falha na conexão Paraná.'); }
    }
    if (!results.length && errors.length) throw new Error([...new Set(errors)].join(' '));
    return { links: [...new Set(results.map(row => row.link).filter(Boolean))], active: results.some(row => row.active === true), offers: results.flatMap(row => (row.offers || []).map((offer: any) => ({ ...offer, promoterId: row.promoterId, environment: row.environment }))), messages: [...new Set(errors)], message: results.find(row => row.message)?.message };
  }
  static async opportunities(db: any, tenantId: string, promoterId: string, input: any) {
    const cpf = digits(input?.cpf);
    if (!isValidCpf(cpf)) throw new Error('Informe um CPF válido.');
    const config = await this.config(db, tenantId, promoterId);
    if (!(await this.consent(db, tenantId, promoterId, { cpf }, false)).active) throw new Error('Consentimento Paraná pendente. Gere o link, aguarde o aceite e confirme a autorização.');
    if (JSON.stringify(config) !== JSON.stringify(await this.config(db, tenantId, promoterId))) throw new Error('A conexão Paraná mudou durante a confirmação. Confirme novamente.');
    const token = await this.token(db, tenantId, promoterId, false, config.environment);
    const response = await fetch(`${HOSTS[config.environment]}/consignado-cartao/v1/oportunidades`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Client-Id': config.clientId, 'Content-Type': 'application/json-patch+json', Accept: 'application/json' },
      body: JSON.stringify({ cpf }), signal: AbortSignal.timeout(25000), redirect: 'error',
    });
    if (response.status === 204) return { offers: [], message: 'O Paraná não retornou oportunidades para este cliente.' };
    const data = await response.json().catch(() => null);
    if (![200, 207].includes(response.status) || !data || !Array.isArray(data.oportunidades)) throw new Error(this.bankError(data, response.status, { environment: config.environment, operation: 'Consultar ofertas', sensitive: [cpf, config.clientId, config.clientSecret, token] }));
    if (digits(data.cliente?.cpf) !== cpf) throw new Error('O CPF retornado pelo Paraná diverge do cliente consultado.');
    const offers = paranaNovoOffers(data);
    return { offers, environment: config.environment, promoterId, message: offers.length ? 'Condições definidas pelo Paraná; não são recalculadas pela parcela ou prazo dos outros simuladores.' : 'Nenhuma oferta válida de Novo INSS retornada. Verifique consentimento, margem e HISCON junto ao banco.', partial: response.status === 207 };
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
