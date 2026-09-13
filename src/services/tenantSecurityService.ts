/**
 * Tenant Security & Authorization Guard for Sentinel Consig SaaS
 * Enforces server-side tenant isolation, session integrity, and RBAC rules.
 */

import { StorageService } from './storageService';
import { User, Tenant, Role } from '../types';

export interface SecurityContext {
  userId: string;
  userEmail: string;
  role: Role;
  tenantId: string | null;
  isPlatformMaster: boolean;
  active: boolean;
}

export class TenantSecurityService {
  /**
   * Resolve and validate caller security context from session
   */
  public static getSecurityContext(): SecurityContext {
    const user = StorageService.getActiveUser();
    const isPlatformMaster = user.role === 'PLATFORM_MASTER' || user.role === 'MASTER';
    
    return {
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      tenantId: isPlatformMaster ? (user.tenantId || null) : (user.tenantId || 'DEFAULT_TENANT'),
      isPlatformMaster,
      active: user.active !== false,
    };
  }

  /**
   * Validate that the active user is authorized to access resources of a target tenant
   */
  public static assertTenantAccess(targetTenantId: string | null | undefined): boolean {
    const ctx = this.getSecurityContext();
    
    if (!ctx.active) {
      throw new Error('ACESSO NEGADO: Usuário inativo ou desabilitado.');
    }

    // Platform Master can access all tenants
    if (ctx.isPlatformMaster) {
      return true;
    }

    if (!targetTenantId) {
      return true;
    }

    if (ctx.tenantId !== targetTenantId) {
      // Log critical security breach attempt
      StorageService.addAuditLog({
        action: 'SECURITY_CROSS_TENANT_VIOLATION_BLOCKED',
        entity: 'SecurityGuard',
        entityId: targetTenantId,
        newData: JSON.stringify({
          attemptedByUserId: ctx.userId,
          userTenantId: ctx.tenantId,
          targetTenantId,
          timestamp: new Date().toISOString(),
        }),
      });

      throw new Error(`ACESSO NEGADO: Tentativa de acesso não autorizado ao Tenant ${targetTenantId}. Violação de isolamento registrada.`);
    }

    return true;
  }

  /**
   * Assert caller has required role
   */
  public static assertRole(allowedRoles: Role[]): boolean {
    const ctx = this.getSecurityContext();
    if (!allowedRoles.includes(ctx.role)) {
      throw new Error(`ACESSO NEGADO: Seu perfil (${ctx.role}) não possui permissão para esta operação.`);
    }
    return true;
  }

  /**
   * Assert caller is authorized to manage tenant lifecycle (Platform Master only)
   */
  public static assertPlatformMaster(): boolean {
    const ctx = this.getSecurityContext();
    if (!ctx.isPlatformMaster) {
      throw new Error('ACESSO NEGADO: Operação restrita ao Administrador Global da Plataforma (PLATFORM_MASTER).');
    }
    return true;
  }

  /**
   * Perform safe tenant suspension
   */
  public static suspendTenant(tenantId: string, reason?: string): Tenant {
    this.assertPlatformMaster();
    
    const tenant = StorageService.getTenantById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} não encontrado.`);
    }

    StorageService.suspendTenant(tenantId, reason);
    return StorageService.getTenantById(tenantId)!;
  }

  /**
   * Perform safe tenant soft delete with automatic pre-deletion safety backup
   */
  public static softDeleteTenant(tenantId: string, confirmationCompanyName: string): boolean {
    this.assertPlatformMaster();

    const tenant = StorageService.getTenantById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} não encontrado.`);
    }

    if (tenant.name.trim().toUpperCase() !== confirmationCompanyName.trim().toUpperCase()) {
      throw new Error(`Nome de confirmação incompatível. Esperado: "${tenant.name}", Fornecido: "${confirmationCompanyName}".`);
    }

    // Mandatory: Create pre-deletion snapshot
    const backupSnapshot = StorageService.createBackupSnapshot(`Snapshot de Segurança Pré-Exclusão (${tenant.name})`);

    // Mark as soft deleted / SUSPENDED with cancel tag
    StorageService.updateTenant({
      ...tenant,
      status: 'SUSPENDED',
      name: `[CANCELADA] ${tenant.name}`,
    });

    StorageService.addAuditLog({
      action: 'TENANT_SOFT_DELETED',
      entity: 'Tenant',
      entityId: tenantId,
      newData: JSON.stringify({
        preDeletionBackupId: backupSnapshot.id,
        backupChecksum: backupSnapshot.checksumSha256,
        deletedAt: new Date().toISOString(),
      }),
    });

    return true;
  }
}

