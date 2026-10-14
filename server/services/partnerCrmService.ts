import { PrismaClient, PriorityLevel, StandardStatusCategory } from '@prisma/client';
import { centralEventBus } from './eventBus.js';
import { AuditLogService } from './auditLogService.js';
import { logger } from '../logger.js';
import express from 'express';

export type PartnerCadastralStatus = 'ATIVO' | 'INATIVO';
export type PartnerOperationalStatus = 'ATIVO_RECENTE' | 'SEM_ATIVIDADE' | 'COM_PENDENCIAS' | 'INATIVO';

export interface PartnerListFilters {
  search?: string;
  status?: string;
  promoterId?: string;
  operationalStatus?: string;
  page?: number;
  limit?: number;
}

export interface PartnerInteractionInput {
  partnerId: string;
  type: string;
  date?: string | Date;
  subject: string;
  description?: string;
  result?: string;
  nextAction?: string;
}

export interface PartnerNoteInput {
  partnerId: string;
  content: string;
}

export interface PartnerTaskInput {
  partnerId: string;
  title: string;
  description?: string;
  assignedToId?: string;
  priority?: PriorityLevel;
  dueDate?: string | Date;
}

export class PartnerCrmService {
  /**
   * Helper to determine operational status based on activity dates and pendencies
   */
  public static calculateOperationalStatus(
    cadastralStatus: string,
    lastActivityAt: Date | null,
    openPendenciesCount: number
  ): PartnerOperationalStatus {
    if (cadastralStatus === 'INATIVO') return 'INATIVO';
    if (openPendenciesCount > 0) return 'COM_PENDENCIAS';

    if (!lastActivityAt) return 'SEM_ATIVIDADE';

    const now = new Date().getTime();
    const lastActivityTime = new Date(lastActivityAt).getTime();
    const diffDays = (now - lastActivityTime) / (1000 * 60 * 60 * 24);

    if (diffDays <= 7) return 'ATIVO_RECENTE';
    if (diffDays > 30) return 'SEM_ATIVIDADE';

    return 'ATIVO_RECENTE';
  }

  /**
   * List partners with rich CRM aggregates
   */
  public static async listPartners(
    prisma: PrismaClient,
    tenantId: string,
    filters: PartnerListFilters = {}
  ) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    if (filters.promoterId && filters.promoterId !== 'ALL') {
      where.promoterId = filters.promoterId;
    }

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { document: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, partners] = await Promise.all([
      prisma.partner.count({ where }),
      prisma.partner.findMany({
        where,
        include: {
          promoter: { select: { id: true, name: true, code: true } },
          assignedUser: { select: { id: true, name: true, email: true } },
          portalAccesses: {
            select: {
              id: true,
              name: true,
              email: true,
              active: true,
              lastLoginAt: true,
              mustChangePassword: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              proposals: true,
              simulationRequests: true,
              interactions: true,
              notes: true,
              tasks: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    // Fetch aggregate statistics for these partners
    const partnerIds = partners.map(p => p.id);

    const [
      proposalsGroup,
      openPendenciesGroup,
      openTasksGroup,
      latestProposals,
      latestSimulations,
      latestInteractions,
    ] = await Promise.all([
      prisma.proposal.groupBy({
        by: ['partnerId', 'standardCategory'],
        where: { tenantId, partnerId: { in: partnerIds }, deletedAt: null },
        _count: { _all: true },
        _sum: { contractValue: true, releasedValue: true },
      }),
      prisma.pendency.groupBy({
        by: ['partnerId'],
        where: {
          tenantId,
          partnerId: { in: partnerIds },
          status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO', 'PENDENTE', 'EM_ANALISE', 'DOCUMENTO_PENDENTE', 'AGUARDANDO_CLIENTE'] },
        },
        _count: { _all: true },
      }),
      prisma.partnerTask.groupBy({
        by: ['partnerId'],
        where: {
          tenantId,
          partnerId: { in: partnerIds },
          status: { in: ['PENDENTE', 'EM_ANDAMENTO'] },
        },
        _count: { _all: true },
      }),
      prisma.proposal.findMany({
        where: { tenantId, partnerId: { in: partnerIds }, deletedAt: null },
        select: { partnerId: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.simulationRequest.findMany({
        where: { tenantId, partnerId: { in: partnerIds } },
        select: { partnerId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.partnerInteraction.findMany({
        where: { tenantId, partnerId: { in: partnerIds } },
        select: { partnerId: true, date: true, createdAt: true },
        orderBy: { date: 'desc' },
      }),
    ]);

    // Map aggregates
    const items = partners.map(p => {
      const pProposals = proposalsGroup.filter(g => g.partnerId === p.id);
      const totalProposalsCount = pProposals.reduce((acc, curr) => acc + (curr._count?._all || 0), 0);
      const totalProposalsVolume = pProposals.reduce((acc, curr) => acc + Number(curr._sum?.contractValue || 0), 0);

      const approvedProposals = pProposals.filter(g => g.standardCategory === StandardStatusCategory.PAGO || g.standardCategory === StandardStatusCategory.ANDAMENTO);
      const approvedCount = approvedProposals.reduce((acc, curr) => acc + (curr._count?._all || 0), 0);
      const approvedVolume = approvedProposals.reduce((acc, curr) => acc + Number(curr._sum?.contractValue || 0), 0);

      const openPendency = openPendenciesGroup.find(g => g.partnerId === p.id);
      const openPendenciesCount = openPendency?._count?._all || 0;

      const openTask = openTasksGroup.find(g => g.partnerId === p.id);
      const openTasksCount = openTask?._count?._all || 0;

      // Find last activity
      const propDates = latestProposals.filter(x => x.partnerId === p.id).map(x => x.createdAt);
      const simDates = latestSimulations.filter(x => x.partnerId === p.id).map(x => x.createdAt);
      const intDates = latestInteractions.filter(x => x.partnerId === p.id).map(x => x.date || x.createdAt);
      const allDates = [...propDates, ...simDates, ...intDates, p.updatedAt].map(d => new Date(d).getTime());
      const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : p.createdAt;

      const operationalStatus = this.calculateOperationalStatus(
        p.status,
        maxDate,
        openPendenciesCount
      );

      const portalAccess = p.portalAccesses && p.portalAccesses.length > 0 ? p.portalAccesses[0] : null;

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        email: p.email,
        phone: p.phone,
        document: p.document,
        promoterId: p.promoterId,
        promoter: p.promoter,
        assignedUserId: p.assignedUserId,
        assignedUser: p.assignedUser,
        portalAccess,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        lastActivityAt: maxDate,
        operationalStatus,
        metrics: {
          totalProposalsCount,
          totalProposalsVolume,
          approvedCount,
          approvedVolume,
          simulationsCount: p._count.simulationRequests,
          openPendenciesCount,
          openTasksCount,
          interactionsCount: p._count.interactions,
          notesCount: p._count.notes,
        },
      };
    });

    const filteredItems = filters.operationalStatus && filters.operationalStatus !== 'ALL'
      ? items.filter(i => i.operationalStatus === filters.operationalStatus)
      : items;

    return {
      data: filteredItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single partner complete details
   */
  public static async getPartnerDetails(prisma: PrismaClient, tenantId: string, partnerId: string) {
    const partner = await prisma.partner.findFirst({
      where: { id: partnerId, tenantId, deletedAt: null },
      include: {
        promoter: true,
        assignedUser: { select: { id: true, name: true, email: true, role: true } },
        portalAccesses: {
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            lastLoginAt: true,
            mustChangePassword: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            proposals: true,
            simulationRequests: true,
            pendencies: true,
            interactions: true,
            notes: true,
            tasks: true,
          },
        },
      },
    });

    if (!partner) {
      return null;
    }

    // Aggregates
    const [openPendenciesCount, openTasksCount, latestProposal, latestSim, latestInt] = await Promise.all([
      prisma.pendency.count({
        where: {
          tenantId,
          partnerId,
          status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO', 'PENDENTE', 'EM_ANALISE', 'DOCUMENTO_PENDENTE', 'AGUARDANDO_CLIENTE'] },
        },
      }),
      prisma.partnerTask.count({
        where: {
          tenantId,
          partnerId,
          status: { in: ['PENDENTE', 'EM_ANDAMENTO'] },
        },
      }),
      prisma.proposal.findFirst({
        where: { tenantId, partnerId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.simulationRequest.findFirst({
        where: { tenantId, partnerId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.partnerInteraction.findFirst({
        where: { tenantId, partnerId },
        orderBy: { date: 'desc' },
        select: { date: true, createdAt: true },
      }),
    ]);

    const allDates = [
      latestProposal?.createdAt,
      latestSim?.createdAt,
      latestInt?.date || latestInt?.createdAt,
      partner.updatedAt,
    ].filter(Boolean).map(d => new Date(d!).getTime());

    const lastActivityAt = allDates.length > 0 ? new Date(Math.max(...allDates)) : partner.createdAt;

    const operationalStatus = this.calculateOperationalStatus(
      partner.status,
      lastActivityAt,
      openPendenciesCount
    );

    return {
      ...partner,
      lastActivityAt,
      operationalStatus,
      openPendenciesCount,
      openTasksCount,
    };
  }

  /**
   * Get metrics and production analysis for a partner
   */
  public static async getPartnerMetrics(
    prisma: PrismaClient,
    tenantId: string,
    partnerId: string,
    period: string = '30d',
    startDate?: string,
    endDate?: string
  ) {
    const whereProposal: any = {
      tenantId,
      partnerId,
      deletedAt: null,
    };

    const whereSim: any = {
      tenantId,
      partnerId,
    };

    const now = new Date();
    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;

    if (period === 'today') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (period === '7d') {
      dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === 'current_month') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    } else if (period === 'last_month') {
      dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      dateTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (period === 'custom' && startDate) {
      dateFrom = new Date(startDate);
      if (endDate) {
        dateTo = new Date(endDate);
        if (endDate.length === 10) dateTo.setHours(23, 59, 59, 999);
      }
    }

    if (dateFrom || dateTo) {
      whereProposal.createdAt = {};
      whereSim.createdAt = {};
      if (dateFrom) {
        whereProposal.createdAt.gte = dateFrom;
        whereSim.createdAt.gte = dateFrom;
      }
      if (dateTo) {
        whereProposal.createdAt.lte = dateTo;
        whereSim.createdAt.lte = dateTo;
      }
    }

    const [
      proposals,
      simulationsCount,
      allStatuses,
      banks,
    ] = await Promise.all([
      prisma.proposal.findMany({
        where: whereProposal,
        select: {
          id: true,
          proposalNumber: true,
          bankId: true,
          bank: { select: { id: true, name: true, code: true, color: true } },
          statusId: true,
          status: { select: { id: true, name: true, code: true, color: true, standardCategory: true } },
          standardCategory: true,
          productId: true,
          product: { select: { id: true, name: true, code: true } },
          type: true,
          contractValue: true,
          releasedValue: true,
          commissionRate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.simulationRequest.count({ where: whereSim }),
      prisma.proposalStatus.findMany({ where: { tenantId } }),
      prisma.bank.findMany({ where: { tenantId } }),
    ]);

    const totalCount = proposals.length;
    const totalContractValue = proposals.reduce((acc, p) => acc + (Number(p.contractValue) || 0), 0);
    const totalReleasedValue = proposals.reduce((acc, p) => acc + (Number(p.releasedValue) || 0), 0);
    const totalCommission = proposals.reduce((acc, p) => {
      const val = Number(p.contractValue) || 0;
      const rate = Number(p.commissionRate) || 0;
      return acc + (val * (rate / 100));
    }, 0);

    // Group by status
    const statusMap = new Map<string, { count: number; volume: number }>();
    proposals.forEach(p => {
      const st = p.status?.name || p.standardCategory || 'OUTRO';
      const curr = statusMap.get(st) || { count: 0, volume: 0 };
      curr.count += 1;
      curr.volume += Number(p.contractValue) || 0;
      statusMap.set(st, curr);
    });

    const statusBreakdown = Array.from(statusMap.entries()).map(([status, val]) => {
      const meta = allStatuses.find(s => s.name === status || s.code === status);
      return {
        status,
        count: val.count,
        volume: val.volume,
        color: meta?.color || '#3b82f6',
        standardCategory: meta?.standardCategory || 'ESTEIRA',
      };
    });

    // Group by bank
    const bankMap = new Map<string, { count: number; volume: number; approvedCount: number }>();
    proposals.forEach(p => {
      const b = p.bank?.name || 'Outro';
      const curr = bankMap.get(b) || { count: 0, volume: 0, approvedCount: 0 };
      curr.count += 1;
      curr.volume += Number(p.contractValue) || 0;
      if (p.standardCategory === StandardStatusCategory.PAGO || p.status?.standardCategory === StandardStatusCategory.PAGO) {
        curr.approvedCount += 1;
      }
      bankMap.set(b, curr);
    });

    const bankBreakdown = Array.from(bankMap.entries()).map(([bank, val]) => {
      const meta = banks.find(b => b.name === bank || b.code === bank);
      return {
        bank,
        count: val.count,
        volume: val.volume,
        approvedCount: val.approvedCount,
        color: meta?.color || '#6366f1',
      };
    });

    // Group by product / type
    const productMap = new Map<string, { count: number; volume: number }>();
    proposals.forEach(p => {
      const prod = p.product?.name || p.type || 'Outro';
      const curr = productMap.get(prod) || { count: 0, volume: 0 };
      curr.count += 1;
      curr.volume += Number(p.contractValue) || 0;
      productMap.set(prod, curr);
    });

    const productBreakdown = Array.from(productMap.entries()).map(([product, val]) => ({
      product,
      count: val.count,
      volume: val.volume,
    }));

    // Categorization
    const approved = proposals.filter(p => p.standardCategory === StandardStatusCategory.PAGO || p.status?.standardCategory === StandardStatusCategory.PAGO);
    const paid = proposals.filter(p => p.standardCategory === StandardStatusCategory.PAGO || p.status?.standardCategory === StandardStatusCategory.PAGO);
    const denied = proposals.filter(p => p.standardCategory === StandardStatusCategory.RECUSADO || p.status?.standardCategory === StandardStatusCategory.RECUSADO);
    const cancelled = proposals.filter(p => p.standardCategory === StandardStatusCategory.CANCELADO || p.status?.standardCategory === StandardStatusCategory.CANCELADO);
    const inProgress = proposals.filter(p => p.standardCategory === StandardStatusCategory.ANDAMENTO || p.standardCategory === StandardStatusCategory.ESTEIRA || p.standardCategory === StandardStatusCategory.PENDENTE);

    const approvalRate = totalCount > 0 ? (approved.length / totalCount) * 100 : 0;
    const ticketAverage = totalCount > 0 ? totalContractValue / totalCount : 0;

    return {
      period,
      summary: {
        totalCount,
        totalContractValue,
        totalReleasedValue,
        totalNetValue: totalReleasedValue,
        totalCommission,
        ticketAverage,
        approvalRate,
        approvedCount: approved.length,
        approvedVolume: approved.reduce((acc, p) => acc + (Number(p.contractValue) || 0), 0),
        paidCount: paid.length,
        paidVolume: paid.reduce((acc, p) => acc + (Number(p.contractValue) || 0), 0),
        deniedCount: denied.length,
        cancelledCount: cancelled.length,
        inProgressCount: inProgress.length,
        simulationsCount,
      },
      statusBreakdown,
      bankBreakdown,
      productBreakdown,
    };
  }

  /**
   * Consolidated partner timeline
   */
  public static async getPartnerTimeline(
    prisma: PrismaClient,
    tenantId: string,
    partnerId: string,
    limit: number = 50
  ) {
    const [
      interactions,
      notes,
      tasks,
      proposals,
      simulations,
      pendencies,
    ] = await Promise.all([
      prisma.partnerInteraction.findMany({
        where: { tenantId, partnerId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { date: 'desc' },
        take: limit,
      }),
      prisma.partnerNote.findMany({
        where: { tenantId, partnerId },
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.partnerTask.findMany({
        where: { tenantId, partnerId },
        include: {
          assignedTo: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          completedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.proposal.findMany({
        where: { tenantId, partnerId, deletedAt: null },
        select: {
          id: true,
          proposalNumber: true,
          bank: { select: { name: true } },
          type: true,
          debtBalance: true,
          status: { select: { name: true, color: true } },
          standardCategory: true,
          contractValue: true,
          releasedValue: true,
          client: { select: { fullName: true, cpf: true } },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.simulationRequest.findMany({
        where: { tenantId, partnerId },
        select: {
          id: true,
          simulationType: true,
          operationType: true,
          status: true,
          cpf: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.pendency.findMany({
        where: { tenantId, partnerId },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          proposalId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const timelineItems: Array<{
      id: string;
      type: 'INTERACTION' | 'NOTE' | 'TASK' | 'PROPOSAL' | 'SIMULATION' | 'PENDENCY';
      date: string;
      title: string;
      subtitle?: string;
      description?: string;
      author?: string;
      status?: string;
      data: any;
    }> = [];

    interactions.forEach(i => {
      timelineItems.push({
        id: `int_${i.id}`,
        type: 'INTERACTION',
        date: i.date ? i.date.toISOString() : i.createdAt.toISOString(),
        title: `[${i.type}] ${i.subject}`,
        subtitle: i.nextAction ? `Próxima ação: ${i.nextAction}` : undefined,
        description: i.description || i.result || undefined,
        author: i.user?.name || 'Operador',
        status: i.type,
        data: i,
      });
    });

    notes.forEach(n => {
      timelineItems.push({
        id: `note_${n.id}`,
        type: 'NOTE',
        date: n.createdAt.toISOString(),
        title: 'Nota Interna Registrada',
        description: n.content,
        author: n.author?.name || 'Operador',
        data: n,
      });
    });

    tasks.forEach(t => {
      timelineItems.push({
        id: `task_${t.id}`,
        type: 'TASK',
        date: t.completedAt ? t.completedAt.toISOString() : t.createdAt.toISOString(),
        title: `Tarefa: ${t.title}`,
        subtitle: t.dueDate ? `Prazo: ${new Date(t.dueDate).toLocaleDateString('pt-BR')}` : undefined,
        description: t.description || undefined,
        author: t.createdBy?.name || 'Sistema',
        status: t.status,
        data: t,
      });
    });

    proposals.forEach(p => {
      // Mask client CPF for privacy (e.g. 123.***.***-45)
      const rawCpf = p.client?.cpf || '';
      const maskedCpf = rawCpf.length >= 11
        ? `${rawCpf.slice(0, 3)}.***.***-${rawCpf.slice(-2)}`
        : '***.***.***-**';
      const clientName = p.client?.fullName || 'Cliente';
      const bankName = p.bank?.name || 'Banco';
      const statusName = p.status?.name || p.standardCategory;

      timelineItems.push({
        id: `prop_${p.id}`,
        type: 'PROPOSAL',
        date: p.createdAt.toISOString(),
        title: `Proposta #${p.proposalNumber || p.id} - ${bankName}`,
        subtitle: `${clientName} (${maskedCpf}) — ${p.type === 'PORTABILIDADE' ? 'Saldo: ' : ''}R$ ${Number(p.type === 'PORTABILIDADE' ? (p.debtBalance ?? p.contractValue ?? 0) : (p.releasedValue ?? p.contractValue ?? 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        status: statusName,
        data: p,
      });
    });

    simulations.forEach(s => {
      const rawCpf = s.cpf || '';
      const maskedCpf = rawCpf.length >= 11
        ? `${rawCpf.slice(0, 3)}.***.***-${rawCpf.slice(-2)}`
        : '***.***.***-**';

      timelineItems.push({
        id: `sim_${s.id}`,
        type: 'SIMULATION',
        date: s.createdAt.toISOString(),
        title: `Simulação (${s.simulationType || 'MANUAL'})`,
        subtitle: `CPF: ${maskedCpf} | Operação: ${s.operationType || 'CONSIGNADO'}`,
        status: s.status,
        data: s,
      });
    });

    pendencies.forEach(pen => {
      timelineItems.push({
        id: `pen_${pen.id}`,
        type: 'PENDENCY',
        date: pen.createdAt.toISOString(),
        title: `Pendência: ${pen.title}`,
        subtitle: `Tipo: ${pen.type} | Prioridade: ${pen.priority}`,
        status: pen.status,
        data: pen,
      });
    });

    // Sort descending by date
    timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return timelineItems.slice(0, limit);
  }

  /**
   * Create Interaction
   */
  public static async createInteraction(
    prisma: PrismaClient,
    tenantId: string,
    userId: string,
    userName: string,
    input: PartnerInteractionInput,
    req?: express.Request
  ) {
    const partner = await prisma.partner.findFirst({
      where: { id: input.partnerId, tenantId, deletedAt: null },
    });

    if (!partner) {
      throw new Error('Parceiro não encontrado ou pertence a outro tenant.');
    }

    const interaction = await prisma.partnerInteraction.create({
      data: {
        tenantId,
        partnerId: input.partnerId,
        userId,
        type: (input.type || 'LIGAÇÃO').toUpperCase(),
        date: input.date ? new Date(input.date) : new Date(),
        subject: input.subject.trim(),
        description: input.description ? input.description.trim() : null,
        result: input.result ? input.result.trim() : null,
        nextAction: input.nextAction ? input.nextAction.trim() : null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Update partner updated timestamp
    await prisma.partner.update({
      where: { id: input.partnerId },
      data: { updatedAt: new Date() },
    });

    // Audit log
    await AuditLogService.record(prisma, {
      tenantId,
      userId,
      userName,
      action: 'PARTNER_INTERACTION_CREATED',
      entity: 'PartnerInteraction',
      entityId: interaction.id,
      newData: interaction,
      req,
    });

    // Realtime & EventBus
    await centralEventBus.publish({
      tenantId,
      eventType: 'PARTNER_INTERACTION_CREATED',
      entityId: interaction.id,
      entity: 'PartnerInteraction',
      userId,
      userName,
      data: {
        interactionId: interaction.id,
        partnerId: partner.id,
        partnerName: partner.name,
        type: interaction.type,
        subject: interaction.subject,
      },
    });

    return interaction;
  }

  /**
   * Create Internal Note
   */
  public static async createNote(
    prisma: PrismaClient,
    tenantId: string,
    userId: string,
    userName: string,
    input: PartnerNoteInput,
    req?: express.Request
  ) {
    const partner = await prisma.partner.findFirst({
      where: { id: input.partnerId, tenantId, deletedAt: null },
    });

    if (!partner) {
      throw new Error('Parceiro não encontrado ou pertence a outro tenant.');
    }

    const note = await prisma.partnerNote.create({
      data: {
        tenantId,
        partnerId: input.partnerId,
        authorId: userId,
        content: input.content.trim(),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.partner.update({
      where: { id: input.partnerId },
      data: { updatedAt: new Date() },
    });

    await AuditLogService.record(prisma, {
      tenantId,
      userId,
      userName,
      action: 'PARTNER_NOTE_CREATED',
      entity: 'PartnerNote',
      entityId: note.id,
      newData: note,
      req,
    });

    await centralEventBus.publish({
      tenantId,
      eventType: 'PARTNER_NOTE_CREATED',
      entityId: note.id,
      entity: 'PartnerNote',
      userId,
      userName,
      data: {
        noteId: note.id,
        partnerId: partner.id,
        partnerName: partner.name,
      },
    });

    return note;
  }

  /**
   * Create Partner Task / Follow-up
   */
  public static async createTask(
    prisma: PrismaClient,
    tenantId: string,
    userId: string,
    userName: string,
    input: PartnerTaskInput,
    req?: express.Request
  ) {
    const partner = await prisma.partner.findFirst({
      where: { id: input.partnerId, tenantId, deletedAt: null },
    });

    if (!partner) {
      throw new Error('Parceiro não encontrado ou pertence a outro tenant.');
    }

    // Verify assigned user if provided
    if (input.assignedToId) {
      const assignedUser = await prisma.user.findFirst({
        where: { id: input.assignedToId, tenantId, active: true },
      });
      if (!assignedUser) {
        throw new Error('Usuário responsável não encontrado ou inativo no tenant.');
      }
    }

    const task = await prisma.partnerTask.create({
      data: {
        tenantId,
        partnerId: input.partnerId,
        createdById: userId,
        assignedToId: input.assignedToId || null,
        title: input.title.trim(),
        description: input.description ? input.description.trim() : null,
        priority: input.priority || 'MEDIUM',
        status: 'PENDENTE',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await prisma.partner.update({
      where: { id: input.partnerId },
      data: { updatedAt: new Date() },
    });

    await AuditLogService.record(prisma, {
      tenantId,
      userId,
      userName,
      action: 'PARTNER_TASK_CREATED',
      entity: 'PartnerTask',
      entityId: task.id,
      newData: task,
      req,
    });

    await centralEventBus.publish({
      tenantId,
      eventType: 'PARTNER_TASK_CREATED',
      entityId: task.id,
      entity: 'PartnerTask',
      userId,
      userName,
      data: {
        taskId: task.id,
        partnerId: partner.id,
        partnerName: partner.name,
        title: task.title,
        priority: task.priority,
        assignedToId: task.assignedToId,
      },
    });

    return task;
  }

  /**
   * Update or Complete Task
   */
  public static async updateTask(
    prisma: PrismaClient,
    tenantId: string,
    userId: string,
    userName: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      status?: 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      assignedToId?: string | null;
      dueDate?: string | Date | null;
    },
    req?: express.Request
  ) {
    const existing = await prisma.partnerTask.findFirst({
      where: { id: taskId, tenantId },
      include: { partner: true },
    });

    if (!existing) {
      throw new Error('Tarefa não encontrada ou pertence a outro tenant.');
    }

    const isCompleting = data.status === 'CONCLUIDA' && existing.status !== 'CONCLUIDA';

    const updated = await prisma.partnerTask.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description ? data.description.trim() : null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId || null } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(isCompleting ? { completedAt: new Date(), completedById: userId } : {}),
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true } },
      },
    });

    await AuditLogService.record(prisma, {
      tenantId,
      userId,
      userName,
      action: isCompleting ? 'PARTNER_TASK_COMPLETED' : 'PARTNER_TASK_UPDATED',
      entity: 'PartnerTask',
      entityId: taskId,
      previousData: existing,
      newData: updated,
      req,
    });

    await centralEventBus.publish({
      tenantId,
      eventType: isCompleting ? 'PARTNER_TASK_COMPLETED' : 'PARTNER_TASK_UPDATED',
      entityId: taskId,
      entity: 'PartnerTask',
      userId,
      userName,
      data: {
        taskId,
        partnerId: existing.partnerId,
        partnerName: existing.partner.name,
        title: updated.title,
        status: updated.status,
        assignedToId: updated.assignedToId,
      },
    });

    return updated;
  }

  /**
   * Delete Task
   */
  public static async deleteTask(
    prisma: PrismaClient,
    tenantId: string,
    userId: string,
    userName: string,
    taskId: string,
    req?: express.Request
  ) {
    const existing = await prisma.partnerTask.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!existing) {
      throw new Error('Tarefa não encontrada.');
    }

    await prisma.partnerTask.delete({ where: { id: taskId } });

    await AuditLogService.record(prisma, {
      tenantId,
      userId,
      userName,
      action: 'PARTNER_TASK_DELETED',
      entity: 'PartnerTask',
      entityId: taskId,
      previousData: existing,
      req,
    });

    await centralEventBus.publish({
      tenantId,
      eventType: 'PARTNER_TASK_DELETED',
      entityId: taskId,
      entity: 'PartnerTask',
      userId,
      userName,
      data: { taskId, partnerId: existing.partnerId, title: existing.title },
    });

    return { success: true };
  }

  /**
   * List partner proposals with pagination & filters
   */
  public static async getPartnerProposals(
    prisma: PrismaClient,
    tenantId: string,
    partnerId: string,
    query: {
      status?: string;
      bank?: string;
      product?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      partnerId,
      deletedAt: null,
    };

    if (query.status && query.status !== 'ALL') {
      where.OR = [
        { statusId: query.status },
        { status: { name: query.status } },
      ];
    }

    if (query.bank && query.bank !== 'ALL') {
      where.OR = [
        { bankId: query.bank },
        { bank: { name: query.bank } },
      ];
    }

    if (query.product && query.product !== 'ALL') {
      where.OR = [
        { productId: query.product },
        { product: { name: query.product } },
      ];
    }

    const [total, proposals] = await Promise.all([
      prisma.proposal.count({ where }),
      prisma.proposal.findMany({
        where,
        include: {
          client: { select: { id: true, fullName: true, cpf: true, phone: true } },
          bank: { select: { id: true, name: true, code: true, color: true } },
          product: { select: { id: true, name: true, code: true } },
          status: { select: { id: true, name: true, code: true, color: true, standardCategory: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Mask CPFs
    const formatted = proposals.map(p => {
      const rawCpf = p.client?.cpf || '';
      const maskedCpf = rawCpf.length >= 11
        ? `${rawCpf.slice(0, 3)}.***.***-${rawCpf.slice(-2)}`
        : '***.***.***-**';

      return {
        ...p,
        client: p.client ? {
          ...p.client,
          name: p.client.fullName,
          cpf: maskedCpf,
        } : null,
      };
    });

    return {
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List partner simulations
   */
  public static async getPartnerSimulations(
    prisma: PrismaClient,
    tenantId: string,
    partnerId: string,
    limit: number = 50
  ) {
    const simulations = await prisma.simulationRequest.findMany({
      where: { tenantId, partnerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Mask CPF
    return simulations.map(s => {
      const rawCpf = s.cpf || '';
      const maskedCpf = rawCpf.length >= 11
        ? `${rawCpf.slice(0, 3)}.***.***-${rawCpf.slice(-2)}`
        : '***.***.***-**';
      return {
        ...s,
        cpf: maskedCpf,
      };
    });
  }

  /**
   * List partner pendencies
   */
  public static async getPartnerPendencies(
    prisma: PrismaClient,
    tenantId: string,
    partnerId: string,
    limit: number = 50
  ) {
    const pendencies = await prisma.pendency.findMany({
      where: { tenantId, partnerId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        proposal: { select: { id: true, proposalNumber: true, bank: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return pendencies;
  }
}
