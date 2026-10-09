// Client API Service for Sentinel Consig Partner Portal

export interface PartnerPortalAccessInfo {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

export interface PartnerInfo {
  id: string;
  name: string;
  code: string;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  promoter?: { id: string; name: string } | null;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  whiteLabel?: {
    companyName?: string;
    logoUrl?: string | null;
  } | null;
}

export interface PartnerPortalSessionResponse {
  authenticated: boolean;
  access?: PartnerPortalAccessInfo;
  partner?: PartnerInfo;
  tenant?: TenantInfo;
}

export interface PartnerDashboardData {
  partner: PartnerInfo;
  tenant: TenantInfo;
  metrics: {
    totalProposals: number;
    inProgressCount: number;
    completedCount: number;
    pendingCount: number;
    waitingReturnCount: number;
    totalDisbursed: number;
    totalContract: number;
  };
  recentProposals: Array<{
    id: string;
    proposalNumber: string;
    clientName: string;
    clientCpfMasked: string;
    bankName: string;
    productName: string;
    releasedValue: number;
    contractValue: number;
    statusName: string;
    statusColor: string;
    statusCode: string;
    standardCategory: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface PartnerProposalListItem {
  id: string;
  proposalNumber: string;
  clientName: string;
  clientCpfMasked: string;
  bankName: string;
  productName: string;
  convenioName?: string | null;
  type: string;
  releasedValue: number;
  contractValue: number;
  installmentValue: number;
  installmentsCount: number;
  statusName: string;
  statusColor: string;
  statusCode: string;
  standardCategory: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerProposalDetailData {
  id: string;
  proposalNumber: string;
  clientName: string;
  clientCpfMasked: string;
  bankName: string;
  productName: string;
  convenioName?: string | null;
  type: string;
  contractValue: number;
  releasedValue: number;
  installmentValue: number;
  installmentsCount: number;
  debtBalance?: number | null;
  originalBankCode?: string | null;
  cipNumber?: string | null;
  statusName: string;
  statusColor: string;
  statusCode: string;
  statusDescription?: string | null;
  standardCategory: string;
  createdAt: string;
  updatedAt: string;
  timeline: Array<{
    id: string;
    title: string;
    description: string;
    completed: boolean;
    date?: string;
  }>;
  pendencies: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    createdAt: string;
    resolvedAt?: string | null;
  }>;
}

export interface PartnerSupportConversation {
  id: string;
  partnerId: string;
  proposalId?: string | null;
  proposalNumber?: string | null;
  proposalClientName?: string | null;
  channel: 'PORTAL' | 'WHATSAPP';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  subject?: string | null;
  lastMessageAt: string;
  createdAt: string;
  lastMessage?: {
    id: string;
    message: string;
    senderType: 'PARTNER' | 'SUPPORT' | 'SYSTEM';
    senderName?: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
}

export interface PartnerSupportMessage {
  id: string;
  conversationId: string;
  senderType: 'PARTNER' | 'SUPPORT' | 'SYSTEM';
  senderId?: string | null;
  senderName?: string | null;
  message: string;
  channel: 'PORTAL' | 'WHATSAPP';
  externalMessageId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export class PartnerPortalClient {
  public static async login(email: string, password: string) {
    const res = await fetch('/api/partner-portal/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao realizar login no Portal do Parceiro.');
    }
    return data;
  }

  public static async logout() {
    await fetch('/api/partner-portal/auth/logout', { method: 'POST' });
  }

  public static async getSession(): Promise<PartnerPortalSessionResponse> {
    const res = await fetch('/api/partner-portal/auth/session');
    if (!res.ok) {
      return { authenticated: false };
    }
    return res.json();
  }

  public static async changePassword(newPassword: string, currentPassword?: string) {
    const res = await fetch('/api/partner-portal/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword, currentPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao alterar senha.');
    }
    return data;
  }

  public static async updateContact(payload: { email: string; phone: string }): Promise<{ email: string | null; phone: string | null }> {
    const res = await fetch('/api/partner-portal/profile/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar os contatos do parceiro.');
    return data;
  }

  public static async getDashboard(): Promise<PartnerDashboardData> {
    const res = await fetch('/api/partner-portal/dashboard');
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao carregar dados do painel.');
    }
    return res.json();
  }

  public static async getProposals(params: {
    search?: string;
    statusId?: string;
    standardCategory?: string;
    waitingReturnOnly?: boolean;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: PartnerProposalListItem[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.statusId) q.set('statusId', params.statusId);
    if (params.standardCategory) q.set('standardCategory', params.standardCategory);
    if (params.waitingReturnOnly) q.set('waitingReturnOnly', 'true');
    if (params.startDate) q.set('startDate', params.startDate);
    if (params.endDate) q.set('endDate', params.endDate);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));

    const res = await fetch(`/api/partner-portal/proposals?${q.toString()}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao carregar propostas.');
    }
    return res.json();
  }

  public static async getProposalDetail(id: string): Promise<PartnerProposalDetailData> {
    const res = await fetch(`/api/partner-portal/proposals/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Proposta não encontrada.');
    }
    return res.json();
  }

  public static async getConversations(): Promise<PartnerSupportConversation[]> {
    const res = await fetch('/api/partner-portal/support/conversations');
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao listar conversas.');
    }
    return res.json();
  }

  public static async createConversation(payload: { proposalId?: string; subject?: string; channel?: string }) {
    const res = await fetch('/api/partner-portal/support/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao iniciar atendimento.');
    }
    return data;
  }

  public static async getConversationMessages(id: string): Promise<{ conversation: any; messages: PartnerSupportMessage[] }> {
    const res = await fetch(`/api/partner-portal/support/conversations/${encodeURIComponent(id)}/messages`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao carregar mensagens.');
    }
    return res.json();
  }

  public static async sendMessage(conversationId: string, message: string): Promise<PartnerSupportMessage> {
    const res = await fetch(`/api/partner-portal/support/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao enviar mensagem.');
    }
    return data;
  }

  public static async getUnreadCount(): Promise<number> {
    try {
      const res = await fetch('/api/partner-portal/support/unread-count');
      if (res.ok) {
        const data = await res.json();
        return data.count || 0;
      }
      return 0;
    } catch {
      return 0;
    }
  }
}
