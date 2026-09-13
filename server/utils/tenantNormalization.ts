/**
 * Normalização e validação estrita para Slugs e Domínios Personalizados
 * Sentinel Consig - Fase 2.5
 */

export class TenantNormalization {
  /**
   * Normaliza e valida um Slug de Tenant
   * - Lowercase, trim
   * - Apenas caracteres a-z, 0-9 e hífen
   * - Sem espaços, protocolos, barras ou caracteres especiais
   * - Tamanho entre 2 e 63 caracteres
   * - Não permite hífens consecutivos ou nas extremidades
   */
  public static normalizeSlug(rawSlug: string): string {
    if (!rawSlug || typeof rawSlug !== 'string') {
      throw new Error('Slug inválido: o slug é obrigatório.');
    }

    let slug = rawSlug
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/[\/\\?#].*$/, '') // remove caminhos, querystrings
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9-]/g, '-') // substitui caracteres inválidos por hífen
      .replace(/-+/g, '-') // substitui múltiplos hífens por um só
      .replace(/^-|-$/g, ''); // remove hífens nas pontas

    if (slug.length < 2 || slug.length > 63) {
      throw new Error('Slug inválido: deve conter entre 2 e 63 caracteres.');
    }

    // Slugs reservados da plataforma
    const reservedSlugs = [
      'admin',
      'api',
      'app',
      'auth',
      'cdn',
      'dashboard',
      'dev',
      'mail',
      'platform',
      'root',
      'saas',
      'stage',
      'staging',
      'system',
      'test',
      'www',
    ];

    if (reservedSlugs.includes(slug)) {
      throw new Error(`O slug '${slug}' é reservado pelo sistema e não pode ser utilizado.`);
    }

    return slug;
  }

  /**
   * Normaliza e valida um Domínio Personalizado (Custom Domain)
   * - Lowercase, trim
   * - Remove protocolos (http://, https://)
   * - Remove portas (:3000, :443, :80)
   * - Remove caminhos e barras finais
   * - Valida formato FQDN canônico (ex: app.empresa.com.br)
   */
  public static normalizeCustomDomain(rawDomain: string | null | undefined): string | null {
    if (!rawDomain || typeof rawDomain !== 'string') {
      return null;
    }

    let domain = rawDomain.trim().toLowerCase();

    if (!domain) {
      return null;
    }

    // Remove protocolo
    domain = domain.replace(/^https?:\/\//i, '');

    // Remove caminhos, query e hash
    domain = domain.split('/')[0];
    domain = domain.split('?')[0];
    domain = domain.split('#')[0];

    // Remove porta se presente
    domain = domain.replace(/:\d+$/, '');

    // Remove ponto final se presente (ex: 'app.empresa.com.br.')
    domain = domain.replace(/\.$/, '');

    // Remove espaços residuais
    domain = domain.trim();

    if (!domain) {
      return null;
    }

    // Validação estrita de formato de domínio canônico (FQDN)
    // Pelo menos 1 ponto (ex: empresa.com ou app.empresa.com.br), labels válidos com 1-63 chars
    const domainRegex = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
    if (!domainRegex.test(domain)) {
      throw new Error(`Domínio inválido: '${rawDomain}' não possui uma estrutura de domínio válida.`);
    }

    // Não permitir registrar domínios da própria plataforma como custom domain
    if (domain.endsWith('.sentinelconsig.com.br') || domain === 'sentinelconsig.com.br') {
      throw new Error('Não é permitido registrar subdomínios da plataforma como domínio personalizado.');
    }

    return domain;
  }
}
