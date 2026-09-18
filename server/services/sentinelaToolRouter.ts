import { PrismaClient } from '@prisma/client';
import { hasPermission } from '../../src/lib/permissions.js';
import { BIService } from './biService.js';
import { BIComparisonService } from './biComparisonService.js';
import { AnalyticsService, AnalyticsFilterOptions } from './analyticsService.js';
import { ManagerialIntelligenceService } from './managerialIntelligenceService.js';
import { ApiMonitoringService } from './apiMonitoringService.js';
import { BIFilterOptions } from '../../src/types/bi.js';

export interface ToolContextSession {
  user: {
    id: string;
    role: string;
    customPermissions?: string[];
    name?: string;
    email?: string;
  };
  effectiveTenantId: string;
}

export interface ToolResult {
  success: boolean;
  toolName: string;
  data?: any;
  error?: string;
  rbacBlocked?: boolean;
}

/**
 * Helper to mask CPF (e.g., 12345678901 -> ***.456.789-**)
 */
function maskCPF(cpf?: string | null): string {
  if (!cpf) return '***.***.***-**';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return '***.***.***-**';
  return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`;
}

/**
 * Helper to mask phone numbers
 */
function maskPhone(phone?: string | null): string {
  if (!phone) return '(**) *****-****';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 8) return '(**) *****-****';
  const last4 = clean.substring(clean.length - 4);
  return `(**) *****-${last4}`;
}

export class SentinelaToolRouter {
  /**
   * Executes a registered Read-Only tool with strict RBAC and Tenant Isolation.
   */
  public static async executeTool(
    prisma: PrismaClient,
    session: ToolContextSession,
    toolName: string,
    args: Record<string, any> = {}
  ): Promise<ToolResult> {
    const userRole = session.user.role as any;
    const customPermissions = session.user.customPermissions || [];
    const tenantId = session.effectiveTenantId;

    if (!tenantId) {
      return {
        success: false,
        toolName,
        error: 'TENANT_NOT_RESOLVED: Nenhum tenant ativo na sessão.',
      };
    }

    // Sanitize filters (strip any tenantId injected in args, force session.effectiveTenantId)
    const filters: BIFilterOptions = {
      startDate: typeof args.startDate === 'string' ? args.startDate.trim() : undefined,
      endDate: typeof args.endDate === 'string' ? args.endDate.trim() : undefined,
      bankId: typeof args.bankId === 'string' ? args.bankId.trim() : undefined,
      partnerId: typeof args.partnerId === 'string' ? args.partnerId.trim() : undefined,
      digitizerId: typeof args.digitizerId === 'string' ? args.digitizerId.trim() : undefined,
      productId: typeof args.productId === 'string' ? args.productId.trim() : undefined,
      statusId: typeof args.statusId === 'string' ? args.statusId.trim() : undefined,
    };

    const analyticsFilters: AnalyticsFilterOptions = {
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      bankId: filters.bankId,
      partnerId: filters.partnerId,
      statusId: filters.statusId,
      productId: filters.productId,
    };

    // Block DIGITADOR from executive / financial / intelligence tools
    const isDigitador = userRole === 'DIGITADOR';

    try {
      switch (toolName) {
        case 'getOperationalOverview': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão dashboard.view.' };
          }
          const overview = await BIService.getOverview(prisma, tenantId, filters);
          return { success: true, toolName, data: overview };
        }

        case 'getExecutiveOverview': {
          if (isDigitador || !hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Visão executiva restrita a gestores.' };
          }
          const comparison = await BIComparisonService.getComparison(prisma, tenantId, filters);
          return { success: true, toolName, data: comparison };
        }

        case 'getProduction': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão dashboard.view.' };
          }
          const production = await BIService.getProduction(prisma, tenantId, filters);
          return { success: true, toolName, data: production };
        }

        case 'getProductionComparison': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão dashboard.view.' };
          }
          const comp = await BIComparisonService.getComparison(prisma, tenantId, filters);
          return { success: true, toolName, data: comp.metrics };
        }

        case 'getConversion': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão dashboard.view.' };
          }
          const rankings = await BIComparisonService.getRankings(prisma, tenantId, filters);
          return {
            success: true,
            toolName,
            data: {
              globalTotalPaidValue: rankings.summary.totalPaidValue,
              globalProposalsCount: rankings.summary.totalProposalsCount,
              topBankName: rankings.summary.topBankName,
              banksConversion: rankings.banks.map(b => ({
                bankId: b.bankId,
                bankName: b.bankName,
                totalProposals: b.count,
                paidProposals: b.paidCount,
                conversionRatePercent: b.conversionRatePercent,
              })),
            },
          };
        }

        case 'getBankPerformance': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão dashboard.view.' };
          }
          const rankings = await BIComparisonService.getRankings(prisma, tenantId, filters);
          return { success: true, toolName, data: rankings.banks };
        }

        case 'getPartnerPerformance': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão dashboard.view.' };
          }
          const rankings = await BIComparisonService.getRankings(prisma, tenantId, filters);
          return { success: true, toolName, data: rankings.partners };
        }

        case 'getOperatorPerformance': {
          if (isDigitador) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Desempenho de equipe restrito a gestores.' };
          }
          if (!hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão dashboard.view.' };
          }
          const rankings = await BIComparisonService.getRankings(prisma, tenantId, filters);
          return { success: true, toolName, data: rankings.digitizers };
        }

        case 'getBottlenecks': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view') && !hasPermission(userRole, customPermissions, 'proposals.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão para visualizar gargalos.' };
          }
          const report = await AnalyticsService.getBottlenecks(prisma, tenantId, analyticsFilters);
          return { success: true, toolName, data: report };
        }

        case 'getSlaStatus': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view') && !hasPermission(userRole, customPermissions, 'proposals.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão para consultar SLA.' };
          }
          const report = await AnalyticsService.getBottlenecks(prisma, tenantId, analyticsFilters);
          return {
            success: true,
            toolName,
            data: {
              totalOverSlaProposals: report.summary.totalOverSla,
              averageDwellHours: report.summary.avgDwellHours,
              byStatus: report.byStatus,
            },
          };
        }

        case 'getCipStatus': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view') && !hasPermission(userRole, customPermissions, 'proposals.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão para consultar CIP.' };
          }
          const cipReport = await AnalyticsService.getDwellTime(prisma, tenantId, analyticsFilters);
          return { success: true, toolName, data: cipReport };
        }

        case 'getHealthScore': {
          if (isDigitador || !hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Indicadores de saúde executiva restritos a gestores.' };
          }
          const health = await ManagerialIntelligenceService.getHealthScores(prisma, tenantId, filters);
          return { success: true, toolName, data: health };
        }

        case 'getManagerialInsights': {
          if (isDigitador || !hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Diagnósticos estratégicos restritos a gestores.' };
          }
          const insights = await ManagerialIntelligenceService.getInsights(prisma, tenantId, filters);
          return { success: true, toolName, data: insights };
        }

        case 'getCancellationAnalysis': {
          if (!hasPermission(userRole, customPermissions, 'dashboard.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão dashboard.view.' };
          }
          const comp = await BIComparisonService.getComparison(prisma, tenantId, filters);
          return {
            success: true,
            toolName,
            data: {
              cancelledValueDelta: comp.metrics.cancelledValue,
            },
          };
        }

        case 'getProposal': {
          if (!hasPermission(userRole, customPermissions, 'proposals.view')) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão proposals.view.' };
          }
          const queryStr = typeof args.proposalId === 'string' ? args.proposalId.trim() : (typeof args.adeNumber === 'string' ? args.adeNumber.trim() : '');
          if (!queryStr) {
            return { success: false, toolName, error: 'ARGUMENT_ERROR: Forneça proposalId ou adeNumber.' };
          }

          const proposal = await prisma.proposal.findFirst({
            where: {
              tenantId,
              deletedAt: null,
              OR: [
                { id: queryStr },
                { proposalNumber: queryStr },
              ],
            },
            include: {
              client: true,
              bank: true,
              partner: true,
              product: true,
              status: true,
            },
          });

          if (!proposal) {
            return { success: true, toolName, data: null, error: 'Proposta não encontrada para este tenant.' };
          }

          return {
            success: true,
            toolName,
            data: {
              id: proposal.id,
              proposalNumber: proposal.proposalNumber,
              bankName: proposal.bank?.name || 'N/A',
              partnerName: proposal.partner?.name || 'N/A',
              productName: proposal.product?.name || 'N/A',
              statusName: proposal.status?.name || 'N/A',
              standardCategory: proposal.standardCategory,
              releasedValue: Number(proposal.releasedValue || 0),
              contractValue: Number(proposal.contractValue || 0),
              createdAt: proposal.createdAt,
              clientNameMasked: proposal.client?.fullName ? `${proposal.client.fullName.substring(0, 3)}***` : 'N/A',
              clientCpfMasked: maskCPF(proposal.client?.cpf),
            },
          };
        }

        case 'getClient360': {
          const hasCustomerPermission = hasPermission(userRole, customPermissions, 'clients.view') ||
                                        hasPermission(userRole, customPermissions, 'dashboard.view');
          if (!hasCustomerPermission) {
            return { success: false, toolName, rbacBlocked: true, error: 'TOOL_NOT_AUTHORIZED: Sem permissão para consultar dados de clientes.' };
          }

          const searchKey = typeof args.customerId === 'string' ? args.customerId.trim() : (typeof args.cpf === 'string' ? args.cpf.trim() : '');
          if (!searchKey) {
            return { success: false, toolName, error: 'ARGUMENT_ERROR: Forneça customerId ou cpf.' };
          }

          const client = await prisma.client.findFirst({
            where: {
              tenantId,
              deletedAt: null,
              OR: [
                { id: searchKey },
                { cpf: searchKey.replace(/\D/g, '') },
              ],
            },
            include: {
              proposals: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  proposalNumber: true,
                  standardCategory: true,
                  releasedValue: true,
                  createdAt: true,
                },
                take: 5,
              },
            },
          });

          if (!client) {
            return { success: true, toolName, data: null, error: 'Cliente não encontrado no tenant.' };
          }

          return {
            success: true,
            toolName,
            data: {
              clientId: client.id,
              fullNameMasked: `${client.fullName.split(' ')[0]} ***`,
              cpfMasked: maskCPF(client.cpf),
              phoneMasked: maskPhone(client.phone),
              totalProposalsCount: client.proposals.length,
              recentProposals: client.proposals,
            },
          };
        }

        case 'getApiMonitoringStatus': {
          const overview = await ApiMonitoringService.getSystemHealthOverview(prisma, tenantId);
          const services = await ApiMonitoringService.listServices(prisma, tenantId);
          return {
            success: true,
            toolName,
            data: {
              overview,
              services: services.map(s => ({
                name: s.name,
                category: s.category,
                status: s.status,
                criticality: s.criticality,
                latencyMs: s.latencyMs,
                uptimePercent: s.uptimePercent,
                lastCheckedAt: s.lastCheckedAt,
                activeIncidentsCount: s.incidents?.length || 0,
              })),
            },
          };
        }

        case 'getApiIncidents': {
          const incidents = await ApiMonitoringService.listIncidents(prisma, tenantId, { limit: 10 });
          return {
            success: true,
            toolName,
            data: {
              total: incidents.length,
              incidents: incidents.map(i => ({
                id: i.id,
                title: i.title,
                serviceName: i.service.name,
                severity: i.severity,
                status: i.status,
                description: i.description,
                impactDetails: i.impactDetails,
                identifiedAt: i.identifiedAt,
                resolvedAt: i.resolvedAt,
              })),
            },
          };
        }

        case 'getActiveAnnouncements': {
          const now = new Date();
          const announcements = await prisma.announcement.findMany({
            where: {
              OR: [
                { tenantId: null },
                { tenantId },
              ],
              status: 'PUBLISHED',
              publishedAt: { lte: now },
            },
            orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
            take: 10,
          });

          return {
            success: true,
            toolName,
            data: {
              count: announcements.length,
              announcements: announcements.map(a => ({
                id: a.id,
                title: a.title,
                priority: a.priority,
                publishedAt: a.publishedAt,
                contentSummary: a.content.substring(0, 300),
              })),
            },
          };
        }

        default:
          return {
            success: false,
            toolName,
            error: `UNKNOWN_TOOL: A ferramenta "${toolName}" não existe ou não está habilitada.`,
          };
      }
    } catch (err: any) {
      return {
        success: false,
        toolName,
        error: `TOOL_EXECUTION_ERROR: ${err?.message || String(err)}`,
      };
    }
  }
}
