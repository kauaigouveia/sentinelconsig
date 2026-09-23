import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnomalyDetectionService } from '../../server/services/intelligence/anomalyDetectionService.js';
import { CorrelationEngine } from '../../server/services/intelligence/correlationService.js';
import { DeterministicExplanationProvider } from '../../server/services/intelligence/explanationService.js';
import { IntelligenceRepository } from '../../server/services/intelligence/intelligenceRepository.js';
import { IntelligenceService } from '../../server/services/intelligence/intelligenceService.js';
import { INTELLIGENCE_RULES_CATALOG } from '../../server/services/intelligence/intelligenceRules.js';
import { hasPermission } from '../../src/lib/permissions.js';

describe('FASE 7 — SENTINEL INTELLIGENCE AUDIT & VALIDATION', () => {
  const tenantA = 'tenant_alpha_111';
  const tenantB = 'tenant_beta_222';
  const userIdA = 'user_adm_alpha';

  // 1. RBAC TESTS
  describe('1. RBAC & Access Control', () => {
    it('allows TENANT_ADMIN and GESTOR to view and manage intelligence', () => {
      expect(hasPermission('TENANT_ADMIN', [], 'intelligence.view')).toBe(true);
      expect(hasPermission('TENANT_ADMIN', [], 'intelligence.manage')).toBe(true);
      expect(hasPermission('TENANT_ADMIN', [], 'intelligence.resolve')).toBe(true);
      expect(hasPermission('TENANT_ADMIN', [], 'intelligence.configure')).toBe(true);

      expect(hasPermission('GESTOR', [], 'intelligence.view')).toBe(true);
      expect(hasPermission('GESTOR', [], 'intelligence.investigate')).toBe(true);
      expect(hasPermission('GESTOR', [], 'intelligence.resolve')).toBe(true);
      expect(hasPermission('GESTOR', [], 'intelligence.dismiss')).toBe(true);
    });

    it('denies DIGITADOR from managing or configuring intelligence by default', () => {
      expect(hasPermission('DIGITADOR', [], 'intelligence.manage')).toBe(false);
      expect(hasPermission('DIGITADOR', [], 'intelligence.resolve')).toBe(false);
      expect(hasPermission('DIGITADOR', [], 'intelligence.configure')).toBe(false);
    });

    it('honors custom permissions granted to user', () => {
      expect(hasPermission('DIGITADOR', ['intelligence.view'], 'intelligence.view')).toBe(true);
      expect(hasPermission('DIGITADOR', ['intelligence.resolve'], 'intelligence.resolve')).toBe(true);
    });
  });

  // 2. EXPLANATION ENGINE TESTS
  describe('2. Deterministic Explanation Engine', () => {
    const provider = new DeterministicExplanationProvider();

    it('generates clear, deterministic summary and explanation with exact math', async () => {
      const summary = await provider.generateSummary({
        title: 'Queda de Produção',
        metricName: 'Produção Líquida Paga',
        category: 'PRODUCTION',
        currentValue: 50000,
        previousValue: 100000,
        variation: -50.0,
        periodLabel: 'Últimos 30 Dias',
        comparisonLabel: '30 Dias Anteriores',
        evidence: [],
      });

      expect(summary).toContain('Produção Líquida Paga');
      expect(summary).toContain('50.000');
      expect(summary).toContain('redução de 50.0%');
      expect(summary).toContain('Últimos 30 Dias');
      expect(summary).toContain('30 Dias Anteriores');

      const explanation = await provider.generateExplanation({
        title: 'Queda de Produção',
        metricName: 'Produção Líquida Paga',
        category: 'PRODUCTION',
        currentValue: 50000,
        previousValue: 100000,
        variation: -50.0,
        periodLabel: 'Últimos 30 Dias',
        comparisonLabel: '30 Dias Anteriores',
        dimensionsAffected: [
          { dimension: 'banco', name: 'Banco C6', variation: -60.0, sharePercent: 70.0, detail: 'Queda concentrada' },
        ],
        evidence: [
          {
            metric: 'volume_pago',
            label: 'Volume Pago C6',
            currentValue: 'R$ 20.000',
            variation: -60.0,
            unit: 'currency',
            source: 'BIService',
          },
        ],
        correlatedEvents: ['Aumento de 15% na taxa de erros do C6 no mesmo período.'],
      });

      expect(explanation).toContain('BANCO: Banco C6 com variação de -60.0% (representa 70.0% do impacto)');
      expect(explanation).toContain('Fonte: BIService');
      expect(explanation).toContain('Aumento de 15% na taxa de erros do C6 no mesmo período.');
    });
  });

  // 3. CORRELATION ENGINE TESTS
  describe('3. Cross-Domain Correlation Engine', () => {
    it('detects correlation between integration error spike and bank conversion/production drop', () => {
      const periodStart = new Date('2026-03-01T00:00:00Z');
      const periodEnd = new Date('2026-03-31T23:59:59Z');

      const integrationData = [
        { bank: 'Facta', errorRate: 18.5, latency: 1200, incidentCount: 1 },
        { bank: 'C6', errorRate: 2.1, latency: 450, incidentCount: 0 },
      ];

      const bankDeltas = [
        {
          bankId: 'bank_facta_1',
          bankName: 'Facta Financeira',
          conversionDelta: -30.0,
          productionDelta: -45.0,
          currentPaid: 10000,
          previousPaid: 18000,
        },
        {
          bankId: 'bank_c6_1',
          bankName: 'Banco C6',
          conversionDelta: 5.0,
          productionDelta: 10.0,
          currentPaid: 50000,
          previousPaid: 45000,
        },
      ];

      const correlations = CorrelationEngine.findCorrelations(
        tenantA,
        periodStart,
        periodEnd,
        integrationData,
        bankDeltas,
        { openCount: 2, overdueCount: 0, criticalCount: 0 },
        []
      );

      expect(correlations.length).toBe(1);
      expect(correlations[0].primaryEntity).toBe('Facta');
      expect(correlations[0].secondaryEntity).toBe('Facta Financeira');
      expect(correlations[0].confidence).toBe(0.88);
      expect(correlations[0].relationship).toContain('Aumento de erros na integração Facta (18.5% de falhas)');
      expect(correlations[0].evidence.length).toBe(2);
      expect(correlations[0].suggestedActions.some(a => a.type === 'OPEN_INTEGRATION')).toBe(true);
    });

    it('detects correlation between overdue pendencies and bottleneck stages', () => {
      const periodStart = new Date('2026-03-01T00:00:00Z');
      const periodEnd = new Date('2026-03-31T23:59:59Z');

      const correlations = CorrelationEngine.findCorrelations(
        tenantA,
        periodStart,
        periodEnd,
        [],
        [],
        { openCount: 8, overdueCount: 4, criticalCount: 2 },
        [
          { statusName: 'Aguardando CCB', count: 12, value: 150000, isFinal: false },
          { statusName: 'Pago', count: 50, value: 500000, isFinal: true },
        ]
      );

      expect(correlations.length).toBe(1);
      expect(correlations[0].primaryType).toBe('SLA_BREACH');
      expect(correlations[0].secondaryEntity).toBe('Aguardando CCB');
      expect(correlations[0].relationship).toContain('4 pendências operacionais estouradas');
    });
  });

  // 4. DEDUPLICATION KEY & REPOSITORY MOCK TESTS
  describe('4. Deduplication & Lifecycle Integrity', () => {
    it('computes deterministic deduplication keys for same scope and time window', () => {
      const d1 = new Date('2026-03-01T10:00:00Z');
      const d2 = new Date('2026-03-31T18:00:00Z');

      const key1 = AnomalyDetectionService.computeDedupKey(tenantA, 'PRODUCTION_DROP', 'GLOBAL', 'ALL', d1, d2);
      const key2 = AnomalyDetectionService.computeDedupKey(tenantA, 'PRODUCTION_DROP', 'GLOBAL', 'ALL', d1, d2);
      const keyOtherTenant = AnomalyDetectionService.computeDedupKey(tenantB, 'PRODUCTION_DROP', 'GLOBAL', 'ALL', d1, d2);

      expect(key1).toBe(key2);
      expect(key1).toBe('tenant_alpha_111_PRODUCTION_DROP_GLOBAL_ALL_2026-03-01_2026-03-31');
      expect(key1).not.toBe(keyOtherTenant);
    });

    it('ensures rule catalog has all default rules correctly configured', () => {
      expect(INTELLIGENCE_RULES_CATALOG.length).toBeGreaterThanOrEqual(14);
      const prodDrop = INTELLIGENCE_RULES_CATALOG.find(r => r.id === 'PRODUCTION_DROP');
      expect(prodDrop).toBeDefined();
      expect(prodDrop?.defaultSeverity).toBe('HIGH');
      expect(prodDrop?.defaultThreshold).toBe(15.0);

      const integSpike = INTELLIGENCE_RULES_CATALOG.find(r => r.id === 'INTEGRATION_ERROR_SPIKE');
      expect(integSpike).toBeDefined();
      expect(integSpike?.defaultSeverity).toBe('CRITICAL');
    });
  });

  // 5. MULTI-TENANT ISOLATION SIMULATION
  describe('5. Multi-Tenant Isolation Simulation', () => {
    it('isolates Tenant A and Tenant B insights during database querying', async () => {
      const mockInsightsA = [
        {
          id: 'ins_a_1',
          tenantId: tenantA,
          type: 'PRODUCTION',
          category: 'PRODUÇÃO',
          severity: 'HIGH',
          title: 'Queda Tenant A',
          summary: 'Produção recuou no Tenant A',
          status: 'NEW',
          confidence: 0.95,
          detectedAt: new Date(),
          periodStart: new Date(),
          periodEnd: new Date(),
          dedupKey: 'dedup_a_1',
          createdAt: new Date(),
          updatedAt: new Date(),
          evidence: [],
          suggestedActions: [],
        },
      ];

      const mockInsightsB = [
        {
          id: 'ins_b_1',
          tenantId: tenantB,
          type: 'INTEGRATION',
          category: 'INTEGRAÇÕES',
          severity: 'CRITICAL',
          title: 'Erro API Tenant B',
          summary: 'Falha Facta Tenant B',
          status: 'NEW',
          confidence: 0.99,
          detectedAt: new Date(),
          periodStart: new Date(),
          periodEnd: new Date(),
          dedupKey: 'dedup_b_1',
          createdAt: new Date(),
          updatedAt: new Date(),
          evidence: [],
          suggestedActions: [],
        },
      ];

      const mockPrisma: any = {
        intelligenceInsight: {
          findMany: vi.fn().mockImplementation((args: any) => {
            if (args.where?.tenantId === tenantA) return Promise.resolve(mockInsightsA);
            if (args.where?.tenantId === tenantB) return Promise.resolve(mockInsightsB);
            return Promise.resolve([]);
          }),
          count: vi.fn().mockImplementation((args: any) => {
            if (args.where?.tenantId === tenantA) return Promise.resolve(mockInsightsA.length);
            if (args.where?.tenantId === tenantB) return Promise.resolve(mockInsightsB.length);
            return Promise.resolve(0);
          }),
        },
      };

      const resultA = await IntelligenceRepository.listInsights(mockPrisma, tenantA);
      expect(resultA.insights.length).toBe(1);
      expect(resultA.insights[0].tenantId).toBe(tenantA);
      expect(resultA.insights[0].title).toBe('Queda Tenant A');

      const resultB = await IntelligenceRepository.listInsights(mockPrisma, tenantB);
      expect(resultB.insights.length).toBe(1);
      expect(resultB.insights[0].tenantId).toBe(tenantB);
      expect(resultB.insights[0].title).toBe('Erro API Tenant B');

      // Verify tenant query parameter was strictly applied
      expect(mockPrisma.intelligenceInsight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: tenantA }),
        })
      );
    });
  });

  // 6. METRICS & ZERO-DIVISION PROTECTION
  describe('6. Zero-Division & Metrics Protection', () => {
    it('returns 0% and N/A safely without NaN or Infinity for empty tenant', async () => {
      const mockPrismaEmpty: any = {
        intelligenceInsight: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        intelligenceRuleConfig: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const metrics = await IntelligenceRepository.getMetrics(mockPrismaEmpty, 'tenant_empty');
      expect(metrics.totalInsightsGenerated).toBe(0);
      expect(metrics.activeCount).toBe(0);
      expect(metrics.resolvedCount).toBe(0);
      expect(metrics.resolutionRatePercent).toBe(0);
      expect(metrics.avgResolutionTimeHours).toBe(0);
      expect(Number.isNaN(metrics.resolutionRatePercent)).toBe(false);
      expect(Number.isFinite(metrics.resolutionRatePercent)).toBe(true);

      const overview = await IntelligenceRepository.getOverview(mockPrismaEmpty, 'tenant_empty');
      expect(overview.summary.totalInsights).toBe(0);
      expect(overview.summary.criticalInsights).toBe(0);
      expect(overview.recentInsights.length).toBe(0);
    });
  });
});
