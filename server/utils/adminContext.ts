/**
 * PLATFORM_MASTER Admin Context Switch Manager
 * Permite que o PLATFORM_MASTER audite e administre um tenant específico sem alterar
 * permanentemente seu tenantId ou forjar a identidade de outros usuários.
 */

interface AdminContextData {
  targetTenantId: string;
  targetTenantName: string;
  switchedByUserId: string;
  switchedAt: Date;
  expiresAt: Date;
}

export class AdminContextManager {
  private static contexts: Map<string, AdminContextData> = new Map();
  private static CONTEXT_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

  public static setContext(
    sessionId: string,
    targetTenantId: string,
    targetTenantName: string,
    switchedByUserId: string
  ): AdminContextData {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.CONTEXT_TTL_MS);

    const data: AdminContextData = {
      targetTenantId,
      targetTenantName,
      switchedByUserId,
      switchedAt: now,
      expiresAt,
    };

    this.contexts.set(sessionId, data);
    return data;
  }

  public static getContext(sessionId: string): AdminContextData | null {
    const data = this.contexts.get(sessionId);
    if (!data) return null;

    if (data.expiresAt.getTime() < Date.now()) {
      this.contexts.delete(sessionId);
      return null;
    }

    return data;
  }

  public static clearContext(sessionId: string): boolean {
    return this.contexts.delete(sessionId);
  }
}
