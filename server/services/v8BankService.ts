import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { bankPromoterConfigKey, resolveBankPromoter } from './bankPromoterConfig.js';

type Environment = 'production' | 'homologation';
type Config = { environment: Environment; enabled: boolean; fgtsEnabled: boolean; cltEnabled: boolean; username: string; password: string; clientId: string; audience: string };
const tokenCache = new Map<string, { token: string; expires: number }>();
const BASE = 'https://bff.v8sistema.com';
const AUTH = 'https://auth.v8sistema.com/oauth/token';
function environment(value: unknown): Environment {
  if (value !== 'production' && value !== 'homologation') throw new Error('Selecione um ambiente válido.');
  return value;
}
function key() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('Segredo de autenticação não configurado.');
  return createHash('sha256').update(`sentinel:v8:${secret}`).digest();
}
function seal(value: Config, scope: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(scope));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
function open(value: string, scope: string): Config {
  try {
    const parts = value.split('.');
    if (parts.length !== 3) throw new Error();
    const [iv, tag, data] = parts.map(p => Buffer.from(p, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', key(), iv);
    cipher.setAAD(Buffer.from(scope)); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
  } catch { throw new Error('Não foi possível abrir as credenciais V8 desta conexão.'); }
}
export class V8BankService {
  static async config(db: any, tenantId: string, promoterId: string, requested?: unknown): Promise<Config> {
    await resolveBankPromoter(db, tenantId, promoterId);
    const env = requested === undefined ? undefined : environment(requested);
    const configKey = bankPromoterConfigKey('v8', promoterId, env ? `config:${env}` : 'config');
    const row = await db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey } } });
    return row ? open(row.configValue, `${tenantId}:${promoterId}`) : { environment: env || 'production', enabled: false, fgtsEnabled: false, cltEnabled: false, username: '', password: '', clientId: '', audience: '' };
  }
  static metadata(config: Config) {
    return { environment: config.environment, enabled: config.enabled, fgtsEnabled: config.fgtsEnabled, cltEnabled: config.cltEnabled,
      hasCredentials: !!(config.username && config.password && config.clientId && config.audience),
      configuredFields: Object.fromEntries(['username', 'password', 'clientId', 'audience'].map(field => [field, !!config[field as keyof Config]])),
      apiUrl: config.environment === 'production' ? BASE : null, authUrl: config.environment === 'production' ? AUTH : null, homologationAvailable: false };
  }
  static async save(db: any, tenantId: string, promoterId: string, input: any) {
    const env = environment(input.environment), old = await this.config(db, tenantId, promoterId, env);
    const value: Config = { ...old, environment: env, enabled: input.enabled === true, fgtsEnabled: input.fgtsEnabled === true, cltEnabled: input.cltEnabled === true };
    for (const field of ['username', 'password', 'clientId', 'audience'] as const) {
      if (input[field] === undefined || input[field] === '') continue;
      if (typeof input[field] !== 'string' || input[field].length > 1000 || /[\u0000-\u001f]/.test(input[field]) || !input[field].trim()) throw new Error('Informe credenciais V8 válidas.');
      value[field] = field === 'password' ? input[field] : input[field].trim();
    }
    if (value.enabled && env === 'homologation') throw new Error('O endereço de homologação V8 ainda precisa ser confirmado. Salve este ambiente desativado.');
    if (value.enabled && !this.metadata(value).hasCredentials) throw new Error('Informe e-mail, senha, client_id e audience deste ambiente.');
    const configValue = seal(value, `${tenantId}:${promoterId}`);
    await db.$transaction(async (tx: any) => {
      for (const suffix of [`config:${env}`, 'config']) {
        const configKey = bankPromoterConfigKey('v8', promoterId, suffix);
        await tx.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue, isSecret: true }, update: { configValue, isSecret: true } });
      }
    });
    return this.metadata(value);
  }
  static async token(db: any, tenantId: string, promoterId: string, env: unknown, force = false) {
    const config = await this.config(db, tenantId, promoterId, env);
    if (config.environment !== 'production') throw new Error('Endereço de homologação V8 ainda não confirmado.');
    if (!config.enabled || !this.metadata(config).hasCredentials) throw new Error('Salve as credenciais e habilite a conexão V8 neste ambiente.');
    const cacheKey = createHash('sha256').update(JSON.stringify([tenantId, promoterId, config])).digest('hex');
    const cached = tokenCache.get(cacheKey);
    if (!force && cached && cached.expires > Date.now()) return { token: cached.token, config };
    let response: Response;
    try {
      response = await fetch(AUTH, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'password', username: config.username, password: config.password, audience: config.audience, scope: 'offline_access', client_id: config.clientId }) });
    } catch { throw new Error('Não foi possível alcançar a autenticação V8. Tente novamente em instantes.'); }
    const data = await response.json().catch(() => null), ttl = Number(data?.expires_in);
    if (!response.ok || data?.error || typeof data?.access_token !== 'string' || !data.access_token || /\s/.test(data.access_token) || !Number.isFinite(ttl) || ttl <= 30 || String(data?.token_type).toLowerCase() !== 'bearer') throw new Error(`V8 não autenticou a conexão (HTTP ${response.status}). Confira as credenciais e a liberação na V8.`);
    for (const [id, entry] of tokenCache) if (entry.expires <= Date.now()) tokenCache.delete(id);
    if (tokenCache.size >= 500) tokenCache.delete(tokenCache.keys().next().value!);
    tokenCache.set(cacheKey, { token: data.access_token, expires: Date.now() + (Math.min(ttl, 86400) - 30) * 1000 });
    return { token: data.access_token as string, config };
  }
  static async diagnostic(db: any, tenantId: string, promoterId: string, env: unknown) {
    const { token, config } = await this.token(db, tenantId, promoterId, env, true);
    const checks = await Promise.all(([
      ...(config.fgtsEnabled ? [{ product: 'FGTS', path: '/fgts/simulations/fees/new', field: 'data' }] : []),
      ...(config.cltEnabled ? [{ product: 'CLT', path: '/private-consignment/simulation/configs', field: 'configs' }] : []),
    ]).map(async check => {
      try {
        const response = await fetch(`${BASE}${check.path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20000) });
        const data = await response.json().catch(() => null);
        const rows = Array.isArray(data) ? data : data?.[check.field];
        return { product: check.product, httpStatus: response.status, available: response.ok && !data?.error && Array.isArray(rows), tableCount: Array.isArray(rows) ? rows.length : 0 };
      } catch { return { product: check.product, httpStatus: null, available: false, tableCount: 0 }; }
    }));
    return { authenticated: true, message: 'Autenticação V8 concluída. Consulte abaixo a disponibilidade dos produtos selecionados.', checks };
  }
}
