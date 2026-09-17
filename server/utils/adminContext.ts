/**
 * PLATFORM_MASTER Admin Context Switch Manager
 * Permite que o PLATFORM_MASTER audite e administre um tenant específico sem alterar
 * permanentemente seu tenantId ou forjar a identidade de outros usuários.
 *
 * ARQUITETURA DE PERSISTÊNCIA:
 * A fonte autoritativa primária do adminContext é a tabela `sessions` no PostgreSQL
 * (colunas: admin_target_tenant_id, admin_target_tenant_name, admin_switched_at, admin_context_expires_at).
 * O AdminContextManager mantém um cache em memória de curta duração para otimizar acessos repetidos,
 * garantindo total resiliência contra reinicialização de processos, escalonamento horizontal de contêineres
 * e novos ciclos de vida do Node.js.
 */

import type { PrismaClient } from '@prisma/client';

export interface AdminContextData {
  targetTenantId: string;
  targetTenantName: string;
  switchedByUserId?: string;
  switchedAt: Date;
  expiresAt: Date;
}

export class AdminContextManager {
  private static contexts: Map<string, AdminContextData> = new Map();
  public static CONTEXT_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

  /**
   * Registra o contexto administrativo na memória (cache) e de forma autoritativa no PostgreSQL.
   */
  public static async setContext(
    sessionId: string,
    targetTenantId: string,
    targetTenantName: string,
    switchedByUserId: string,
    prisma?: PrismaClient
  ): Promise<AdminContextData> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.CONTEXT_TTL_MS);

    const data: AdminContextData = {
      targetTenantId,
      targetTenantName,
      switchedByUserId,
      switchedAt: now,
      expiresAt,
    };

    // 1. Atualizar cache em memória
    this.contexts.set(sessionId, data);

    // 2. Persistir no PostgreSQL como fonte autoritativa
    if (prisma) {
      try {
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            adminTargetTenantId: targetTenantId,
            adminTargetTenantName: targetTenantName,
            adminSwitchedAt: now,
            adminContextExpiresAt: expiresAt,
          },
        });
      } catch (err) {
        console.error('[AdminContextManager] Erro ao persistir adminContext no banco de dados:', err);
      }
    }

    return data;
  }

  /**
   * Obtém o contexto administrativo do cache em memória.
   */
  public static getContext(sessionId: string): AdminContextData | null {
    const data = this.contexts.get(sessionId);
    if (!data) return null;

    if (data.expiresAt.getTime() < Date.now()) {
      this.contexts.delete(sessionId);
      return null;
    }

    return data;
  }

  /**
   * Alimenta o cache em memória a partir dos dados persistidos no PostgreSQL.
   */
  public static warmCache(sessionId: string, data: AdminContextData): void {
    if (data.expiresAt.getTime() >= Date.now()) {
      this.contexts.set(sessionId, data);
    }
  }

  /**
   * Limpa o contexto da sessão no cache e no banco de dados.
   */
  public static async clearContext(sessionId: string, prisma?: PrismaClient): Promise<boolean> {
    const memoryDeleted = this.contexts.delete(sessionId);

    if (prisma) {
      try {
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            adminTargetTenantId: null,
            adminTargetTenantName: null,
            adminSwitchedAt: null,
            adminContextExpiresAt: null,
          },
        });
      } catch {
        // Sessão pode já ter sido encerrada
      }
    }

    return memoryDeleted;
  }

  /**
   * Invalida qualquer sessão ativa (no cache e no PostgreSQL) vinculada ao tenant especificado.
   */
  public static async clearContextByTenantId(tenantId: string, prisma?: PrismaClient): Promise<void> {
    // 1. Limpar cache em memória
    for (const [sessionId, data] of this.contexts.entries()) {
      if (data.targetTenantId === tenantId) {
        this.contexts.delete(sessionId);
      }
    }

    // 2. Limpar no banco de dados
    if (prisma) {
      try {
        await prisma.session.updateMany({
          where: { adminTargetTenantId: tenantId },
          data: {
            adminTargetTenantId: null,
            adminTargetTenantName: null,
            adminSwitchedAt: null,
            adminContextExpiresAt: null,
          },
        });
      } catch (err) {
        console.error('[AdminContextManager] Erro ao limpar adminContext por tenantId no banco:', err);
      }
    }
  }

  /**
   * Limpa exclusivamente o cache em memória para testes de persistência / reinicialização de processo.
   */
  public static resetMemoryCacheForTesting(): void {
    this.contexts.clear();
  }
}
