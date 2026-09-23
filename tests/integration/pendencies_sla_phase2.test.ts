import { describe, it, expect, vi } from 'vitest';
import { PendencyService } from '../../server/services/pendencyService';
import { hasPermission } from '../../src/lib/permissions';

describe('Phase 2 — Central de Pendências + SLA Engine Tests', () => {
  describe('1. SLA Calculation & Matrix Configuration', () => {
    it('should calculate deadline based on priority fallback', async () => {
      const mockPrisma = {
        systemConfig: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const beforeUrgent = Date.now();
      const urgentDeadline = await PendencyService.calculateDeadline(
        mockPrisma,
        'tenant-test',
        'OUTROS',
        'URGENT'
      );
      // URGENT priority defaults to 2 hours
      const diffUrgentHours = (urgentDeadline.getTime() - beforeUrgent) / (3600 * 1000);
      expect(Math.round(diffUrgentHours)).toBe(2);

      const beforeHigh = Date.now();
      const highDeadline = await PendencyService.calculateDeadline(
        mockPrisma,
        'tenant-test',
        'OUTROS',
        'HIGH'
      );
      // HIGH priority defaults to 4 hours
      const diffHighHours = (highDeadline.getTime() - beforeHigh) / (3600 * 1000);
      expect(Math.round(diffHighHours)).toBe(4);
    });

    it('should honor custom slaHours when provided', async () => {
      const mockPrisma = {
        systemConfig: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const before = Date.now();
      const customDeadline = await PendencyService.calculateDeadline(
        mockPrisma,
        'tenant-test',
        'DOCUMENTACAO',
        'LOW',
        48
      );
      const diffHours = (customDeadline.getTime() - before) / (3600 * 1000);
      expect(Math.round(diffHours)).toBe(48);
    });

    it('should calculate SLA metrics accurately (DENTRO_SLA vs PROXIMO_SLA vs SLA_ESTOURADO)', () => {
      const baseDate = new Date('2026-09-23T10:00:00.000Z');
      const deadline = new Date('2026-09-23T20:00:00.000Z'); // 10 hours window

      // Scenario A: 2 hours in (20% elapsed, 8h remaining > 4h) -> DENTRO_SLA
      const now1 = new Date('2026-09-23T12:00:00.000Z');
      const metrics1 = PendencyService.calculateSlaMetrics({
        createdAt: baseDate,
        slaDeadline: deadline,
        status: 'ABERTA',
        now: now1,
      });
      expect(metrics1.slaStatus).toBe('DENTRO_SLA');
      expect(metrics1.remainingHours).toBe(8);
      expect(metrics1.isBreached).toBe(false);

      // Scenario B: 8 hours in (80% elapsed, 2h remaining <= 4h) -> PROXIMO_SLA
      const now2 = new Date('2026-09-23T18:00:00.000Z');
      const metrics2 = PendencyService.calculateSlaMetrics({
        createdAt: baseDate,
        slaDeadline: deadline,
        status: 'ABERTA',
        now: now2,
      });
      expect(metrics2.slaStatus).toBe('PROXIMO_SLA');
      expect(metrics2.remainingHours).toBe(2);
      expect(metrics2.isWarning).toBe(true);

      // Scenario C: 11 hours in (deadline passed by 1 hour) -> SLA_ESTOURADO
      const now3 = new Date('2026-09-23T21:00:00.000Z');
      const metrics3 = PendencyService.calculateSlaMetrics({
        createdAt: baseDate,
        slaDeadline: deadline,
        status: 'ABERTA',
        now: now3,
      });
      expect(metrics3.slaStatus).toBe('SLA_ESTOURADO');
      expect(metrics3.exceededHours).toBe(1);
      expect(metrics3.isBreached).toBe(true);

      // Scenario D: Resolved status -> RESOLVIDA
      const metrics4 = PendencyService.calculateSlaMetrics({
        createdAt: baseDate,
        slaDeadline: deadline,
        status: 'RESOLVIDA',
        resolvedAt: new Date('2026-09-23T15:00:00.000Z'),
        now: now3,
      });
      expect(metrics4.slaStatus).toBe('RESOLVIDA');
      expect(metrics4.isBreached).toBe(false);

      // Scenario E: Terminal proposal (PAGO) -> INATIVA_TERMINAL
      const metrics5 = PendencyService.calculateSlaMetrics({
        createdAt: baseDate,
        slaDeadline: deadline,
        status: 'ABERTA',
        now: now3,
        proposal: {
          standardCategory: 'PAGO',
        },
      });
      expect(metrics5.slaStatus).toBe('INATIVA_TERMINAL');
      expect(metrics5.isTerminalProposal).toBe(true);
    });
  });

  describe('2. Idempotency & Lifecycle Enforcement', () => {
    it('should enforce idempotency when sourceEventId already exists', async () => {
      const mockExisting = {
        id: 'pendency-existing-1',
        title: 'Existing Pendency',
        status: 'ABERTA',
        tenantId: 'tenant-test',
        sourceEventId: 'event-uuid-123',
      };

      const mockPrisma = {
        pendency: {
          findFirst: vi.fn().mockResolvedValue(mockExisting),
          create: vi.fn(),
        },
      } as any;

      const result = await PendencyService.createPendency(mockPrisma, {
        tenantId: 'tenant-test',
        title: 'New attempt',
        type: 'ESTEIRA',
        sourceEventId: 'event-uuid-123',
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.pendency.id).toBe('pendency-existing-1');
      expect(mockPrisma.pendency.create).not.toHaveBeenCalled();
    });

    it('should record atomic history entry via nested create when creating a new pendency', async () => {
      const mockCreated = {
        id: 'pendency-new-1',
        title: 'Documentação ilegível',
        status: 'ABERTA',
        type: 'DOCUMENTACAO',
        priority: 'MEDIUM',
        tenantId: 'tenant-test',
        createdAt: new Date(),
        slaDeadline: new Date(Date.now() + 24 * 3600 * 1000),
      };

      const mockPrisma = {
        systemConfig: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        pendency: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockCreated),
        },
      } as any;

      const result = await PendencyService.createPendency(mockPrisma, {
        tenantId: 'tenant-test',
        title: 'Documentação ilegível',
        type: 'DOCUMENTACAO',
        priority: 'MEDIUM',
        userId: 'usr-1',
        userName: 'Operador Teste',
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.pendency.id).toBe('pendency-new-1');
      expect(mockPrisma.pendency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Documentação ilegível',
            type: 'DOCUMENTACAO',
            priority: 'MEDIUM',
            status: 'ABERTA',
            histories: expect.objectContaining({
              create: expect.objectContaining({
                action: 'CRIADA',
                newStatus: 'ABERTA',
                userName: 'Operador Teste',
              }),
            }),
          }),
        })
      );
    });
  });

  describe('3. Granular RBAC Permissions for Pendencies', () => {
    it('should correctly authorize roles for pendency operations', () => {
      // SUPORTE should have pendencies.view, pendencies.create, pendencies.update, pendencies.resolve, pendencies.assign
      expect(hasPermission('SUPORTE', [], 'pendencies.view')).toBe(true);
      expect(hasPermission('SUPORTE', [], 'pendencies.create')).toBe(true);
      expect(hasPermission('SUPORTE', [], 'pendencies.update')).toBe(true);
      expect(hasPermission('SUPORTE', [], 'pendencies.resolve')).toBe(true);
      expect(hasPermission('SUPORTE', [], 'pendencies.assign')).toBe(true);

      // SUPORTE should NOT have pendencies.cancel or pendencies.admin by default
      expect(hasPermission('SUPORTE', [], 'pendencies.cancel')).toBe(false);
      expect(hasPermission('SUPORTE', [], 'pendencies.admin')).toBe(false);

      // GESTOR should have pendencies.cancel and pendencies.reopen
      expect(hasPermission('GESTOR', [], 'pendencies.cancel')).toBe(true);
      expect(hasPermission('GESTOR', [], 'pendencies.reopen')).toBe(true);

      // TENANT_ADMIN should have pendencies.admin and pendencies.delete
      expect(hasPermission('TENANT_ADMIN', [], 'pendencies.admin')).toBe(true);
      expect(hasPermission('TENANT_ADMIN', [], 'pendencies.delete')).toBe(true);

      // Custom permission override should work for any role
      expect(hasPermission('DIGITADOR', ['pendencies.resolve'], 'pendencies.resolve')).toBe(true);
    });
  });
});
