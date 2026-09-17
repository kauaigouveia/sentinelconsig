import { PrismaClient, Prisma } from '@prisma/client';
import express from 'express';
import { AuditLogService, maskCPF } from './auditLogService.js';

export class SimulationService {
  /**
   * Evaluates if a given user can delete a specific simulation request.
   */
  public static canDeleteSimulationRequest(
    user: { id: string; role: string; tenantId?: string | null },
    effectiveTenantId: string,
    simulation: { tenantId: string; createdById: string; status: string }
  ): boolean {
    if (!user || !effectiveTenantId || !simulation) return false;

    // Strict multi-tenant check
    if (simulation.tenantId !== effectiveTenantId) {
      return false;
    }

    const role = user.role;

    // PLATFORM_MASTER / MASTER / TENANT_ADMIN / GESTOR / GERENTE
    if (
      role === 'PLATFORM_MASTER' ||
      role === 'MASTER' ||
      role === 'TENANT_ADMIN' ||
      role === 'GESTOR' ||
      role === 'GERENTE'
    ) {
      return true;
    }

    // DIGITADOR / SUPORTE
    if (role === 'DIGITADOR' || role === 'SUPORTE') {
      const isOwner = simulation.createdById === user.id;
      const isEligibleStatus = simulation.status !== 'DIGITADA PELA MESA';
      return isOwner && isEligibleStatus;
    }

    return false;
  }

  /**
   * Helper to normalize CPF to 11 raw digits.
   */
  public static normalizeCpf(cpf: string): string {
    return (cpf || '').replace(/\D/g, '');
  }

  /**
   * Check if there's an existing pending simulation ('SIMULAÇÃO ENVIADA') for the same CPF and Partner in the tenant.
   */
  public static async checkExistingPendingSimulation(
    prisma: PrismaClient,
    tenantId: string,
    cpf: string,
    partnerId: string
  ) {
    const cleanCpf = this.normalizeCpf(cpf);
    return prisma.simulationRequest.findFirst({
      where: {
        tenantId,
        partnerId,
        cpf: cleanCpf,
        status: 'SIMULAÇÃO ENVIADA',
        deletedAt: null,
      },
      include: {
        partner: true,
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  /**
   * Matches pending simulations when a proposal is created or updated.
   */
  public static async matchSimulationsForProposal(
    prisma: PrismaClient,
    proposal: {
      id: string;
      tenantId: string;
      proposalNumber: string;
      partnerId?: string | null;
      createdById?: string | null;
      client?: { cpf?: string | null } | null;
      clientId?: string | null;
    },
    digitizerName?: string
  ): Promise<number> {
    if (!proposal || !proposal.tenantId) return 0;

    let clientCpf = proposal.client?.cpf;
    if (!clientCpf && proposal.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: proposal.clientId },
        select: { cpf: true },
      });
      clientCpf = client?.cpf;
    }

    if (!clientCpf) return 0;
    const cleanCpf = this.normalizeCpf(clientCpf);
    if (!cleanCpf) return 0;

    const pendingSimulations = await prisma.simulationRequest.findMany({
      where: {
        tenantId: proposal.tenantId,
        cpf: cleanCpf,
        ...(proposal.partnerId ? { partnerId: proposal.partnerId } : {}),
        status: 'SIMULAÇÃO ENVIADA',
        deletedAt: null,
      },
    });

    if (pendingSimulations.length === 0) return 0;

    const now = new Date();
    let count = 0;

    for (const sim of pendingSimulations) {
      await prisma.simulationRequest.update({
        where: { id: sim.id },
        data: {
          status: 'DIGITADA PELA MESA',
          matchedProposalId: proposal.id,
          matchedProposalNumber: proposal.proposalNumber,
          matchedDigitizerId: proposal.createdById || null,
          matchedDigitizerName: digitizerName || 'Sistema',
          matchedAt: now,
        },
      });
      count++;
    }

    return count;
  }
}
