import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { bankPromoterConfigKey, resolveBankPromoter } from './bankPromoterConfig.js';
import { isValidCpf } from '../../src/lib/utils.js';

type Environment = 'production' | 'homologation';
type Config = { environment: Environment; enabled: boolean; login: string; password: string; cltEnabled: boolean; fgtsEnabled?: boolean; inssLookupEnabled?: boolean };
type Product = 'clt' | 'fgts' | 'inss-lookup';
const productEnabled = (config: Config, product: Product) => product === 'inss-lookup' ? config.inssLookupEnabled : product === 'fgts' ? config.fgtsEnabled : config.cltEnabled;
const HOST = 'https://presenca-bank-api.azurewebsites.net';
const allowed = ['/consultas/termo-inss', '/v3/operacoes/consignado-privado/consultar-vinculos', '/v3/operacoes/consignado-privado/consultar-margem', '/v6/operacoes/simulacao/disponiveis'];
const fgtsPaths = ['/v3/operacoes/fgts/simulacao/agrupamento', '/v3/operacoes/fgts/simulacao'];
const tokens = new Map<string, { token: string; expires: number }>();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
function secretKey() { const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET; if (!secret) throw new Error('Segredo de autenticação não configurado.'); return createHash('sha256').update(`sentinel:presenca:${secret}`).digest(); }
function seal(value: unknown) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secretKey(), iv); cipher.setAAD(Buffer.from('presenca-v1')); const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return [iv, cipher.getAuthTag(), data].map(row => row.toString('base64url')).join('.'); }
function open(value: string) {
  try {
    if (typeof value !== 'string' || value.length > 100000) throw new Error();
    const parts = value.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[\w-]+$/.test(part) || Buffer.from(part, 'base64url').toString('base64url') !== part)) throw new Error();
    const [iv, tag, data] = parts.map(part => Buffer.from(part, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', secretKey(), iv); cipher.setAuthTag(tag); cipher.setAAD(Buffer.from('presenca-v1'));
    return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
  } catch { throw new Error('Contexto Presença inválido ou vencido. Recomece a consulta.'); }
}
function environment(value: string): Environment { if (value !== 'production' && value !== 'homologation') throw new Error('Selecione Produção ou Homologação.'); return value; }
function text(value: unknown, max = 150) { return typeof value === 'string' && value.trim().length <= max && !/[\u0000-\u001f]/.test(value) ? value.trim() : ''; }
function positive(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 9999999999.99; }
function consentLink(value: unknown) { try { const url = new URL(String(value)); return url.protocol === 'https:' && url.hostname === 'sign.presen.ca' && !url.username && !url.password && !url.port ? url.toString() : null; } catch { return null; } }

/** Documentation MCP is development-only. Runtime calls use the fixed provider API. */
export class PresencaBankService {
  static configKey(promoterId: string) { return bankPromoterConfigKey('presenca', promoterId, 'config'); }
  static async config(db: any, tenantId: string, promoterId: string, requested?: string): Promise<Config> {
    const env = requested === undefined ? undefined : environment(requested);
    const key = this.configKey(promoterId);
    const row = await db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: env ? `${key}:${env}` : key } } });
    return row ? open(row.configValue) : { environment: env || 'production', enabled: false, login: '', password: '', cltEnabled: false };
  }
  static metadata(config: Config) { return { environment: config.environment, enabled: config.enabled, cltEnabled: config.cltEnabled, fgtsEnabled: config.fgtsEnabled === true, inssLookupEnabled: config.inssLookupEnabled === true, hasCredentials: !!config.login && !!config.password, homologationAvailable: false }; }
  static async save(db: any, tenantId: string, promoterId: string, input: any) {
    await resolveBankPromoter(db, tenantId, promoterId);
    const env = environment(input.environment), old = await this.config(db, tenantId, promoterId, env);
    const login = input.login === '' || input.login === undefined ? old.login : text(input.login, 300);
    const password = input.password === '' || input.password === undefined ? old.password : typeof input.password === 'string' && input.password.length <= 1000 && !/[\u0000-\u001f]/.test(input.password) ? input.password : '';
    if ((input.login && !login) || (input.password && !password)) throw new Error('Credenciais Presença inválidas.');
    const value: Config = { environment: env, login, password, enabled: input.enabled === true, cltEnabled: input.cltEnabled === true, fgtsEnabled: input.fgtsEnabled === undefined ? old.fgtsEnabled === true : input.fgtsEnabled === true, inssLookupEnabled: input.inssLookupEnabled === undefined ? old.inssLookupEnabled === true : input.inssLookupEnabled === true };
    if (value.enabled && env === 'homologation') throw new Error('URL de homologação atual não confirmada pelo Presença. Este ambiente pode ser salvo desativado.');
    if (value.enabled && (!login || !password)) throw new Error('Informe login e senha deste ambiente.');
    const configKey = this.configKey(promoterId), configValue = seal(value);
    await db.$transaction(async (tx: any) => {
      for (const key of [`${configKey}:${env}`, configKey]) await tx.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey: key } }, create: { tenantId, configKey: key, configValue, isSecret: true }, update: { configValue, isSecret: true } });
    });
    return this.metadata(value);
  }
  static async enabledConfig(db: any, tenantId: string, promoterId: string, env?: string) {
    await resolveBankPromoter(db, tenantId, promoterId);
    const config = await this.config(db, tenantId, promoterId, env);
    if (!config.enabled || !config.login || !config.password) throw new Error('Cadastre e habilite a conexão Presença.');
    if (config.environment !== 'production') throw new Error('URL de homologação Presença ainda não confirmada.');
    return config;
  }
  static async token(db: any, tenantId: string, promoterId: string, force = false, env?: string) {
    const config = await this.enabledConfig(db, tenantId, promoterId, env);
    const key = hash([tenantId, promoterId, config]), cached = tokens.get(key);
    if (!force && cached && cached.expires > Date.now()) return cached.token;
    let response: Response;
    try { response = await fetch(`${HOST}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ login: config.login, senha: config.password }), signal: AbortSignal.timeout(20000), redirect: 'error' }); }
    catch { throw new Error('Presença não respondeu à autenticação. Tente novamente.'); }
    const data = await response.json().catch(() => null), expires = Date.parse(data?.expireAt);
    if (!response.ok || typeof data?.token !== 'string' || !data.token || /\s/.test(data.token) || !Number.isFinite(expires) || expires <= Date.now() + 30000) throw new Error(`Presença não autenticou a conexão (HTTP ${response.status}). Confira as credenciais e a liberação no banco.`);
    for (const [id, entry] of tokens) if (entry.expires <= Date.now()) tokens.delete(id);
    if (tokens.size >= 500) tokens.delete(tokens.keys().next().value!);
    tokens.set(key, { token: data.token, expires: Math.min(expires - 30000, Date.now() + 24 * 60 * 60 * 1000) });
    return data.token as string;
  }
  static async request(db: any, tenantId: string, promoterId: string, path: string, body: unknown, method: 'POST' | 'GET' = 'POST') {
    const fgts = fgtsPaths.includes(path);
    const inssLookup = method === 'GET' && /^\/v2\/consultas\/inss\/\d{11}\/(?:beneficios|beneficio\/\d{1,20}\/detalhe)$/.test(path);
    if (!(inssLookup || method === 'POST' && (allowed.includes(path) || fgts))) throw new Error('Operação Presença não permitida nesta etapa.');
    const config = await this.enabledConfig(db, tenantId, promoterId);
    const product = inssLookup ? 'consulta INSS' : fgts ? 'FGTS' : 'CLT';
    if (!(inssLookup ? config.inssLookupEnabled : fgts ? config.fgtsEnabled : config.cltEnabled)) throw new Error(`${product} não habilitado nesta conexão Presença.`);
    const token = await this.token(db, tenantId, promoterId);
    let response: Response;
    try { response = await fetch(`${HOST}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000), redirect: 'error' }); }
    catch { throw new Error('Presença não respondeu à consulta. Tente novamente.'); }
    const data = await response.json().catch(() => null);
    // Never forward raw upstream errors: they can contain customer data and credentials.
    if (response.status === 429) { const error = new Error('Limite de consultas Presença atingido. Aguarde um minuto antes de tentar novamente.'); error.name = 'PresencaRateLimitError'; throw error; }
    if (inssLookup && (!response.ok || data === null || data?.errors?.length || data?.error || data?.code || data?.emProcessamento === true)) {
      const step = path.endsWith('/beneficios') ? 'Listar benefícios' : 'Detalhar benefício';
      const hint = response.status >= 500 ? 'O servidor Presença retornou uma falha interna. Isso não confirma falta de consentimento. Confira se o login cadastrado é o mesmo utilizado no Postman; se persistir, informe este erro ao suporte Presença.' : response.status === 401 || response.status === 403 ? 'O banco recusou o acesso. Confira as credenciais e a permissão de consulta INSS dessa conexão.' : data?.emProcessamento === true ? 'Consulta em processamento no banco. Aguarde antes de tentar novamente.' : 'O banco não retornou os dados esperados. Confira o CPF e tente novamente.';
      throw new Error(`Presença · ${step} · HTTP ${response.status}: ${hint}`);
    }
    if (!response.ok || data === null || data?.errors?.length || data?.error || data?.code || data?.emProcessamento === true) throw new Error(`Consulta Presença não concluída (HTTP ${response.status}). Confira autorização do cliente, dados e habilitação ${product}. Se estiver em processamento, aguarde antes de consultar novamente.`);
    return data;
  }
  static receipt(context: any, kind: string, data: any) { return seal({ ...context, kind, data, expires: Date.now() + 15 * 60 * 1000 }); }
  static async context(db: any, tenantId: string, userId: string, receipt: unknown, kind: string, product: Product = 'clt') {
    if (typeof receipt !== 'string') throw new Error('Recomece a consulta Presença.');
    const context = open(receipt);
    if (context.tenantId !== tenantId || context.userId !== userId || context.kind !== kind || !Number.isFinite(context.expires) || context.expires <= Date.now()) throw new Error('Consulta Presença vencida ou de outra sessão/empresa. Recomece.');
    const config = await this.enabledConfig(db, tenantId, context.promoterId);
    if (!productEnabled(config, product) || hash(config) !== context.fingerprint) throw new Error('A conexão Presença mudou. Recomece a consulta.');
    return context;
  }
  static fingerprint(config: unknown) { return hash(config); }
  static async available(db: any, tenantId: string, product: Product = 'clt') {
    const promoters = await db.promoter.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true }, orderBy: { id: 'asc' } });
    const ids: string[] = [];
    for (const promoter of promoters) { const config = await this.config(db, tenantId, promoter.id); if (config.enabled && productEnabled(config, product) && config.environment === 'production') ids.push(promoter.id); }
    return ids;
  }
  static async journey(db: any, tenantId: string, userId: string, action: string, input: any) {
    if (action === 'consent') {
      const cpf = digits(input.cpf), name = text(input.name), phone = digits(input.phone);
      if (!isValidCpf(cpf) || name.length < 3 || !/^[1-9]\d9\d{8}$/.test(phone)) throw new Error('Informe CPF válido, nome completo e celular com DDD.');
      const ids = await this.available(db, tenantId);
      if (!ids.length) throw new Error('Nenhuma conexão Presença CLT habilitada nesta empresa.');
      const results = [], messages: string[] = [];
      for (const promoterId of ids) {
        try {
          const config = await this.enabledConfig(db, tenantId, promoterId);
          const response = await this.request(db, tenantId, promoterId, '/consultas/termo-inss', { cpf, nome: name, telefone: phone, produtoId: 28 });
          const link = consentLink(response.shortUrl);
          if (!link || !text(response.autorizacaoId, 100)) throw new Error('Presença não retornou um link de consentimento reconhecido.');
          const context = { tenantId, userId, promoterId, cpf, fingerprint: hash(config) };
          results.push({ link, receipt: this.receipt(context, 'consent', { name, phone }) });
        } catch (error) { messages.push(error instanceof Error ? error.message : 'Falha na conexão Presença.'); }
      }
      if (!results.length) throw new Error([...new Set(messages)].join(' '));
      return { results, messages: [...new Set(messages)] };
    }
    if (action === 'employments') {
      const context = await this.context(db, tenantId, userId, input.receipt, 'consent');
      if (input.clientConfirmed !== true) throw new Error('Aguarde o cliente assinar o termo antes de consultar vínculos.');
      const data = await this.request(db, tenantId, context.promoterId, '/v3/operacoes/consignado-privado/consultar-vinculos', { cpf: context.cpf });
      if (!Array.isArray(data.id) || data.id.length > 100) throw new Error('Presença retornou vínculos em formato não reconhecido.');
      const choices = data.id.filter((row: any) => row.elegivel === true && digits(row.cpf) === context.cpf && text(row.matricula, 100) && /^\d{8}$/.test(String(row.numeroInscricaoEmpregador))).map((row: any) => {
        const employment = { ...context.data, registration: row.matricula, employer: row.numeroInscricaoEmpregador };
        return { registration: employment.registration, employer: employment.employer, receipt: this.receipt(context, 'employment', employment) };
      });
      return { choices, message: choices.length ? 'Vínculos ativos retornados. A disponibilidade de crédito depende da margem e das ofertas.' : 'Nenhum vínculo ativo compatível retornado.' };
    }
    if (action === 'margin') {
      const context = await this.context(db, tenantId, userId, input.receipt, 'employment');
      const data = await this.request(db, tenantId, context.promoterId, '/v3/operacoes/consignado-privado/consultar-margem', { cpf: context.cpf, matricula: context.data.registration, cnpj: context.data.employer });
      if (String(data.registroEmpregaticio) !== context.data.registration || String(data.cnpjEmpregador) !== context.data.employer || !positive(data.valorMargemDisponivel) || !/^\d{4}-\d{2}-\d{2}$/.test(data.dataNascimento) || !Number.isFinite(Date.parse(data.dataNascimento)) || !text(data.nomeMae) || !['M', 'F'].includes(data.sexo)) throw new Error('Presença não retornou margem positiva e dados completos compatíveis com o vínculo.');
      return { margin: data.valorMargemDisponivel, receipt: this.receipt(context, 'margin', { ...context.data, margin: data.valorMargemDisponivel, birthDate: data.dataNascimento, motherName: data.nomeMae, sex: data.sexo }) };
    }
    if (action === 'offers') {
      const context = await this.context(db, tenantId, userId, input.receipt, 'margin'), customer = context.data;
      if (!positive(input.installment) || input.installment > customer.margin) throw new Error('A parcela deve ser positiva e não pode ultrapassar a margem consultada.');
      const email = text(input.email, 200);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido do cliente.');
      const data = await this.request(db, tenantId, context.promoterId, '/v6/operacoes/simulacao/disponiveis', {
        tomador: { telefone: { ddd: customer.phone.slice(0, 2), numero: customer.phone.slice(2) }, cpf: context.cpf, nome: customer.name, dataNascimento: customer.birthDate, nomeMae: customer.motherName, email, sexo: customer.sex, vinculoEmpregaticio: { cnpjEmpregador: customer.employer, registroEmpregaticio: customer.registration }, dadosBancarios: { codigoBanco: null, agencia: null, conta: null, digitoConta: null, formaCredito: null }, endereco: { cep: '', rua: '', numero: '', complemento: '', cidade: '', estado: '', bairro: '' } },
        proposta: { valorSolicitado: 0, quantidadeParcelas: 0, produtoId: 28, valorParcela: input.installment }, documentos: [],
      });
      if (!Array.isArray(data) || data.length > 1000) throw new Error('Presença retornou ofertas em formato não reconhecido.');
      const offers = data.filter((row: any) => Number.isInteger(row.id) && row.id > 0 && text(row.nome) && positive(row.valorLiberado) && positive(row.valorParcela) && row.valorParcela <= customer.margin && Number.isInteger(row.prazo) && row.prazo > 0 && row.prazo <= 1000 && positive(row.taxaJuros) && row.taxaJuros <= 100 && row.tipoCredito?.id === 1 && text(row.type, 100) && row.teste === false).map((row: any) => ({ id: row.id, name: row.nome, amount: row.valorLiberado, installment: row.valorParcela, term: row.prazo, rate: row.taxaJuros, insuranceAmount: typeof row.valorSeguro === 'number' && row.valorSeguro >= 0 ? row.valorSeguro : null }));
      return { offers, message: offers.length ? 'Ofertas retornadas pelo Presença. Consulta não representa contratação.' : 'Nenhuma oferta válida disponível para esta consulta.' };
    }
    throw new Error('Etapa Presença não permitida.');
  }
}
