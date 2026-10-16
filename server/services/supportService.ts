import { PrismaClient } from '@prisma/client';
import { eventBus, CentralEventBus } from './eventBus.js';
import { TelegramNotificationService } from './telegramNotificationService.js';
import { EvolutionService } from './evolutionService.js';
import { canAccessSimulationSupport, canAccessTelegramSupport, supportDepartmentScope } from '../../src/lib/supportAccess.js';

const messageSelect = { id: true, conversationId: true, senderType: true, senderId: true, senderName: true, message: true, channel: true, externalMessageId: true, readAt: true, createdAt: true, deliveryStatus: true, attachmentName: true, attachmentMime: true } as const;

export type EventBus = CentralEventBus;

export interface SupportMessageDTO {
  id: string;
  conversationId: string;
  senderType: 'PARTNER' | 'SUPPORT' | 'SYSTEM';
  senderId?: string | null;
  senderName?: string | null;
  message: string;
  channel: 'PORTAL' | 'WHATSAPP' | 'TELEGRAM';
  externalMessageId?: string | null;
  readAt?: Date | null;
  createdAt: Date;
}

export class SupportService {
  /**
   * Lista conversas do parceiro
   */
  public static async listPartnerConversations(
    partnerId: string,
    tenantId: string,
    prisma: PrismaClient
  ) {
    const conversations = await prisma.supportConversation.findMany({
      where: {
        partnerId,
        tenantId,
      },
      include: {
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            client: { select: { fullName: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: messageSelect,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Contagem de não lidas para o parceiro em cada conversa
    const conversationIds = conversations.map((c) => c.id);
    const unreadMessages = await prisma.supportMessage.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversationIds },
        tenantId,
        senderType: { not: 'PARTNER' },
        readAt: null,
      },
      _count: { id: true },
    });

    const unreadMap = new Map<string, number>();
    for (const u of unreadMessages) {
      unreadMap.set(u.conversationId, u._count.id);
    }

    return conversations.map((c) => ({
      id: c.id,
      partnerId: c.partnerId,
      proposalId: c.proposalId,
      proposalNumber: c.proposal?.proposalNumber || null,
      proposalClientName: c.proposal?.client?.fullName || null,
      channel: c.channel,
      status: c.status,
      subject: c.subject,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
      lastMessage: c.messages[0]
        ? {
            id: c.messages[0].id,
            message: c.messages[0].message,
            senderType: c.messages[0].senderType,
            senderName: c.messages[0].senderName,
            createdAt: c.messages[0].createdAt,
          }
        : null,
      unreadCount: unreadMap.get(c.id) || 0,
    }));
  }

  /**
   * Obtém ou cria conversa vinculada (opcionalmente a uma proposta)
   */
  public static async getOrCreateConversation(
    partnerId: string,
    tenantId: string,
    options: {
      proposalId?: string;
      subject?: string;
      channel?: string;
    },
    prisma: PrismaClient,
    eventBus?: EventBus
  ) {
    // 1. Se informada proposalId, valida posse estrita do parceiro
    if (options.proposalId) {
      const prop = await prisma.proposal.findFirst({
        where: {
          id: options.proposalId,
          partnerId,
          tenantId,
          deletedAt: null,
        },
      });
      if (!prop) {
        throw new Error('Proposta não encontrada ou não pertence a este parceiro.');
      }

      // Procura conversa aberta existente para esta proposta
      const existing = await prisma.supportConversation.findFirst({
        where: {
          partnerId,
          tenantId,
          proposalId: options.proposalId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
      });
      if (existing) return existing;
    }

    // 2. Cria nova conversa
    const conversation = await prisma.supportConversation.create({
      data: {
        tenantId,
        partnerId,
        proposalId: options.proposalId || null,
        subject: options.subject || (options.proposalId ? `Atendimento Proposta` : `Suporte Geral`),
        channel: options.channel || 'PORTAL',
        status: 'OPEN',
        lastMessageAt: new Date(),
      },
      include: {
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            client: { select: { fullName: true } },
          },
        },
      },
    });

    if (eventBus) {
      eventBus.publish({
        eventType: 'SUPPORT_CONVERSATION_CREATED',
        tenantId,
        entity: 'SUPPORT',
        entityId: conversation.id,
        data: { conversationId: conversation.id, partnerId },
      });
    }

    return conversation;
  }

  /**
   * Obtém mensagens de uma conversa e marca as pendentes como lidas
   */
  public static async getMessages(
    conversationId: string,
    options: {
      partnerId?: string;
      tenantId: string;
      isPartner: boolean;
      adminRole?: string;
    },
    prisma: PrismaClient
  ) {
    const convWhere: any = {
      id: conversationId,
      tenantId: options.tenantId,
      ...(!options.isPartner ? supportDepartmentScope(options.adminRole) : {}),
    };
    if (options.partnerId) {
      convWhere.partnerId = options.partnerId;
    }

    const conversation = await prisma.supportConversation.findFirst({
      where: convWhere,
      include: {
        partner: {
          select: { id: true, name: true, code: true },
        },
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            client: { select: { fullName: true } },
          },
        },
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!conversation) return null;

    // Marca como lidas as mensagens recebidas
    if (options.isPartner) {
      await prisma.supportMessage.updateMany({
        where: {
          conversationId,
          senderType: { not: 'PARTNER' },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    } else {
      await prisma.supportMessage.updateMany({
        where: {
          conversationId,
          senderType: 'PARTNER',
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    }

    const messages = await prisma.supportMessage.findMany({
      where: {
        conversationId,
        tenantId: options.tenantId,
      },
      orderBy: { createdAt: 'asc' },
      select: messageSelect,
    });

    return {
      conversation: {
        id: conversation.id,
        partnerId: conversation.partnerId,
        partnerName: conversation.partner?.name,
        partnerCode: conversation.partner?.code,
        proposalId: conversation.proposalId,
        proposalNumber: conversation.proposal?.proposalNumber || null,
        proposalClientName: conversation.proposal?.client?.fullName || null,
        assignedUserId: conversation.assignedUserId,
        assignedUserName: conversation.assignedUser?.name || null,
        rating: conversation.rating,
        ratingComment: conversation.ratingComment,
        ratedAt: conversation.ratedAt,
        channel: conversation.channel,
        department: conversation.department,
        simulationStage: conversation.simulationStage,
        simulationData: conversation.simulationData,
        status: conversation.status,
        subject: conversation.subject,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
      },
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderType: m.senderType as 'PARTNER' | 'SUPPORT' | 'SYSTEM',
        senderId: m.senderId,
        senderName: m.senderName,
        message: m.message,
        channel: m.channel as 'PORTAL' | 'WHATSAPP' | 'TELEGRAM',
        externalMessageId: m.externalMessageId,
        deliveryStatus: m.deliveryStatus,
        attachmentName: m.attachmentName,
        attachmentMime: m.attachmentMime,
        readAt: m.readAt,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Envia mensagem pelo parceiro no portal
   */
  public static async sendPartnerMessage(
    conversationId: string,
    partnerId: string,
    tenantId: string,
    senderId: string,
    senderName: string,
    messageText: string,
    prisma: PrismaClient,
    eventBus?: EventBus
  ) {
    const cleanText = String(messageText || '').trim();
    if (!cleanText) {
      throw new Error('O conteúdo da mensagem não pode ser vazio.');
    }

    const conversation = await prisma.supportConversation.findFirst({
      where: {
        id: conversationId,
        partnerId,
        tenantId,
      },
    });

    if (!conversation) {
      throw new Error('Conversa de atendimento não encontrada ou sem permissão.');
    }
    if (conversation.channel === 'TELEGRAM') throw new Error('Continue esta conversa pelo Telegram da empresa.');
    if (conversation.channel === 'WHATSAPP') throw new Error('Continue esta conversa pelo WhatsApp do canal de simulação.');

    const message = await prisma.supportMessage.create({
      data: {
        tenantId,
        conversationId,
        senderType: 'PARTNER',
        senderId,
        senderName,
        message: cleanText,
        channel: 'PORTAL',
      },
    });

    // Atualiza status da conversa se estava resolvida
    await prisma.supportConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        status: conversation.status === 'RESOLVED' ? 'OPEN' : conversation.status,
      },
    });

    if (eventBus) {
      eventBus.publish({
        eventType: 'SUPPORT_MESSAGE_RECEIVED',
        tenantId,
        entity: 'SUPPORT',
        entityId: conversationId,
        data: {
          conversationId,
          messageId: message.id,
          senderType: 'PARTNER',
          senderName,
          message: cleanText,
          partnerId,
        },
      });
    }

    return message;
  }

  /**
   * Envia mensagem pelo operador de suporte interno
   */
  public static async sendStaffMessage(
    conversationId: string,
    tenantId: string,
    userId: string,
    userName: string,
    messageText: string,
    prisma: PrismaClient,
    eventBus?: EventBus,
    adminRole?: string
  ) {
    const cleanText = String(messageText || '').trim();
    if (!cleanText) {
      throw new Error('O conteúdo da mensagem não pode ser vazio.');
    }

    const conversation = await prisma.supportConversation.findFirst({
      where: {
        id: conversationId,
        tenantId,
      },
    });

    if (!conversation) {
      throw new Error('Conversa não encontrada.');
    }

    if (conversation.channel === 'TELEGRAM' && !canAccessTelegramSupport(adminRole)) throw new Error('Atendimento Telegram disponível para o perfil Suporte e administração.');
    if (conversation.department === 'SIMULATION' && !canAccessSimulationSupport(adminRole)) throw new Error('Acesso à mesa de simulação não permitido para este perfil.');

    if (conversation.channel === 'TELEGRAM' && cleanText.length > 3500) throw new Error('Envie até 3.500 caracteres por mensagem no Telegram.');
    const message = await prisma.supportMessage.create({
      data: {
        tenantId,
        conversationId,
        senderType: 'SUPPORT',
        senderId: userId,
        senderName: userName,
        message: cleanText,
        channel: conversation.channel,
        deliveryStatus: ['WHATSAPP','TELEGRAM'].includes(conversation.channel) ? 'PENDING' : 'RECEIVED',
      },
    });

    await prisma.supportConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        status: conversation.status === 'OPEN' ? 'IN_PROGRESS' : conversation.status,
        assignedUserId: conversation.assignedUserId || userId,
        simulationStage: conversation.department === 'SIMULATION' ? 'ATTENDING' : undefined,
      },
    });

    if (eventBus) {
      eventBus.publish({
        eventType: 'SUPPORT_MESSAGE_RECEIVED',
        tenantId,
        entity: 'SUPPORT',
        entityId: conversationId,
        data: {
          conversationId,
          messageId: message.id,
          senderType: 'SUPPORT',
          ...(conversation.channel !== 'TELEGRAM' ? { senderName: userName, message: cleanText } : {}),
          partnerId: conversation.partnerId,
        },
      });
    }

    if (conversation.channel === 'TELEGRAM') {
      try { await TelegramNotificationService.deliverSupport(message.id, tenantId, prisma); } catch { /* Stored delivery state remains visible to support. */ }
      return prisma.supportMessage.findUnique({where:{id:message.id},select:messageSelect});
    }
    if (conversation.channel === 'WHATSAPP') {
      try { await EvolutionService.deliver(message.id, tenantId, prisma); }
      catch { /* The persisted FAILED status is visible in the conversation and can be retried. */ }
      return prisma.supportMessage.findUnique({ where: { id: message.id }, select: messageSelect });
    }
    return message;
  }

  /**
   * Lista conversas para a Central de Atendimento Administrativa (com filtros e tenant scope)
   */
  public static async listAdminConversations(
    tenantId: string,
    filters: {
      status?: string;
      partnerId?: string;
      assignedUserId?: string;
      channel?: string;
      department?: string;
      search?: string;
      adminRole?: string;
    },
    prisma: PrismaClient
  ) {
    const where: any = {
      tenantId,
    };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    if (filters.partnerId) {
      where.partnerId = filters.partnerId;
    }

    if (filters.assignedUserId) {
      where.assignedUserId = filters.assignedUserId;
    }

    if (filters.channel && filters.channel !== 'ALL') {
      where.channel = filters.channel;
    }
    if (filters.department && filters.department !== 'ALL') where.department = filters.department;
    // Keep role restrictions independent from user-supplied filters.
    where.AND = [supportDepartmentScope(filters.adminRole)];

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { subject: { contains: term, mode: 'insensitive' } },
        { partner: { name: { contains: term, mode: 'insensitive' } } },
        { partner: { code: { contains: term, mode: 'insensitive' } } },
        { proposal: { proposalNumber: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const conversations = await prisma.supportConversation.findMany({
      where,
      include: {
        partner: {
          select: { id: true, name: true, code: true, phone: true, email: true },
        },
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            client: { select: { fullName: true } },
            bank: { select: { name: true } },
          },
        },
        assignedUser: {
          select: { id: true, name: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: messageSelect,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Contagem de não lidas pelo suporte
    const unreadMessages = await prisma.supportMessage.groupBy({
      by: ['conversationId'],
      where: {
        tenantId,
        senderType: 'PARTNER',
        readAt: null,
      },
      _count: { id: true },
    });

    const unreadMap = new Map<string, number>();
    for (const u of unreadMessages) {
      unreadMap.set(u.conversationId, u._count.id);
    }

    return conversations.map((c) => ({
      id: c.id,
      partnerId: c.partnerId,
      partnerName: c.partner?.name,
      partnerCode: c.partner?.code,
      proposalId: c.proposalId,
      proposalNumber: c.proposal?.proposalNumber || null,
      proposalClientName: c.proposal?.client?.fullName || null,
      bankName: c.proposal?.bank?.name || null,
      department: c.department,
      simulationStage: c.simulationStage,
      assignedUserId: c.assignedUserId,
      assignedUserName: c.assignedUser?.name || null,
      channel: c.channel,
      status: c.status,
      subject: c.subject,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
      lastMessage: c.messages[0]
        ? {
            id: c.messages[0].id,
            message: c.messages[0].message,
            senderType: c.messages[0].senderType,
            senderName: c.messages[0].senderName,
            createdAt: c.messages[0].createdAt,
          }
        : null,
      unreadCount: unreadMap.get(c.id) || 0,
    }));
  }

  /**
   * Atualiza status ou atribuição de uma conversa
   */
  public static async updateConversation(
    conversationId: string,
    tenantId: string,
    data: {
      status?: string;
      assignedUserId?: string | null;
    },
    prisma: PrismaClient,
    eventBus?: EventBus,
    adminRole?: string
  ) {
    const conversation = await prisma.supportConversation.findFirst({
      where: { id: conversationId, tenantId },
    });

    if (!conversation) {
      throw new Error('Conversa não encontrada.');
    }

    if (conversation.channel === 'TELEGRAM' && !canAccessTelegramSupport(adminRole)) throw new Error('Atendimento Telegram disponível para o perfil Suporte e administração.');
    if (conversation.department === 'SIMULATION' && !canAccessSimulationSupport(adminRole)) throw new Error('Acesso à mesa de simulação não permitido para este perfil.');
    if (conversation.channel === 'TELEGRAM' && data.assignedUserId) {
      const assignee = await prisma.user.findFirst({where:{id:data.assignedUserId,tenantId,active:true},select:{role:true}});
      if (!assignee || !canAccessTelegramSupport(assignee.role)) throw new Error('Escolha um responsável com perfil Suporte.');
    }
    if (conversation.department === 'SIMULATION' && data.assignedUserId) {
      const assignee = await prisma.user.findFirst({ where: { id: data.assignedUserId, tenantId, active: true }, select: { role: true } });
      if (!assignee || !canAccessSimulationSupport(assignee.role)) throw new Error('Escolha um responsável com perfil de acesso à mesa de simulação.');
    }

    const updated = await prisma.supportConversation.update({
      where: { id: conversationId },
      data: {
        status: data.status || undefined,
        assignedUserId: data.assignedUserId !== undefined ? data.assignedUserId : undefined,
      },
    });

    if (eventBus) {
      eventBus.publish({
        eventType: 'SUPPORT_CONVERSATION_STATUS_CHANGED',
        tenantId,
        entity: 'SUPPORT',
        entityId: conversationId,
        data: { conversationId, status: updated.status, assignedUserId: updated.assignedUserId },
      });
    }

    return updated;
  }

  /**
   * Métricas operacionais da Central de Atendimento
   */
  public static async getMetrics(tenantId: string, prisma: PrismaClient, adminRole?: string) {
    const scope = supportDepartmentScope(adminRole);
    const [openCount, inProgressCount, resolvedCount, totalMessagesToday] = await Promise.all([
      prisma.supportConversation.count({
        where: { tenantId, status: 'OPEN', ...scope },
      }),
      prisma.supportConversation.count({
        where: { tenantId, status: 'IN_PROGRESS', ...scope },
      }),
      prisma.supportConversation.count({
        where: { tenantId, status: 'RESOLVED', ...scope },
      }),
      prisma.supportMessage.count({
        where: {
          tenantId,
          conversation: scope,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      openCount,
      inProgressCount,
      resolvedCount,
      totalActive: openCount + inProgressCount,
      totalMessagesToday,
    };
  }

  /**
   * Processador Idempotente de Webhooks do WhatsApp
   */
  public static async processWhatsAppWebhook(
    tenantId: string,
    payload: {
      externalMessageId: string;
      senderPhone: string;
      senderName?: string;
      message: string;
      timestamp?: string | number;
    },
    prisma: PrismaClient,
    eventBus?: EventBus
  ) {
    if (!payload.externalMessageId || !payload.message || !payload.senderPhone) {
      return { success: false, reason: 'invalid_payload' };
    }

    // 1. Verificação de Idempotência: rejeita se já processada
    const existing = await prisma.supportMessage.findFirst({
      where: {
        tenantId,
        externalMessageId: payload.externalMessageId,
      },
    });

    if (existing) {
      return { success: true, status: 'already_processed', messageId: existing.id };
    }

    // 2. Localiza parceiro pelo telefone ou celular
    const cleanPhone = payload.senderPhone.replace(/\D/g, '');
    const partner = await prisma.partner.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        phone: { contains: cleanPhone.slice(-8) }, // Correspondência dos últimos 8 dígitos
      },
    });

    if (!partner) {
      // Se parceiro não for encontrado no tenant, cria conversa com o primeiro parceiro geral ou registra alerta
      return { success: false, reason: 'partner_not_found_for_phone' };
    }

    // 3. Localiza ou cria conversa de WhatsApp para o parceiro
    let conversation = await prisma.supportConversation.findFirst({
      where: {
        tenantId,
        partnerId: partner.id,
        channel: 'WHATSAPP',
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
    });

    if (!conversation) {
      conversation = await prisma.supportConversation.create({
        data: {
          tenantId,
          partnerId: partner.id,
          channel: 'WHATSAPP',
          subject: `Atendimento WhatsApp (${payload.senderPhone})`,
          status: 'OPEN',
          lastMessageAt: new Date(),
        },
      });
    }

    // 4. Cria a mensagem vinculada com externalMessageId
    const message = await prisma.supportMessage.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        senderType: 'PARTNER',
        senderName: payload.senderName || partner.name,
        message: payload.message.trim(),
        channel: 'WHATSAPP',
        externalMessageId: payload.externalMessageId,
      },
    });

    await prisma.supportConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        status: conversation.status === 'RESOLVED' ? 'OPEN' : conversation.status,
      },
    });

    if (eventBus) {
      eventBus.publish({
        eventType: 'SUPPORT_MESSAGE_RECEIVED',
        tenantId,
        entity: 'SUPPORT',
        entityId: conversation.id,
        data: {
          conversationId: conversation.id,
          messageId: message.id,
          senderType: 'PARTNER',
          senderName: payload.senderName || partner.name,
          message: payload.message,
          channel: 'WHATSAPP',
          partnerId: partner.id,
        },
      });
    }

    return { success: true, status: 'processed', messageId: message.id };
  }
}
