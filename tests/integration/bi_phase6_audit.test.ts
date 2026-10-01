import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BIService } from '../../server/services/biService.js';
import { BIComparisonService } from '../../server/services/biComparisonService.js';
import { CentralEventBus } from '../../server/services/eventBus.js';
import { hasPermission } from '../../src/lib/permissions.js';
import { StandardStatusCategory, ProposalType } from '@prisma/client';

describe('FASE 6 — AUDITORIA TÉCNICA DO BI OPERACIONAL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // 1. ISOLAMENTO MULTI-TENANT
  // =========================================================================
  describe('1. Multi-Tenant Isolation Verification', () => {
    it('deve garantir que todas as queries filtram estritamente por tenantId do contexto', async () => {
      const mockFindMany = vi.fn().mockResolvedValue([]);
      const mockCount = vi.fn().mockResolvedValue(0);
      const mockAggregate = vi.fn().mockResolvedValue({ _sum: { contractValue: 0, releasedValue: 0 } });

      const prisma = {
        proposal: { findMany: mockFindMany, count: mockCount, aggregate: mockAggregate },
        simulationRequest: { count: mockCount, aggregate: mockAggregate },
        pendency: { count: mockCount, findMany: mockFindMany },
        integrationHealthLog: { findMany: mockFindMany, count: mockCount },
        partner: { findMany: mockFindMany },
        user: { findMany: mockFindMany },
        bank: { findMany: mockFindMany },
        product: { findMany: mockFindMany },
        convenio: { findMany: mockFindMany },
      } as any;

      await BIService.getOverview(prisma, 'tenant_alpha', {});

      expect(mockFindMany).toHaveBeenCalled();
      const whereClause = mockFindMany.mock.calls[0][0].where;
      expect(whereClause.tenantId).toBe('tenant_alpha');
    });

    it('não deve permitir vazamento de dados entre Tenant A e Tenant B no overview', async () => {
      const tenantAProposals = [
        {
          id: 'prop_A1',
          tenantId: 'tenant_A',
          contractValue: 5000,
          releasedValue: 4000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-20T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago ao Cliente' },
        },
      ];

      const prisma = {
        proposal: {
          findMany: vi.fn().mockImplementation((args: any) => {
            if (args.where.tenantId === 'tenant_A') return Promise.resolve(tenantAProposals);
            if (args.where.tenantId === 'tenant_B') return Promise.resolve([]);
            return Promise.resolve([]);
          }),
          count: vi.fn().mockImplementation((args: any) => {
            if (args.where.tenantId === 'tenant_A') return Promise.resolve(1);
            return Promise.resolve(0);
          }),
        },
        pendency: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const resA = await BIService.getOverview(prisma, 'tenant_A', {});
      expect(resA.tenantId).toBe('tenant_A');
      expect(resA.paidProduction.value).toBe(4000);
      expect(resA.paidProduction.count).toBe(1);

      const resB = await BIService.getOverview(prisma, 'tenant_B', {});
      expect(resB.tenantId).toBe('tenant_B');
      expect(resB.paidProduction.value).toBe(0);
      expect(resB.paidProduction.count).toBe(0);
    });
  });

  // =========================================================================
  // 2. MATEMÁTICA DETERMINÍSTICA CONTROLADA
  // =========================================================================
  describe('2. Controlled Mathematical Verification', () => {
    it('deve calcular corretamente soma bruta, troco líquido, pagas, ticket médio e conversão', async () => {
      // 4 proposals: 2 PAGAS (R$ 10.000 bruto / R$ 8.000 liq, R$ 20.000 bruto / R$ 16.000 liq)
      // 1 CANCELADA (R$ 5.000 bruto)
      // 1 EM ANDAMENTO (R$ 15.000 bruto / R$ 12.000 liq)
      // Total = 4 propostas, Bruto = R$ 50.000, Líquido = R$ 36.000
      // Pagas = 2, Valor Pago = R$ 24.000, Conversão = 2/4 = 50%, Ticket Médio Líquido = 24.000 / 2 = R$ 12.000
      const deterministicProposals = [
        {
          id: 'p1',
          contractValue: 10000,
          releasedValue: 8000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago' },
        },
        {
          id: 'p2',
          contractValue: 20000,
          releasedValue: 16000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-12T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago' },
        },
        {
          id: 'p3',
          contractValue: 5000,
          releasedValue: 0,
          standardCategory: StandardStatusCategory.CANCELADO,
          createdAt: new Date('2026-09-14T10:00:00Z'),
          status: { code: 'CANCELADO', standardCategory: StandardStatusCategory.CANCELADO, name: 'Cancelado' },
        },
        {
          id: 'p4',
          contractValue: 15000,
          releasedValue: 12000,
          standardCategory: StandardStatusCategory.ESTEIRA,
          createdAt: new Date('2026-09-15T10:00:00Z'),
          status: { code: 'EM_DIGITACAO', standardCategory: StandardStatusCategory.ESTEIRA, name: 'Em Digitação' },
        },
      ];

      const prisma = {
        proposal: {
          findMany: vi.fn().mockResolvedValue(deterministicProposals),
          count: vi.fn().mockResolvedValue(4),
        },
        pendency: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const overview = await BIService.getOverview(prisma, 'tenant_math', {});

      expect(overview.totalProposals).toBe(4);
      expect(overview.totalGrossValue).toBe(50000);
      expect(overview.totalNetValue).toBe(36000);
      expect(overview.paidProduction.count).toBe(2);
      expect(overview.paidProduction.value).toBe(24000);
      expect(overview.conversionRatePercent).toBe(50);
      expect(overview.avgTicketNet).toBe(12000);
      expect(overview.cancelledProduction.count).toBe(1);
      expect(overview.cancelledProduction.value).toBe(5000);
      expect(overview.cancelledProduction.ratePercent).toBe(25);
    });
  });

  // =========================================================================
  // 3. DEFESA CONTRA DIVISÃO POR ZERO
  // =========================================================================
  describe('3. Division by Zero Defense (Empty Datasets)', () => {
    it('deve retornar zeros e N/A sem emitir NaN, Infinity ou null', async () => {
      const prisma = {
        proposal: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
        pendency: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
        simulationRequest: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
        bank: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        product: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        convenio: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        partner: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
        user: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
        integrationHealthLog: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      } as any;

      const overview = await BIService.getOverview(prisma, 'tenant_empty', {});
      expect(Number.isNaN(overview.conversionRatePercent)).toBe(false);
      expect(Number.isFinite(overview.conversionRatePercent)).toBe(true);
      expect(overview.conversionRatePercent).toBe(0);
      expect(overview.avgTicketNet).toBe(0);

      const funnel = await BIService.getConversionFunnel(prisma, 'tenant_empty', {});
      expect(funnel.stages).toHaveLength(4);
      expect(funnel.summary.overallFunnelConversionPercent).toBeNull(); // N/A correctly represented

      const banks = await BIService.getBanks(prisma, 'tenant_empty', {});
      expect(banks.banks).toEqual([]);
      expect(banks.summary.totalGrossValue).toBe(0);

      const health = await BIService.getOperationalHealth(prisma, 'tenant_empty', {});
      expect(health.proposals.status).toBe('SAUDAVEL');
      expect(health.pendencies.compliancePercent).toBe(100);
    });
  });

  // =========================================================================
  // 4. COMPARAÇÃO DE PERÍODOS & CÁLCULO DE DELTAS
  // =========================================================================
  describe('4. Period Comparison & Deltas', () => {
    it('deve calcular deltas percentuais positivos, negativos e quando base anterior for zero', () => {
      // 1. Double increase: from 50 to 100 (+100%)
      const deltaPos = BIComparisonService.calculateDelta(100, 50);
      expect(deltaPos.deltaPercent).toBe(100);
      expect(deltaPos.trend).toBe('CRESCIMENTO');

      // 2. Drop by half: from 100 to 50 (-50%)
      const deltaNeg = BIComparisonService.calculateDelta(50, 100);
      expect(deltaNeg.deltaPercent).toBe(-50);
      expect(deltaNeg.trend).toBe('QUEDA');

      // 3. Stability: from 100 to 100 (0%)
      const deltaStable = BIComparisonService.calculateDelta(100, 100);
      expect(deltaStable.deltaPercent).toBe(0);
      expect(deltaStable.trend).toBe('ESTABILIDADE');

      // 4. Previous period is 0, current is 100 (+100% without dividing by zero)
      const deltaZeroPrev = BIComparisonService.calculateDelta(100, 0);
      expect(deltaZeroPrev.deltaPercent).toBe(100);
      expect(deltaZeroPrev.trend).toBe('CRESCIMENTO');

      // 5. Both are 0 (0% delta)
      const deltaBothZero = BIComparisonService.calculateDelta(0, 0);
      expect(deltaBothZero.deltaPercent).toBe(0);
      expect(deltaBothZero.trend).toBe('ESTABILIDADE');
    });
  });

  // =========================================================================
  // 5. RBAC & PROTEÇÃO DE ACESSO
  // =========================================================================
  describe('5. RBAC Authorization Checks', () => {
    it('deve permitir acesso para usuário com permissão bi.view ou role TENANT_ADMIN/GESTOR', () => {
      expect(hasPermission('TENANT_ADMIN', [], 'bi.view')).toBe(true);
      expect(hasPermission('TENANT_ADMIN', [], 'bi.export')).toBe(true);
      expect(hasPermission('GESTOR', [], 'bi.view')).toBe(true);
      expect(hasPermission('GERENTE', [], 'bi.view')).toBe(true);
    });

    it('deve negar acesso para usuário sem permissão de BI', () => {
      expect(hasPermission('DIGITADOR', [], 'bi.view')).toBe(false);
      expect(hasPermission('DIGITADOR', [], 'bi.export')).toBe(false);
      expect(hasPermission('SIMULACAO', [], 'bi.view')).toBe(false);
    });
  });

  // =========================================================================
  // 6. GARGALOS, CANCELAMENTOS & RECUSAS
  // =========================================================================
  describe('6. Bottlenecks, Cancellations and Refusals', () => {
    it('deve identificar motivos reais de cancelamento e recusa sem inventar dados', async () => {
      const cancelledProposals = [
        {
          id: 'c1',
          contractValue: 8000,
          createdAt: new Date('2026-09-18T10:00:00Z'),
          c6ActivityDescription: 'Desistência expressa pelo cliente',
          factaRawStatus: null,
          bank: { id: 'b1', name: 'Banco C6' },
          product: { id: 'p1', name: 'Portabilidade' },
          partner: { id: 'pa1', name: 'Parceiro X' },
          status: { name: 'Cancelado' },
        },
      ];

      const refusedProposals = [
        {
          id: 'r1',
          contractValue: 12000,
          createdAt: new Date('2026-09-19T10:00:00Z'),
          c6ActivityDescription: null,
          factaRawStatus: 'Margem consignável insuficiente',
          bank: { id: 'b2', name: 'Facta Financeira' },
          product: { id: 'p2', name: 'Novo INSS' },
          partner: { id: 'pa2', name: 'Parceiro Y' },
          status: { name: 'Reprovado Crivo' },
        },
      ];

      const prisma = {
        proposal: {
          findMany: vi.fn().mockImplementation((args: any) => {
            const isCancelledQuery = args.where.OR?.some((cond: any) =>
              cond.standardCategory === StandardStatusCategory.CANCELADO || cond.status?.code === 'CANCELADO'
            );
            if (isCancelledQuery) {
              return Promise.resolve(cancelledProposals);
            }
            return Promise.resolve(refusedProposals);
          }),
          count: vi.fn().mockResolvedValue(1),
        },
      } as any;

      const cancRes = await BIService.getCancellations(prisma, 'tenant_gargalos', {});
      expect(cancRes.summary.totalCancelledCount).toBe(1);
      expect(cancRes.summary.totalCancelledValue).toBe(8000);
      expect(cancRes.reasons[0].reason).toBe('Desistência expressa pelo cliente');

      const refRes = await BIService.getRefusals(prisma, 'tenant_gargalos', {});
      expect(refRes.summary.totalRefusedCount).toBe(1);
      expect(refRes.summary.totalRefusedValue).toBe(12000);
      expect(refRes.reasons[0].reason).toBe('Margem consignável insuficiente');
    });
  });

  // =========================================================================
  // 7. TELEMETRIA DO HUB DE INTEGRAÇÕES
  // =========================================================================
  describe('7. Integration Telemetry Aggregation', () => {
    it('deve consolidar taxa de sucesso, latência média e incidentes dos provedores C6, FACTA, BMG, HAPPY', async () => {
      const logs = [
        {
          bank: 'C6',
          httpStatus: 200,
          latencyMs: 150,
          success: true,
          timestamp: new Date('2026-09-21T10:00:00Z'),
        },
        {
          bank: 'C6',
          httpStatus: 500,
          latencyMs: 400,
          success: false,
          timestamp: new Date('2026-09-21T10:01:00Z'),
        },
      ];

      const prisma = {
        integrationHealthLog: {
          findMany: vi.fn().mockResolvedValue(logs),
        },
      } as any;

      const telemetry = await BIService.getIntegrations(prisma, 'tenant_int', {});

      expect(telemetry.summary.totalRequests).toBe(2);
      expect(telemetry.summary.totalSuccess).toBe(1);
      expect(telemetry.summary.totalErrors).toBe(1);
      expect(telemetry.summary.globalSuccessRatePercent).toBe(50);
      expect(telemetry.summary.globalAvgLatencyMs).toBe(275);
    });
  });

  // =========================================================================
  // 8. CENTRAL DE EVENTOS & REALTIME
  // =========================================================================
  describe('8. Central EventBus & Realtime Notifications', () => {
    it('deve disparar e rotear eventos de domínio para o barramento unificado', () => {
      const eventBus = CentralEventBus.getInstance();
      const eventSpy = vi.fn();

      eventBus.on('PROPOSAL_PAID', eventSpy);

      eventBus.publish({
        tenantId: 'tenant_rt',
        eventType: 'PROPOSAL_PAID',
        entityId: 'prop_999',
        data: { amount: 5000, bank: 'C6' },
      });

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].entityId).toBe('prop_999');
      expect(eventSpy.mock.calls[0][0].eventType).toBe('PROPOSAL_PAID');
    });
  });

  // =========================================================================
  // 9. PRODUTOS, CONVÊNIOS, PARCEIROS & OPERADORES
  // =========================================================================
  describe('9. Dimensions Aggregations (Products, Convenios, Partners, Operators)', () => {
    it('deve agregar produtos, parceiros e operadores com respeito a dados reais', async () => {
      const sampleProposals = [
        {
          id: 'p_prod_1',
          productId: 'prod_1',
          product: { id: 'prod_1', code: 'MARGEM_LIVRE', name: 'Margem Livre', type: 'NOVO' },
          convenioId: 'conv_1',
          convenio: { id: 'conv_1', name: 'INSS' },
          partnerId: 'part_1',
          partner: { id: 'part_1', code: 'PARC1', name: 'Parceiro Alpha' },
          createdById: 'user_1',
          contractValue: 10000,
          releasedValue: 8000,
          standardCategory: StandardStatusCategory.PAGO,
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO },
        },
      ];

      const prisma = {
        proposal: {
          findMany: vi.fn().mockResolvedValue(sampleProposals),
        },
        product: {
          findMany: vi.fn().mockResolvedValue([{ id: 'prod_1', code: 'MARGEM_LIVRE', name: 'Margem Livre', type: 'NOVO' }]),
        },
        convenio: {
          findMany: vi.fn().mockResolvedValue([{ id: 'conv_1', name: 'INSS' }]),
        },
        partner: {
          findMany: vi.fn().mockResolvedValue([{ id: 'part_1', code: 'PARC1', name: 'Parceiro Alpha', status: 'ATIVO' }]),
        },
        partnerInteraction: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        partnerTask: {
          groupBy: vi.fn().mockResolvedValue([]),
          findMany: vi.fn().mockResolvedValue([]),
        },
        pendency: {
          groupBy: vi.fn().mockResolvedValue([]),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
        user: {
          findMany: vi.fn().mockResolvedValue([{ id: 'user_1', name: 'Operador 1', email: 'op1@test.com', role: 'DIGITADOR' }]),
        },
      } as any;

      const prods = await BIService.getProducts(prisma, 'tenant_dim', {});
      expect(prods.products).toHaveLength(1);
      expect(prods.products[0].productName).toBe('Margem Livre');
      expect(prods.products[0].paidValue).toBe(8000);

      const convs = await BIService.getConvenios(prisma, 'tenant_dim', {});
      expect(convs.convenios).toHaveLength(1);
      expect(convs.convenios[0].convenioName).toBe('INSS');

      const parts = await BIService.getPartners(prisma, 'tenant_dim', {});
      expect(parts.partners).toHaveLength(1);
      expect(parts.partners[0].partnerName).toBe('Parceiro Alpha');

      const ops = await BIService.getOperators(prisma, 'tenant_dim', {});
      expect(ops.operators).toHaveLength(1);
      expect(ops.operators[0].userName).toBe('Operador 1');
    });
  });

  // =========================================================================
  // 10. SLA, PENDÊNCIAS & EXCLUSÃO DE TERMINAIS
  // =========================================================================
  describe('10. SLA & Pendencies Analytics with Terminal Status Exclusions', () => {
    it('deve contabilizar pendências abertas, resolvidas e SLA estourado sem contar operações canceladas/terminais', async () => {
      const now = new Date();
      const overdueDate = new Date(now.getTime() - 48 * 3600 * 1000); // 48 hours ago

      const pendencies = [
        {
          id: 'pend_1',
          tenantId: 'tenant_sla',
          status: 'ABERTA',
          priority: 'HIGH',
          slaDeadline: overdueDate,
          resolvedAt: null,
          createdAt: overdueDate,
          proposalId: 'prop_active',
          proposal: { id: 'prop_active', proposalNumber: 'PROP-ACTIVE', standardCategory: StandardStatusCategory.ANDAMENTO },
          assignedTo: { id: 'u1', name: 'Analista 1' },
          category: 'DOCUMENTACAO',
          reason: 'Comprovante ilegível',
        },
        {
          id: 'pend_2',
          tenantId: 'tenant_sla',
          status: 'RESOLVIDA',
          priority: 'MEDIUM',
          slaDeadline: new Date(now.getTime() + 24 * 3600 * 1000),
          resolvedAt: new Date(now.getTime() - 2 * 3600 * 1000),
          createdAt: new Date(now.getTime() - 6 * 3600 * 1000),
          proposalId: 'prop_resolved',
          proposal: { id: 'prop_resolved', proposalNumber: 'PROP-RES', standardCategory: StandardStatusCategory.PAGO },
          assignedTo: { id: 'u1', name: 'Analista 1' },
          category: 'ASSINATURA',
          reason: 'Assinatura validada',
        },
      ];

      const prisma = {
        pendency: {
          findMany: vi.fn().mockResolvedValue(pendencies),
          count: vi.fn().mockResolvedValue(2),
        },
        proposal: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const slaRes = await BIService.getPendencies(prisma, 'tenant_sla', {});

      expect(slaRes.summary.totalCreated).toBe(2);
      expect(slaRes.summary.openCount).toBe(1);
      expect(slaRes.summary.resolvedCount).toBe(1);
      expect(slaRes.summary.overSlaCount).toBe(1);
    });
  });

  // =========================================================================
  // 11. GARGALOS & CONCENTRAÇÃO OPERACIONAL
  // =========================================================================
  describe('11. Operational Bottlenecks & Concentrations', () => {
    it('deve identificar estágios com maior concentração e volume represado', async () => {
      const proposalsInQueue = [
        {
          id: 'p_b1',
          statusId: 'st_crivo',
          status: { id: 'st_crivo', name: 'Análise de Crédito / Crivo', code: 'CRIVO', standardCategory: StandardStatusCategory.ANDAMENTO },
          contractValue: 50000,
          releasedValue: 40000,
          createdAt: new Date('2026-09-20T08:00:00Z'),
          updatedAt: new Date('2026-09-20T12:00:00Z'),
        },
      ];

      const prisma = {
        proposal: {
          findMany: vi.fn().mockResolvedValue(proposalsInQueue),
          count: vi.fn().mockResolvedValue(1),
        },
        pendency: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
        integrationHealthLog: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      } as any;

      const bottlenecks = await BIService.getBottlenecks(prisma, 'tenant_bot', {});

      expect(bottlenecks.statusDistribution).toHaveLength(1);
      expect(bottlenecks.statusDistribution[0].statusName).toBe('Análise de Crédito / Crivo');
      expect(bottlenecks.statusDistribution[0].value).toBe(50000);
      expect(bottlenecks.statusDistribution[0].count).toBe(1);
    });
  });

  // =========================================================================
  // 12. COMPARAÇÃO ENTRE PERÍODOS (BIComparisonService)
  // =========================================================================
  describe('12. Full Period Comparison Service', () => {
    it('deve comparar período atual com período anterior calculando deltas para todos os KPIs', async () => {
      // Keep MES_ATUAL deterministic; fixtures below represent September 2026.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));

      const currentProposals = [
        {
          id: 'cp1',
          contractValue: 10000,
          releasedValue: 8000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-20T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago' },
        },
      ];

      const previousProposals = [
        {
          id: 'pp1',
          contractValue: 5000,
          releasedValue: 4000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-08-20T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago' },
        },
      ];

      const prisma = {
        proposal: {
          findMany: vi.fn().mockImplementation((args: any) => {
            const gte = args.where.createdAt.gte;
            const isCurrent = gte.getUTCMonth ? gte.getUTCMonth() === 8 || gte.getMonth() === 8 : true;
            return Promise.resolve(isCurrent ? currentProposals : previousProposals);
          }),
          count: vi.fn().mockResolvedValue(1),
        },
        simulationRequest: {
          count: vi.fn().mockResolvedValue(2),
        },
        pendency: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const comp = await BIComparisonService.getComparison(prisma, 'tenant_comp', { period: 'MES_ATUAL' });

      expect(comp.metrics.grossProduction.current).toBe(10000);
      expect(comp.metrics.grossProduction.deltaPercent).toBe(100);
      expect(comp.metrics.grossProduction.trend).toBe('CRESCIMENTO');
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // 13. RESOLUÇÃO DE FILTROS & SANITIZAÇÃO NO BACKEND
  // =========================================================================
  describe('13. Filter Resolution & Proposal Where Clause Builder', () => {
    it('deve construir cláusula where respeitando múltiplos filtros simultâneos', () => {
      const filters = {
        period: 'PERSONALIZADO' as const,
        startDate: '2026-09-01',
        endDate: '2026-09-20',
        bankId: 'bank_c6',
        partnerId: 'part_master',
        productId: 'prod_fgts',
        statusId: 'stat_pago',
        standardCategory: StandardStatusCategory.PAGO,
      };

      const dateRange = BIService.resolveDateRange(filters);
      const where = BIService.buildProposalWhere('tenant_filt', filters, dateRange);

      expect(where.tenantId).toBe('tenant_filt');
      expect(where.bankId).toBe('bank_c6');
      expect(where.partnerId).toBe('part_master');
      expect(where.productId).toBe('prod_fgts');
      expect(where.statusId).toBe('stat_pago');
      expect(where.standardCategory).toBe(StandardStatusCategory.PAGO);
      expect(where.createdAt).toBeDefined();
    });
  });

  // =========================================================================
  // 14. VALIDAÇÃO ESPECÍFICA DO TICKET MÉDIO (PAGO)
  // =========================================================================
  describe('14. Ticket Médio (Pago) Precise Scenarios', () => {
    const buildMockPrisma = (proposals: any[]) => {
      return {
        proposal: {
          findMany: vi.fn().mockResolvedValue(proposals),
          count: vi.fn().mockResolvedValue(proposals.length),
        },
        pendency: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;
    };

    it('1. 1 proposta REPROVADA -> Volume Pago = 0, Contratos Pagos = 0, Ticket Médio = 0', async () => {
      const proposals = [
        {
          id: 'p_reprovado',
          contractValue: 14995.64,
          releasedValue: 0,
          standardCategory: StandardStatusCategory.RECUSADO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'REPROVADO', standardCategory: StandardStatusCategory.RECUSADO, name: 'Reprovado' },
        },
      ];
      const prisma = buildMockPrisma(proposals);
      const overview = await BIService.getOverview(prisma, 'tenant_test', {});
      expect(overview.paidProduction.count).toBe(0);
      expect(overview.paidProduction.value).toBe(0);
      expect(overview.avgTicketNet).toBe(0);
    });

    it('2. 1 proposta CANCELADA -> Volume Pago = 0, Contratos Pagos = 0, Ticket Médio = 0', async () => {
      const proposals = [
        {
          id: 'p_cancelado',
          contractValue: 14995.64,
          releasedValue: 0,
          standardCategory: StandardStatusCategory.CANCELADO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'CANCELADO', standardCategory: StandardStatusCategory.CANCELADO, name: 'Cancelado' },
        },
      ];
      const prisma = buildMockPrisma(proposals);
      const overview = await BIService.getOverview(prisma, 'tenant_test', {});
      expect(overview.paidProduction.count).toBe(0);
      expect(overview.paidProduction.value).toBe(0);
      expect(overview.avgTicketNet).toBe(0);
    });

    it('3. 1 proposta PAGA de R$ 10.000 -> Volume Pago = R$ 10.000, Contratos Pagos = 1, Ticket Médio = R$ 10.000', async () => {
      const proposals = [
        {
          id: 'p_pago',
          contractValue: 12000,
          releasedValue: 10000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago ao Cliente' },
        },
      ];
      const prisma = buildMockPrisma(proposals);
      const overview = await BIService.getOverview(prisma, 'tenant_test', {});
      expect(overview.paidProduction.count).toBe(1);
      expect(overview.paidProduction.value).toBe(10000);
      expect(overview.avgTicketNet).toBe(10000);
    });

    it('4. 2 propostas PAGAS: R$ 10.000 + R$ 20.000 -> Volume Pago = R$ 30.000, Contratos Pagos = 2, Ticket Médio = R$ 15.000', async () => {
      const proposals = [
        {
          id: 'p_pago1',
          contractValue: 12000,
          releasedValue: 10000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago ao Cliente' },
        },
        {
          id: 'p_pago2',
          contractValue: 24000,
          releasedValue: 20000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-11T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago ao Cliente' },
        },
      ];
      const prisma = buildMockPrisma(proposals);
      const overview = await BIService.getOverview(prisma, 'tenant_test', {});
      expect(overview.paidProduction.count).toBe(2);
      expect(overview.paidProduction.value).toBe(30000);
      expect(overview.avgTicketNet).toBe(15000);
    });

    it('5. 1 PAGA + 1 REPROVADA: apenas a paga entra no cálculo.', async () => {
      const proposals = [
        {
          id: 'p_pago',
          contractValue: 12000,
          releasedValue: 10000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago ao Cliente' },
        },
        {
          id: 'p_reprovado',
          contractValue: 14995.64,
          releasedValue: 0,
          standardCategory: StandardStatusCategory.RECUSADO,
          createdAt: new Date('2026-09-12T10:00:00Z'),
          status: { code: 'REPROVADO', standardCategory: StandardStatusCategory.RECUSADO, name: 'Reprovado' },
        },
      ];
      const prisma = buildMockPrisma(proposals);
      const overview = await BIService.getOverview(prisma, 'tenant_test', {});
      expect(overview.paidProduction.count).toBe(1);
      expect(overview.paidProduction.value).toBe(10000);
      expect(overview.avgTicketNet).toBe(10000);
    });

    it('6. 1 PAGA + 1 CANCELADA: apenas a paga entra no cálculo.', async () => {
      const proposals = [
        {
          id: 'p_pago',
          contractValue: 12000,
          releasedValue: 10000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago ao Cliente' },
        },
        {
          id: 'p_cancelado',
          contractValue: 14995.64,
          releasedValue: 0,
          standardCategory: StandardStatusCategory.CANCELADO,
          createdAt: new Date('2026-09-12T10:00:00Z'),
          status: { code: 'CANCELADO', standardCategory: StandardStatusCategory.CANCELADO, name: 'Cancelado' },
        },
      ];
      const prisma = buildMockPrisma(proposals);
      const overview = await BIService.getOverview(prisma, 'tenant_test', {});
      expect(overview.paidProduction.count).toBe(1);
      expect(overview.paidProduction.value).toBe(10000);
      expect(overview.avgTicketNet).toBe(10000);
    });

    it('7. período sem pagamentos -> Ticket Médio = 0', async () => {
      const proposals: any[] = [];
      const prisma = buildMockPrisma(proposals);
      const overview = await BIService.getOverview(prisma, 'tenant_test', {});
      expect(overview.paidProduction.count).toBe(0);
      expect(overview.paidProduction.value).toBe(0);
      expect(overview.avgTicketNet).toBe(0);
    });

    it('8. validação multi-tenant.', async () => {
      const proposalsTenantA = [
        {
          id: 'p_pago_A',
          tenantId: 'tenant_A',
          contractValue: 12000,
          releasedValue: 10000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago' },
        },
      ];

      const proposalsTenantB = [
        {
          id: 'p_pago_B',
          tenantId: 'tenant_B',
          contractValue: 24000,
          releasedValue: 20000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago' },
        },
      ];

      const prisma = {
        proposal: {
          findMany: vi.fn().mockImplementation((args: any) => {
            if (args.where.tenantId === 'tenant_A') return Promise.resolve(proposalsTenantA);
            if (args.where.tenantId === 'tenant_B') return Promise.resolve(proposalsTenantB);
            return Promise.resolve([]);
          }),
          count: vi.fn().mockImplementation((args: any) => {
            if (args.where.tenantId === 'tenant_A') return Promise.resolve(1);
            if (args.where.tenantId === 'tenant_B') return Promise.resolve(1);
            return Promise.resolve(0);
          }),
        },
        pendency: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const overviewA = await BIService.getOverview(prisma, 'tenant_A', {});
      expect(overviewA.paidProduction.value).toBe(10000);
      expect(overviewA.avgTicketNet).toBe(10000);

      const overviewB = await BIService.getOverview(prisma, 'tenant_B', {});
      expect(overviewB.paidProduction.value).toBe(20000);
      expect(overviewB.avgTicketNet).toBe(20000);
    });

    it('9. validação dos filtros do BI.', async () => {
      const proposals = [
        {
          id: 'p_pago_c6',
          bankId: 'bank_c6',
          contractValue: 12000,
          releasedValue: 10000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-10T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago ao Cliente' },
        },
        {
          id: 'p_pago_facta',
          bankId: 'bank_facta',
          contractValue: 24000,
          releasedValue: 20000,
          standardCategory: StandardStatusCategory.PAGO,
          createdAt: new Date('2026-09-11T10:00:00Z'),
          status: { code: 'PAGO', standardCategory: StandardStatusCategory.PAGO, name: 'Pago ao Cliente' },
        },
      ];

      const mockFindMany = vi.fn().mockImplementation((args: any) => {
        const filtered = proposals.filter(p => !args.where.bankId || p.bankId === args.where.bankId);
        return Promise.resolve(filtered);
      });

      const prisma = {
        proposal: {
          findMany: mockFindMany,
          count: vi.fn().mockResolvedValue(1),
        },
        pendency: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const overviewC6 = await BIService.getOverview(prisma, 'tenant_test', { bankId: 'bank_c6' });
      expect(mockFindMany).toHaveBeenCalled();
      expect(mockFindMany.mock.calls[0][0].where.bankId).toBe('bank_c6');
      expect(overviewC6.paidProduction.value).toBe(10000);
      expect(overviewC6.avgTicketNet).toBe(10000);
    });
  });
});
