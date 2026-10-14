import { integrationConfigStore, integrationCacheKey, currentIntegrationPromoter, withIntegrationPromoter, resolveBankPromoter } from './bankPromoterConfig.js';
import { PrismaClient } from '@prisma/client';
import { HappyTenantConfig, HappyAuthRequestBody, HappyAuthResponse, HappyNamespace } from './happyBankTypes.js';

interface TokenCacheEntry {
  token: string;
  cachedAt: number;
  expiresAt?: number;
  rateLimit?: number;
}

/**
 * Gerenciador de Token e Autenticação da Happy / BYX Capital.
 * 
 * Suporta isolamento estrito por tenant e por namespace:
 * - INSS: consignado-publico (/api/v1/consignado-publico/auth)
 * - CLT: consignado-privado (/api/v1/consignado-privado/auth)
 * 
 * Regras mandatórias:
 * - Cache em memória por tenantId + namespace.
 * - Deduplicação de requisições de token em voo (inFlightTokenPromises).
 * - Sem logs de token, senha ou client_secret.
 * - Sem vazamento de credenciais ou tokens para o frontend.
 * - Invalidação e renovação em caso de erro 401 ou token expirado.
 */
export class HappyTokenManager {
  private static tokenCache: Map<string, TokenCacheEntry> = new Map();
  private static inFlightTokenPromises: Map<string, Promise<string>> = new Map();

  private static getCacheKey(tenantId: string, namespace: HappyNamespace = 'public'): string {
    return `${integrationCacheKey(tenantId)}:${namespace}`;
  }

  /**
   * Invalida o token em cache para o tenant especificado (e namespace opcional).
   */
  public static invalidateToken(tenantId: string, namespace?: HappyNamespace): void {
    if (namespace) {
      this.tokenCache.delete(this.getCacheKey(tenantId, namespace));
    } else {
      this.tokenCache.delete(this.getCacheKey(tenantId, 'public'));
      this.tokenCache.delete(this.getCacheKey(tenantId, 'private'));
    }
  }

  /**
   * Limpa todo o cache de tokens (ex: para testes)
   */
  public static clearCache(): void {
    this.tokenCache.clear();
    this.inFlightTokenPromises.clear();
  }

  /**
   * Obtém token válido para o tenant e namespace ('public' | 'private').
   */
  public static async getValidToken(
    prisma: PrismaClient,
    tenantId: string,
    forceRefresh = false,
    overrideCredentials?: Partial<HappyTenantConfig>,
    namespace: HappyNamespace = 'public'
  ): Promise<string> {
    await resolveBankPromoter(prisma, tenantId, currentIntegrationPromoter(), 'DG');
    if (!overrideCredentials) {
      const store = await integrationConfigStore(prisma, tenantId, 'happy');
      const flags = await store.findMany({ where: { tenantId, configKey: { in: ['happy_ativo'] } } });
      if (!flags.some(row => row.configValue === 'true')) throw new Error('Ative a conexão Happy/BYX desta promotora antes de consultar.');
    }
    const cacheKey = this.getCacheKey(tenantId, namespace);

    if (!forceRefresh && !overrideCredentials) {
      const cached = this.tokenCache.get(cacheKey);
      if (cached?.token) {
        // Se houver tempo de expiração definido, respeita margem de segurança de 30 segundos
        if (cached.expiresAt && Date.now() >= cached.expiresAt - 30000) {
          this.tokenCache.delete(cacheKey);
        } else {
          return cached.token;
        }
      }
    }

    // Se já houver autenticação em andamento para o tenant e namespace, aguarda a mesma Promise
    if (!overrideCredentials && this.inFlightTokenPromises.has(cacheKey)) {
      return this.inFlightTokenPromises.get(cacheKey)!;
    }

    const authPromise = (async () => {
      try {
        let baseUrl = overrideCredentials?.baseUrl;
        let clientId = overrideCredentials?.clientId;
        let secret = overrideCredentials?.secret;
        let usuario = overrideCredentials?.usuario;
        let senha = overrideCredentials?.senha;

        // Se não houver override completo, busca do SystemConfig do tenant
        if (!clientId || !secret || !usuario || !senha || !baseUrl) {
          const configKeys = [
            'happy_client_id',
            'happy_secret',
            'happy_usuario',
            'happy_senha',
            'happy_base_url',
            'happy_ambiente',
            'happy_clt_client_id',
            'happy_clt_secret',
            'happy_clt_usuario',
            'happy_clt_senha',
            'happy_clt_base_url',
          ];

          const configs = await (await integrationConfigStore(prisma, tenantId, 'happy')).findMany({
            where: {
              tenantId,
              configKey: { in: configKeys },
            },
          });

          const configMap = new Map(configs.map((c) => [c.configKey, c.configValue]));

          if (namespace === 'private') {
            clientId = clientId || configMap.get('happy_clt_client_id') || configMap.get('happy_client_id') || '';
            secret = secret || configMap.get('happy_clt_secret') || configMap.get('happy_secret') || '';
            usuario = usuario || configMap.get('happy_clt_usuario') || configMap.get('happy_usuario') || '';
            senha = senha || configMap.get('happy_clt_senha') || configMap.get('happy_senha') || '';
            baseUrl = baseUrl || configMap.get('happy_clt_base_url') || ((await integrationConfigStore(prisma, tenantId, 'happy')).allowLegacy ? process.env.HAPPY_CLT_BASE_URL : undefined) || 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado';
          } else {
            clientId = clientId || configMap.get('happy_client_id') || '';
            secret = secret || configMap.get('happy_secret') || '';
            usuario = usuario || configMap.get('happy_usuario') || '';
            senha = senha || configMap.get('happy_senha') || '';
            baseUrl = baseUrl || configMap.get('happy_base_url') || ((await integrationConfigStore(prisma, tenantId, 'happy')).allowLegacy ? process.env.HAPPY_BASE_URL : undefined) || 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico';
          }
        }

        if (!clientId || !secret || !usuario || !senha) {
          throw new Error(`Credenciais da Happy (${namespace === 'private' ? 'CLT Consignado Privado' : 'INSS Consignado Público'}) incompletas para este tenant. Preencha Client ID, Secret, Usuário e Senha.`);
        }

        const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
        const authUrl = `${normalizedBaseUrl}/auth`;

        const authBody: HappyAuthRequestBody = {
          client_id: clientId,
          secret,
          usuario,
          senha,
        };

        const response = await fetch(authUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(authBody),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          let errDetail = '';
          try {
            const parsed = JSON.parse(errText);
            errDetail = parsed.message || parsed.error || errText;
          } catch {
            errDetail = errText || response.statusText;
          }

          throw new Error(
            `Falha na autenticação Happy ${namespace === 'private' ? 'CLT' : 'INSS'} (HTTP ${response.status}): ${errDetail || 'Credenciais inválidas ou serviço indisponível'}`
          );
        }

        const data: HappyAuthResponse = await response.json();
        const token = data.token_opaco || data.token || data.access_token;

        if (!token) {
          throw new Error('A API Happy respondeu com sucesso mas não retornou o token_opaco esperado.');
        }

        const expiraEmSeconds = data.expira_em || data.expires_in;
        const expiresAt = expiraEmSeconds ? Date.now() + (expiraEmSeconds * 1000) : undefined;
        const rateLimit = data.rate_limit;

        if (!overrideCredentials) {
          this.tokenCache.set(cacheKey, {
            token,
            cachedAt: Date.now(),
            expiresAt,
            rateLimit,
          });
        }

        return token;
      } finally {
        this.inFlightTokenPromises.delete(cacheKey);
      }
    })();

    if (!overrideCredentials) {
      this.inFlightTokenPromises.set(cacheKey, authPromise);
    }

    return authPromise;
  }
}
