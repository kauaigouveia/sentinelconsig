import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { Request } from 'express';
import { verifyPassword, hashPassword } from './passwordService.js';
import { AuditLogService } from './auditLogService.js';
import { TenantResolver } from '../utils/tenantResolver.js';

export interface PartnerPortalSessionContext {
  session: {
    id: string;
    token: string;
    expiresAt: Date;
  };
  access: {
    id: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
  };
  partner: {
    id: string;
    name: string;
    code: string;
    email: string | null;
    phone: string | null;
    document: string | null;
    promoter: { id: string; name: string } | null;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    customDomain: string | null;
    whiteLabel?: {
      companyName?: string;
      logoUrl?: string | null;
    } | null;
  };
}

export class PartnerPortalService {
  /**
   * Extrai o token de sessão do cookie ou cabeçalho Authorization
   */
  public static extractPortalToken(req: Request): string | null {
    if (req.cookies && req.cookies.cg_partner_session_id) {
      return req.cookies.cg_partner_session_id;
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    return null;
  }

  /**
   * Valida a sessão do Portal do Parceiro no PostgreSQL
   */
  public static async getPartnerSession(
    req: Request,
    prisma: PrismaClient
  ): Promise<PartnerPortalSessionContext | null> {
    const token = this.extractPortalToken(req);
    if (!token) return null;

    try {
      const session = await prisma.partnerPortalSession.findUnique({
        where: { token },
        include: {
          partnerPortalAccess: true,
          partner: {
            include: {
              promoter: {
                select: { id: true, name: true },
              },
            },
          },
          tenant: {
            include: {
              whiteLabel: true,
            },
          },
        },
      });

      if (!session) return null;

      // 1. Checa expiração da sessão
      if (session.expiresAt < new Date()) {
        await prisma.partnerPortalSession.delete({ where: { id: session.id } }).catch(() => {});
        return null;
      }

      // 2. Checa status do usuário do portal
      if (!session.partnerPortalAccess || !session.partnerPortalAccess.active) {
        return null;
      }

      // 3. Checa status do parceiro
      if (!session.partner || session.partner.status !== 'ATIVO' || session.partner.deletedAt) {
        return null;
      }

      // 4. Checa status do tenant
      if (!session.tenant || session.tenant.status !== 'ACTIVE' || session.tenant.deletedAt) {
        return null;
      }

      // 5. TROCA DE TENANT / ISOLAMENTO DE HOST:
      // Se a requisição veio por um subdomínio ou domínio customizado de um tenant específico,
      // a sessão DEVE pertencer a esse mesmo tenant!
      // Se o usuário acessar outro tenant no mesmo navegador, a sessão atual é rejeitada,
      // exigindo nova autenticação no tenant correto sem vazar propostas ou mensagens.
      const host = TenantResolver.extractHost(req);
      const domainResolution = await TenantResolver.resolveByHost(prisma, host);
      if (
        domainResolution.tenant &&
        (domainResolution.type === 'CUSTOM_DOMAIN' || domainResolution.type === 'PLATFORM_SUBDOMAIN')
      ) {
        if (session.tenantId !== domainResolution.tenant.id) {
          return null;
        }
      }

      return {
        session: {
          id: session.id,
          token: session.token,
          expiresAt: session.expiresAt,
        },
        access: {
          id: session.partnerPortalAccess.id,
          name: session.partnerPortalAccess.name,
          email: session.partnerPortalAccess.email,
          mustChangePassword: session.partnerPortalAccess.mustChangePassword,
        },
        partner: {
          id: session.partner.id,
          name: session.partner.name,
          code: session.partner.code,
          email: session.partner.email,
          phone: session.partner.phone,
          document: session.partner.document,
          promoter: session.partner.promoter,
        },
        tenant: {
          id: session.tenant.id,
          name: session.tenant.whiteLabel?.companyName || session.tenant.name,
          slug: session.tenant.slug,
          customDomain: session.tenant.customDomain,
          whiteLabel: session.tenant.whiteLabel
            ? {
                companyName: session.tenant.whiteLabel.companyName,
                logoUrl: session.tenant.whiteLabel.logoUrl,
              }
            : null,
        },
      };
    } catch (err) {
      console.error('[PartnerPortalService.getPartnerSession ERROR]', err);
      return null;
    }
  }

  /**
   * Realiza login de parceiro no portal
   */
  public static async login(
    email: string,
    password: string,
    req: Request,
    prisma: PrismaClient
  ) {
    // 1. Resolve o contexto de tenant a partir do host da requisição (ex: grupoevolve.sentinelconsig.com.br)
    const host = TenantResolver.extractHost(req);
    const domainResolution = await TenantResolver.resolveByHost(prisma, host);

    if (domainResolution.type === 'DOMAIN_NOT_CONFIGURED') {
      return {
        success: false,
        statusCode: 403,
        message: 'Este domínio não está associado a nenhuma organização ativa do Sentinel Consig.',
      };
    }

    if (domainResolution.branding?.status === 'SUSPENDED') {
      return {
        success: false,
        statusCode: 403,
        message: 'Acesso temporariamente suspenso para esta organização. Contate o suporte.',
      };
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      return { success: false, statusCode: 400, message: 'E-mail e senha são obrigatórios.' };
    }

    // Se o domínio for específico de um tenant (CUSTOM_DOMAIN ou PLATFORM_SUBDOMAIN), busca estritamente nesse tenantId
    const targetTenantId = domainResolution.tenant?.id;

    const accessWhere: any = {
      email: { equals: cleanEmail, mode: 'insensitive' },
    };

    if (targetTenantId) {
      accessWhere.tenantId = targetTenantId;
    }

    const access = await prisma.partnerPortalAccess.findFirst({
      where: accessWhere,
      include: {
        partner: {
          include: {
            promoter: { select: { id: true, name: true } },
          },
        },
        tenant: {
          include: {
            whiteLabel: true,
          },
        },
      },
    });

    if (!access) {
      return { success: false, statusCode: 401, message: 'Credenciais inválidas ou acesso não cadastrado nesta empresa.' };
    }

    if (targetTenantId && access.tenantId !== targetTenantId) {
      return { success: false, statusCode: 401, message: 'Credenciais inválidas ou acesso não cadastrado nesta empresa.' };
    }

    if (!access.active) {
      return { success: false, statusCode: 403, message: 'Acesso do parceiro desativado. Contate o suporte.' };
    }

    if (!access.partner || access.partner.status !== 'ATIVO' || access.partner.deletedAt) {
      return { success: false, statusCode: 403, message: 'Cadastro de parceiro inativo ou suspenso.' };
    }

    if (!access.tenant || access.tenant.status !== 'ACTIVE' || access.tenant.deletedAt) {
      return { success: false, statusCode: 403, message: 'Empresa indisponível ou suspensa.' };
    }

    const match = await verifyPassword(cleanPassword, access.passwordHash);
    if (!match.valid) {
      return { success: false, statusCode: 401, message: 'Credenciais inválidas.' };
    }

    // Gerar token de sessão criptográfico
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    const session = await prisma.partnerPortalSession.create({
      data: {
        tenantId: access.tenantId,
        partnerId: access.partnerId,
        partnerPortalAccessId: access.id,
        token,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Unknown',
        expiresAt,
      },
    });

    // Atualiza último login
    await prisma.partnerPortalAccess.update({
      where: { id: access.id },
      data: { lastLoginAt: new Date() },
    });

    // Registro de auditoria
    await AuditLogService.record(prisma, {
      tenantId: access.tenantId,
      userId: null,
      userName: `Parceiro: ${access.name}`,
      action: 'PARTNER_PORTAL_LOGIN',
      entity: 'PARTNER_PORTAL',
      entityId: access.id,
      newData: {
        partnerId: access.partnerId,
        partnerName: access.partner.name,
        email: access.email,
        ip: req.ip,
      },
      req,
    });

    return {
      success: true,
      statusCode: 200,
      token: session.token,
      expiresAt: session.expiresAt,
      access: {
        id: access.id,
        name: access.name,
        email: access.email,
        active: access.active,
        mustChangePassword: access.mustChangePassword,
      },
      partner: {
        id: access.partner.id,
        name: access.partner.name,
        code: access.partner.code,
        email: access.partner.email,
        phone: access.partner.phone,
        document: access.partner.document,
        promoter: access.partner.promoter,
      },
      tenant: {
        id: access.tenant.id,
        name: access.tenant.whiteLabel?.companyName || access.tenant.name,
        slug: access.tenant.slug,
        customDomain: access.tenant.customDomain,
        whiteLabel: access.tenant.whiteLabel
          ? {
              companyName: access.tenant.whiteLabel.companyName,
              logoUrl: access.tenant.whiteLabel.logoUrl,
            }
          : null,
      },
    };
  }

  /**
   * Realiza logout
   */
  public static async logout(token: string, prisma: PrismaClient) {
    if (!token) return;
    try {
      await prisma.partnerPortalSession.delete({ where: { token } });
    } catch {}
  }

  /**
   * Altera a senha do parceiro
   */
  public static async changePassword(
    accessId: string,
    newPassword: string,
    currentSessionId: string,
    prisma: PrismaClient,
    currentPassword?: string
  ) {
    const clean = String(newPassword || '').trim();
    if (clean.length < 6) {
      return { success: false, statusCode: 400, message: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    const access = await prisma.partnerPortalAccess.findUnique({
      where: { id: accessId },
      select: { passwordHash: true, mustChangePassword: true },
    });
    if (!access) return { success: false, statusCode: 404, message: 'Acesso do parceiro não encontrado.' };

    if (!access.mustChangePassword) {
      if (typeof currentPassword !== 'string' || !currentPassword) {
        return { success: false, statusCode: 400, message: 'Informe sua senha atual.' };
      }
      const current = await verifyPassword(currentPassword, access.passwordHash);
      if (!current.valid) return { success: false, statusCode: 400, message: 'A senha atual está incorreta.' };
      const sameAsCurrent = await verifyPassword(clean, access.passwordHash);
      if (sameAsCurrent.valid) return { success: false, statusCode: 400, message: 'Escolha uma senha diferente da atual.' };
    }

    const passwordHash = await hashPassword(clean);
    await prisma.$transaction(async (tx) => {
      await tx.partnerPortalAccess.update({
        where: { id: accessId },
        data: {
          passwordHash,
          mustChangePassword: false,
        },
      });
      await tx.partnerPortalSession.deleteMany({
        where: {
          partnerPortalAccessId: accessId,
          id: { not: currentSessionId },
        },
      });
    });

    return { success: true, statusCode: 200, message: 'Senha atualizada com sucesso.' };
  }

  /**
   * Obtém os indicadores e dashboard do parceiro (com isolamento estrito)
   */
  public static async getDashboard(
    partnerId: string,
    tenantId: string,
    prisma: PrismaClient
  ) {
    const whereScope = {
      partnerId,
      tenantId,
      deletedAt: null,
    };

    const proposals = await prisma.proposal.findMany({
      where: whereScope,
      select: {
        id: true,
        proposalNumber: true,
        releasedValue: true,
        contractValue: true,
        type: true,
        standardCategory: true,
        statusId: true,
        createdAt: true,
        updatedAt: true,
        client: {
          select: { fullName: true, cpf: true },
        },
        bank: {
          select: { name: true, code: true },
        },
        product: {
          select: { name: true },
        },
        status: {
          select: { name: true, color: true, code: true, standardCategory: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    let inProgressCount = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let waitingReturnCount = 0;
    let totalDisbursed = 0;
    let totalContract = 0;

    for (const p of proposals) {
      const cat = p.status?.standardCategory || p.standardCategory;
      const code = p.status?.code || '';
      const released = Number(p.releasedValue || 0);
      const contract = Number(p.contractValue || 0);

      totalContract += contract;

      if (cat === 'PAGO' || code === 'PAGO' || code === 'CONCLUIDO') {
        completedCount++;
        totalDisbursed += released;
      } else if (cat === 'PENDENTE' || code.includes('PENDENCIA')) {
        pendingCount++;
      } else if (code.toUpperCase().includes('CIP') || code.toUpperCase().includes('RETORNO')) {
        waitingReturnCount++;
        inProgressCount++;
      } else if (cat === 'ESTEIRA' || cat === 'ANDAMENTO') {
        inProgressCount++;
      }
    }

    // Propostas recentes (máximo 5)
    const recentProposals = proposals.slice(0, 5).map((p) => ({
      id: p.id,
      proposalNumber: p.proposalNumber,
      clientName: p.client?.fullName || 'Cliente',
      clientCpfMasked: this.maskCpf(p.client?.cpf),
      bankName: p.bank?.name || 'Banco',
      productName: p.product?.name || 'Consignado',
      releasedValue: Number(p.releasedValue || 0),
      contractValue: Number(p.contractValue || 0),
      statusName: p.status?.name || 'Em Análise',
      statusColor: p.status?.color || '#3b82f6',
      statusCode: p.status?.code || 'ANALISE',
      standardCategory: p.status?.standardCategory || p.standardCategory,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return {
      metrics: {
        totalProposals: proposals.length,
        inProgressCount,
        completedCount,
        pendingCount,
        waitingReturnCount,
        totalDisbursed,
        totalContract,
      },
      recentProposals,
    };
  }

  /**
   * Lista propostas do parceiro com filtros e paginação (com isolamento estrito)
   */
  public static async getProposals(
    partnerId: string,
    tenantId: string,
    options: {
      search?: string;
      statusId?: string;
      standardCategory?: string;
      waitingReturnOnly?: boolean;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
    prisma: PrismaClient
  ) {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
    const skip = (page - 1) * limit;

    const where: any = {
      partnerId,
      tenantId,
      deletedAt: null,
    };
    const queryFilters: any[] = [];

    if (options.statusId) {
      where.statusId = options.statusId;
    }

    if (options.standardCategory) {
      queryFilters.push({
        OR: [
          { standardCategory: options.standardCategory },
          { status: { is: { standardCategory: options.standardCategory } } },
        ],
      });
    }

    if (options.waitingReturnOnly) {
      queryFilters.push({
        status: {
          is: {
            OR: [
              { code: { contains: 'CIP', mode: 'insensitive' } },
              { code: { contains: 'RETORNO', mode: 'insensitive' } },
            ],
          },
        },
      });
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        const startDate = new Date(`${options.startDate.slice(0, 10)}T00:00:00`);
        if (!Number.isNaN(startDate.getTime())) where.createdAt.gte = startDate;
      }
      if (options.endDate) {
        const endDate = new Date(`${options.endDate.slice(0, 10)}T00:00:00`);
        if (!Number.isNaN(endDate.getTime())) {
          endDate.setDate(endDate.getDate() + 1);
          where.createdAt.lt = endDate;
        }
      }
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    if (options.search) {
      const term = options.search.trim();
      const rawCpf = term.replace(/\D/g, '');

      queryFilters.push({
        OR: [
          { proposalNumber: { contains: term, mode: 'insensitive' } },
          { client: { fullName: { contains: term, mode: 'insensitive' } } },
          ...(rawCpf.length >= 3 ? [{ client: { cpf: { contains: rawCpf } } }] : []),
        ],
      });
    }

    if (queryFilters.length > 0) where.AND = queryFilters;

    const [total, proposals] = await Promise.all([
      prisma.proposal.count({ where }),
      prisma.proposal.findMany({
        where,
        select: {
          id: true,
          proposalNumber: true,
          releasedValue: true,
          contractValue: true,
          installmentValue: true,
          installmentsCount: true,
          type: true,
          standardCategory: true,
          createdAt: true,
          updatedAt: true,
          client: {
            select: { fullName: true, cpf: true },
          },
          bank: {
            select: { name: true, code: true },
          },
          product: {
            select: { name: true },
          },
          convenio: {
            select: { name: true },
          },
          status: {
            select: { id: true, name: true, color: true, code: true, standardCategory: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const items = proposals.map((p) => ({
      id: p.id,
      proposalNumber: p.proposalNumber,
      clientName: p.client?.fullName || 'Cliente',
      clientCpfMasked: this.maskCpf(p.client?.cpf),
      bankName: p.bank?.name || 'Banco',
      productName: p.product?.name || 'Consignado',
      convenioName: p.convenio?.name || null,
      type: p.type,
      releasedValue: Number(p.releasedValue || 0),
      contractValue: Number(p.contractValue || 0),
      installmentValue: Number(p.installmentValue || 0),
      installmentsCount: p.installmentsCount,
      statusName: p.status?.name || 'Em Andamento',
      statusColor: p.status?.color || '#3b82f6',
      statusCode: p.status?.code || 'ANALISE',
      standardCategory: p.status?.standardCategory || p.standardCategory,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detalhes de uma proposta específica para o parceiro (com timeline e pendências públicas)
   */
  public static async getProposalDetail(
    proposalId: string,
    partnerId: string,
    tenantId: string,
    prisma: PrismaClient
  ) {
    const proposal = await prisma.proposal.findFirst({
      where: {
        id: proposalId,
        partnerId,
        tenantId,
        deletedAt: null,
      },
      include: {
        client: {
          select: { fullName: true, cpf: true, phone: true, email: true },
        },
        bank: {
          select: { name: true, code: true },
        },
        product: {
          select: { name: true },
        },
        convenio: {
          select: { name: true },
        },
        status: {
          select: { id: true, name: true, color: true, code: true, standardCategory: true },
        },
        pendencies: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!proposal) return null;

    // Constrói timeline amigável para o parceiro
    const timeline = this.buildPartnerTimeline(proposal);

    return {
      id: proposal.id,
      proposalNumber: proposal.proposalNumber,
      clientName: proposal.client?.fullName || 'Cliente',
      clientCpfMasked: this.maskCpf(proposal.client?.cpf),
      bankName: proposal.bank?.name || 'Banco',
      productName: proposal.product?.name || 'Consignado',
      convenioName: proposal.convenio?.name || null,
      type: proposal.type,
      contractValue: Number(proposal.contractValue || 0),
      releasedValue: Number(proposal.releasedValue || 0),
      installmentValue: Number(proposal.installmentValue || 0),
      installmentsCount: proposal.installmentsCount,
      debtBalance: proposal.debtBalance ? Number(proposal.debtBalance) : null,
      originalBankCode: proposal.originalBankCode || null,
      cipNumber: proposal.cipNumber || null,
      statusName: proposal.status?.name || 'Em Andamento',
      statusColor: proposal.status?.color || '#3b82f6',
      statusCode: proposal.status?.code || 'ANALISE',
      statusDescription: null,
      standardCategory: proposal.status?.standardCategory || proposal.standardCategory,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
      timeline,
      pendencies: proposal.pendencies.map((pen) => ({
        id: pen.id,
        title: pen.title,
        description: pen.description,
        status: pen.status,
        createdAt: pen.createdAt,
        resolvedAt: pen.resolvedAt,
      })),
    };
  }

  /**
   * Constrói a timeline amigável voltada para o parceiro
   */
  private static buildPartnerTimeline(proposal: any) {
    const steps = [
      {
        id: 'created',
        title: 'Proposta Cadastrada',
        description: 'Proposta registrada na esteira e enviada para análise cadastral.',
        completed: true,
        date: proposal.createdAt,
      },
      {
        id: 'analysis',
        title: 'Em Análise Bancária',
        description: 'Validação de margem e esteira junto à instituição financeira.',
        completed: proposal.standardCategory !== 'CANCELADO' && proposal.standardCategory !== 'RECUSADO',
        date: proposal.updatedAt,
      },
    ];

    if (proposal.type === 'PORTABILIDADE' || proposal.type === 'REFIN_PORTABILIDADE') {
      const isPortFinished = proposal.standardCategory === 'PAGO';
      steps.push({
        id: 'cip_waiting',
        title: 'Consulta / Retorno CIP',
        description: 'Aguardando envio do saldo devedor e retenção pelo banco originador.',
        completed: isPortFinished || proposal.debtBalance !== null,
        date: proposal.debtBalance ? proposal.updatedAt : undefined,
      });
    }

    const isPaid = proposal.standardCategory === 'PAGO' || proposal.status?.code === 'PAGO';
    const isRefused = proposal.standardCategory === 'RECUSADO' || proposal.status?.code === 'RECUSADO';
    const isCanceled = proposal.standardCategory === 'CANCELADO' || proposal.status?.code === 'CANCELADO';

    if (isPaid) {
      steps.push({
        id: 'completed',
        title: 'Proposta Concluída & Paga',
        description: 'Crédito liberado com sucesso na conta do proponente.',
        completed: true,
        date: proposal.updatedAt,
      });
    } else if (isRefused) {
      steps.push({
        id: 'refused',
        title: 'Proposta Recusada / Reprovada',
        description: proposal.status?.description || 'A proposta foi recusada pelas políticas de crédito da instituição.',
        completed: true,
        date: proposal.updatedAt,
      });
    } else if (isCanceled) {
      steps.push({
        id: 'canceled',
        title: 'Proposta Cancelada',
        description: 'Operação cancelada.',
        completed: true,
        date: proposal.updatedAt,
      });
    } else {
      steps.push({
        id: 'finalization',
        title: 'Formalização & Pagamento',
        description: 'Aguardando assinatura digital do contrato e liquidação financeira.',
        completed: false,
        date: undefined,
      });
    }

    return steps;
  }

  /**
   * Mascara CPF para exibição segura no portal
   */
  public static maskCpf(cpf?: string | null): string {
    if (!cpf) return '***.***.***-**';
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) return '***.***.***-**';
    return `***.***.${cleaned.substring(6, 9)}-**`;
  }

  /**
   * Gera uma senha temporária aleatória, criptograficamente segura e suficientemente longa
   * Pelo menos 16 caracteres com maiúsculas, minúsculas, números e símbolos
   */
  public static generateSecureTemporaryPassword(): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghjkmnpqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%&*';
    const allChars = uppercase + lowercase + numbers + symbols;

    let pwd = '';
    pwd += uppercase[crypto.randomInt(0, uppercase.length)];
    pwd += lowercase[crypto.randomInt(0, lowercase.length)];
    pwd += numbers[crypto.randomInt(0, numbers.length)];
    pwd += symbols[crypto.randomInt(0, symbols.length)];

    for (let i = 4; i < 16; i++) {
      pwd += allChars[crypto.randomInt(0, allChars.length)];
    }

    // Shuffle dos caracteres
    const arr = pwd.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
  }

  /**
   * Constrói o link do portal a partir do host da requisição ou dados do tenant
   */
  public static buildPortalUrl(req: Request, tenant: { slug: string; customDomain?: string | null }): string {
    const rawHost = TenantResolver.extractHost(req);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
    const protocol = isHttps ? 'https' : 'http';

    if (rawHost && !rawHost.includes('localhost') && !rawHost.includes('127.0.0.1')) {
      return `${protocol}://${rawHost}/parceiro`;
    }

    if (tenant.customDomain) {
      return `https://${tenant.customDomain}/parceiro`;
    }

    return `https://${tenant.slug}.sentinelconsig.com.br/parceiro`;
  }
}
