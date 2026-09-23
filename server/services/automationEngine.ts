import { PrismaClient } from '@prisma/client';
import { centralEventBus, DomainEventType, DomainEventPayload } from './eventBus.js';
import { logger } from '../logger.js';
import { AuditLogService } from './auditLogService.js';
import { sseRegistry } from '../realtime.js';
import { PendencyService, PendencyStatus } from './pendencyService.js';

// ==========================================
// CONSTANTES E CATÁLOGOS DE REGRAS
// ==========================================

export const MAX_EXECUTION_DEPTH = 3;
export const MAX_ACTION_RETRIES = 3;

export interface TriggerDefinition {
  id: DomainEventType;
  label: string;
  category: 'PROPOSTAS' | 'PENDÊNCIAS' | 'INTEGRAÇÕES' | 'SIMULAÇÕES' | 'PARCEIROS' | 'INCIDENTES';
  description: string;
  sampleFields: Array<{ field: string; label: string; type: 'string' | 'number' | 'boolean' | 'date' }>;
}

export const AVAILABLE_TRIGGERS: TriggerDefinition[] = [
  // PROPOSTAS
  {
    id: 'PROPOSAL_CREATED',
    label: 'Proposta Criada',
    category: 'PROPOSTAS',
    description: 'Disparado quando uma nova proposta é cadastrada no sistema',
    sampleFields: [
      { field: 'proposalNumber', label: 'Número da Proposta', type: 'string' },
      { field: 'bank', label: 'Banco / Promotora', type: 'string' },
      { field: 'status', label: 'Status da Proposta', type: 'string' },
      { field: 'proposalValue', label: 'Valor da Proposta (R$)', type: 'number' },
      { field: 'partnerId', label: 'ID do Parceiro', type: 'string' },
    ],
  },
  {
    id: 'PROPOSAL_STATUS_CHANGED',
    label: 'Status da Proposta Alterado',
    category: 'PROPOSTAS',
    description: 'Disparado quando a esteira ou API bancária altera o status da proposta',
    sampleFields: [
      { field: 'status', label: 'Novo Status', type: 'string' },
      { field: 'statusCode', label: 'Código do Status', type: 'string' },
      { field: 'standardCategory', label: 'Categoria Padrão', type: 'string' },
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'proposalValue', label: 'Valor (R$)', type: 'number' },
    ],
  },
  {
    id: 'PROPOSAL_APPROVED',
    label: 'Proposta Aprovada',
    category: 'PROPOSTAS',
    description: 'Disparado quando a proposta é confirmada como aprovada pelo banco parceiro',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'proposalValue', label: 'Valor Aprovado (R$)', type: 'number' },
      { field: 'partnerId', label: 'ID do Parceiro', type: 'string' },
    ],
  },
  {
    id: 'PROPOSAL_DENIED',
    label: 'Proposta Negada',
    category: 'PROPOSTAS',
    description: 'Disparado quando o banco rejeita ou recusa a proposta de crédito',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'reason', label: 'Motivo da Recusa', type: 'string' },
    ],
  },
  {
    id: 'PROPOSAL_CANCELLED',
    label: 'Proposta Cancelada',
    category: 'PROPOSTAS',
    description: 'Disparado quando a proposta é cancelada pelo operador ou cliente',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'reason', label: 'Motivo do Cancelamento', type: 'string' },
    ],
  },
  {
    id: 'PROPOSAL_PAID',
    label: 'Proposta Paga / Liquidada',
    category: 'PROPOSTAS',
    description: 'Disparado quando a proposta entra em status de pagamento/liquidação confirmada',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'proposalValue', label: 'Valor Liquidado (R$)', type: 'number' },
    ],
  },
  {
    id: 'PROPOSAL_PENDING',
    label: 'Proposta com Pendência',
    category: 'PROPOSTAS',
    description: 'Disparado quando a proposta entra em pendência na esteira do banco parceiro',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'status', label: 'Status Pendente', type: 'string' },
    ],
  },
  {
    id: 'PROPOSAL_UPDATED',
    label: 'Proposta Atualizada',
    category: 'PROPOSTAS',
    description: 'Disparado quando dados operacionais da proposta são alterados',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'status', label: 'Status', type: 'string' },
    ],
  },

  // PENDÊNCIAS
  {
    id: 'PENDENCY_CREATED',
    label: 'Pendência Criada',
    category: 'PENDÊNCIAS',
    description: 'Disparado ao registrar uma nova pendência de esteira ou integração',
    sampleFields: [
      { field: 'priority', label: 'Prioridade (LOW, MEDIUM, HIGH, CRITICAL)', type: 'string' },
      { field: 'type', label: 'Tipo da Pendência (ESTEIRA, INTEGRACAO, MARGEM...)', type: 'string' },
      { field: 'assignedToId', label: 'ID do Responsável', type: 'string' },
      { field: 'bankId', label: 'ID do Banco', type: 'string' },
      { field: 'bank', label: 'Nome do Banco', type: 'string' },
    ],
  },
  {
    id: 'PENDENCY_ASSIGNED',
    label: 'Pendência Atribuída',
    category: 'PENDÊNCIAS',
    description: 'Disparado quando um operador ou supervisor assume a pendência',
    sampleFields: [
      { field: 'assignedToId', label: 'ID do Responsável', type: 'string' },
      { field: 'priority', label: 'Prioridade', type: 'string' },
    ],
  },
  {
    id: 'PENDENCY_STATUS_CHANGED',
    label: 'Status da Pendência Alterado',
    category: 'PENDÊNCIAS',
    description: 'Disparado quando o status da pendência é atualizado',
    sampleFields: [
      { field: 'status', label: 'Status (ABERTA, EM_ATENDIMENTO, AGUARDANDO...)', type: 'string' },
      { field: 'priority', label: 'Prioridade', type: 'string' },
    ],
  },
  {
    id: 'PENDENCY_COMMENT_ADDED',
    label: 'Comentário em Pendência Adicionado',
    category: 'PENDÊNCIAS',
    description: 'Disparado quando um usuário registra anotação ou comentário na pendência',
    sampleFields: [
      { field: 'comment', label: 'Texto do Comentário', type: 'string' },
    ],
  },
  {
    id: 'PENDENCY_SLA_WARNING',
    label: 'Aviso de SLA (Prestes a Estourar)',
    category: 'PENDÊNCIAS',
    description: 'Disparado quando o tempo da pendência atinge mais de 75% do prazo máximo estipulado',
    sampleFields: [
      { field: 'priority', label: 'Prioridade', type: 'string' },
      { field: 'type', label: 'Tipo da Pendência', type: 'string' },
      { field: 'bank', label: 'Banco', type: 'string' },
    ],
  },
  {
    id: 'PENDENCY_SLA_BREACHED',
    label: 'SLA Estourado',
    category: 'PENDÊNCIAS',
    description: 'Disparado quando a pendência ultrapassa o limite de tempo contratual (SLA)',
    sampleFields: [
      { field: 'priority', label: 'Prioridade', type: 'string' },
      { field: 'type', label: 'Tipo da Pendência', type: 'string' },
      { field: 'bank', label: 'Banco', type: 'string' },
    ],
  },
  {
    id: 'PENDENCY_RESOLVED',
    label: 'Pendência Resolvida',
    category: 'PENDÊNCIAS',
    description: 'Disparado quando a pendência é baixada com resolução com sucesso',
    sampleFields: [
      { field: 'priority', label: 'Prioridade', type: 'string' },
      { field: 'resolutionNotes', label: 'Observações de Resolução', type: 'string' },
    ],
  },
  {
    id: 'PENDENCY_REOPENED',
    label: 'Pendência Reaberta',
    category: 'PENDÊNCIAS',
    description: 'Disparado quando uma pendência previamente resolvida/cancelada é reaberta',
    sampleFields: [
      { field: 'priority', label: 'Prioridade', type: 'string' },
    ],
  },
  {
    id: 'PENDENCY_CANCELLED',
    label: 'Pendência Cancelada',
    category: 'PENDÊNCIAS',
    description: 'Disparado quando uma pendência é cancelada por perda de objeto',
    sampleFields: [
      { field: 'reason', label: 'Motivo', type: 'string' },
    ],
  },

  // INTEGRAÇÕES
  {
    id: 'INTEGRATION_REQUEST',
    label: 'Requisição de Integração',
    category: 'INTEGRAÇÕES',
    description: 'Disparado ao enviar comando ou requisição para API bancária parceira',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'endpoint', label: 'Endpoint', type: 'string' },
    ],
  },
  {
    id: 'INTEGRATION_SUCCESS',
    label: 'Sucesso de Integração Bancária',
    category: 'INTEGRAÇÕES',
    description: 'Disparado quando uma chamada para C6, FACTA, BMG ou Happy é concluída com sucesso',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'statusCode', label: 'Status HTTP', type: 'number' },
      { field: 'latencyMs', label: 'Latência (ms)', type: 'number' },
    ],
  },
  {
    id: 'INTEGRATION_ERROR',
    label: 'Erro de Integração Bancária',
    category: 'INTEGRAÇÕES',
    description: 'Disparado quando uma chamada para C6, FACTA, BMG ou Happy retorna erro ou falha',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'errorMessage', label: 'Mensagem de Erro', type: 'string' },
      { field: 'statusCode', label: 'Status HTTP', type: 'number' },
    ],
  },
  {
    id: 'INTEGRATION_HEALTH_CHANGED',
    label: 'Saúde da Integração Alterada',
    category: 'INTEGRAÇÕES',
    description: 'Disparado quando o monitoramento identifica instabilidade ou recuperação de um banco',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'status', label: 'Status de Saúde (ONLINE, OFFLINE, DEGRADED)', type: 'string' },
    ],
  },
  {
    id: 'INTEGRATION_INCIDENT_STARTED',
    label: 'Incidente de Integração Aberto',
    category: 'INTEGRAÇÕES',
    description: 'Disparado quando falhas consecutivas ou indisponibilidade confirmada abrem um incidente',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'incidentId', label: 'ID do Incidente', type: 'string' },
      { field: 'severity', label: 'Severidade', type: 'string' },
      { field: 'errorCount', label: 'Contagem de Erros', type: 'number' },
    ],
  },
  {
    id: 'INTEGRATION_INCIDENT_RESOLVED',
    label: 'Incidente de Integração Resolvido',
    category: 'INTEGRAÇÕES',
    description: 'Disparado quando um incidente é resolvido ou o serviço se normaliza',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'incidentId', label: 'ID do Incidente', type: 'string' },
      { field: 'durationMs', label: 'Duração (ms)', type: 'number' },
    ],
  },
  {
    id: 'INTEGRATION_RATE_LIMITED',
    label: 'Limite de Requisições Atingido (Rate Limit)',
    category: 'INTEGRAÇÕES',
    description: 'Disparado quando uma API bancária retorna HTTP 429 ou excede cota',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'limit', label: 'Limite Total', type: 'number' },
      { field: 'resetInSeconds', label: 'Reset em Segundos', type: 'number' },
    ],
  },

  // SIMULAÇÕES
  {
    id: 'SIMULATION_CREATED',
    label: 'Simulação Criada',
    category: 'SIMULAÇÕES',
    description: 'Disparado quando um operador ou parceiro solicita nova simulação de crédito',
    sampleFields: [
      { field: 'requestedAmount', label: 'Valor Solicitado (R$)', type: 'number' },
      { field: 'bank', label: 'Banco', type: 'string' },
    ],
  },
  {
    id: 'SIMULATION_COMPLETED',
    label: 'Simulação Concluída',
    category: 'SIMULAÇÕES',
    description: 'Disparado quando os coeficientes e tabelas foram calculados com sucesso',
    sampleFields: [
      { field: 'bank', label: 'Banco', type: 'string' },
      { field: 'installmentValue', label: 'Valor da Parcela (R$)', type: 'number' },
    ],
  },

  // PARCEIROS
  {
    id: 'PARTNER_CREATED',
    label: 'Parceiro Cadastrado',
    category: 'PARCEIROS',
    description: 'Disparado ao homologar novo parceiro ou correspondente na plataforma',
    sampleFields: [
      { field: 'partnerName', label: 'Nome do Parceiro', type: 'string' },
      { field: 'status', label: 'Status do Parceiro', type: 'string' },
    ],
  },
  {
    id: 'PARTNER_UPDATED',
    label: 'Parceiro Atualizado',
    category: 'PARCEIROS',
    description: 'Disparado quando dados cadastrais ou convênios de um parceiro são alterados',
    sampleFields: [
      { field: 'partnerName', label: 'Nome do Parceiro', type: 'string' },
      { field: 'status', label: 'Status do Parceiro', type: 'string' },
    ],
  },

  // INCIDENTES / COMMAND CENTER
  {
    id: 'INCIDENT_CREATED',
    label: 'Incidente Criado (Command Center)',
    category: 'INCIDENTES',
    description: 'Disparado ao registrar um novo incidente operacional ou técnico no Command Center',
    sampleFields: [
      { field: 'incidentNumber', label: 'Número do Incidente', type: 'string' },
      { field: 'title', label: 'Título do Incidente', type: 'string' },
      { field: 'severity', label: 'Severidade (LOW, MEDIUM, HIGH, CRITICAL)', type: 'string' },
      { field: 'type', label: 'Tipo do Incidente', type: 'string' },
    ],
  },
  {
    id: 'INCIDENT_CRITICAL',
    label: 'Incidente Crítico Registrado',
    category: 'INCIDENTES',
    description: 'Disparado exclusivamente quando um incidente de severidade CRITICAL é aberto',
    sampleFields: [
      { field: 'incidentNumber', label: 'Número do Incidente', type: 'string' },
      { field: 'title', label: 'Título do Incidente', type: 'string' },
    ],
  },
  {
    id: 'INCIDENT_STATUS_CHANGED',
    label: 'Status do Incidente Alterado',
    category: 'INCIDENTES',
    description: 'Disparado quando a fase do incidente muda (OPEN, ACKNOWLEDGED, INVESTIGATING, MITIGATING, RESOLVED, CLOSED)',
    sampleFields: [
      { field: 'incidentNumber', label: 'Número do Incidente', type: 'string' },
      { field: 'status', label: 'Novo Status', type: 'string' },
    ],
  },
  {
    id: 'INCIDENT_RESOLVED',
    label: 'Incidente Resolvido',
    category: 'INCIDENTES',
    description: 'Disparado quando o incidente é marcado como RESOLVED',
    sampleFields: [
      { field: 'incidentNumber', label: 'Número do Incidente', type: 'string' },
    ],
  },
];

export type ConditionOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'GREATER_OR_EQUAL'
  | 'LESS_OR_EQUAL'
  | 'BETWEEN'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY'
  // Compatibilidade com operadores legados
  | 'equals'
  | '=='
  | 'notEquals'
  | '!='
  | 'contains'
  | '>'
  | '<'
  | '>='
  | '<=';

export interface ConditionRule {
  field: string;
  operator: ConditionOperator | string;
  value?: any;
}

export interface ConditionGroup {
  matchType?: 'ALL' | 'ANY'; // 'ALL' = AND, 'ANY' = OR. Default: 'ALL'
  rules: ConditionRule[];
}

export type AutomationActionType =
  | 'CREATE_PENDENCY'
  | 'ASSIGN_PENDENCY'
  | 'UPDATE_PENDENCY_PRIORITY'
  | 'UPDATE_PENDENCY_STATUS'
  | 'RESOLVE_PENDENCY'
  | 'ADD_PENDENCY_COMMENT'
  | 'CREATE_NOTIFICATION'
  | 'ADD_PROPOSAL_NOTE'
  | 'ASSIGN_PROPOSAL'
  | 'RECORD_AUDIT'
  | 'TRIGGER_SYNC'
  // Legados aceitos com mapeamento seguro
  | 'NOTIFY_USER'
  | 'CREATE_TASK';

export interface AutomationAction {
  type: AutomationActionType | string;
  params: Record<string, any>;
}

export interface AutomationExecutionTimelineItem {
  timestamp: string;
  step: string;
  description: string;
  status: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
}

export interface AutomationExecutionContext {
  tenantId: string;
  event: DomainEventType | string;
  eventId?: string;
  requestId?: string;
  origin?: 'EVENT_BUS' | 'MANUAL' | 'TEST' | 'PENDENCY';
  depth?: number;
  visitedAutomations?: string[];
  userId?: string | null;
  userName?: string | null;
  data: any;
}

// Catálogo seguro de ações disponíveis para a UI
export const AVAILABLE_ACTIONS = [
  {
    type: 'CREATE_PENDENCY',
    label: 'Criar Pendência Operacional',
    category: 'PENDÊNCIAS',
    description: 'Cria uma nova pendência na esteira com validação e SLA',
    fields: [
      { name: 'title', label: 'Título da Pendência', type: 'text', required: true },
      { name: 'description', label: 'Descrição / Instruções', type: 'textarea' },
      {
        name: 'priority',
        label: 'Prioridade',
        type: 'select',
        options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        defaultValue: 'HIGH',
      },
      {
        name: 'type',
        label: 'Tipo',
        type: 'select',
        options: ['ESTEIRA', 'INTEGRACAO', 'DOCUMENTACAO', 'MARGEM', 'AVERBACAO', 'GERAL'],
        defaultValue: 'ESTEIRA',
      },
      { name: 'assignedToId', label: 'ID do Atribuído (opcional)', type: 'text' },
    ],
  },
  {
    type: 'ASSIGN_PENDENCY',
    label: 'Atribuir Pendência',
    category: 'PENDÊNCIAS',
    description: 'Designa um operador ou supervisor para tratar a pendência atual',
    fields: [
      { name: 'userId', label: 'ID do Usuário / Operador', type: 'text', required: true },
      { name: 'note', label: 'Observação da Atribuição', type: 'text' },
    ],
  },
  {
    type: 'UPDATE_PENDENCY_PRIORITY',
    label: 'Alterar Prioridade da Pendência',
    category: 'PENDÊNCIAS',
    description: 'Altera a prioridade da pendência (ex: escala para CRÍTICA)',
    fields: [
      {
        name: 'priority',
        label: 'Nova Prioridade',
        type: 'select',
        options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        required: true,
      },
      { name: 'reason', label: 'Justificativa da alteração', type: 'text' },
    ],
  },
  {
    type: 'RESOLVE_PENDENCY',
    label: 'Baixar / Resolver Pendência',
    category: 'PENDÊNCIAS',
    description: 'Baixa a pendência automaticamente se cumprir os requisitos de negócio',
    fields: [
      { name: 'notes', label: 'Observações de Resolução', type: 'text', required: true },
    ],
  },
  {
    type: 'ADD_PENDENCY_COMMENT',
    label: 'Adicionar Histórico na Pendência',
    category: 'PENDÊNCIAS',
    description: 'Registra nota informativa no histórico da pendência',
    fields: [
      { name: 'comment', label: 'Mensagem do Comentário', type: 'textarea', required: true },
    ],
  },
  {
    type: 'CREATE_NOTIFICATION',
    label: 'Criar Notificação Interna',
    category: 'NOTIFICAÇÕES',
    description: 'Envia notificação visual e push interno no sistema para o usuário ou supervisor',
    fields: [
      { name: 'title', label: 'Título da Notificação', type: 'text', required: true },
      { name: 'message', label: 'Mensagem', type: 'textarea', required: true },
      { name: 'userId', label: 'ID do Usuário Específico (vazio = responsável ou gestores)', type: 'text' },
    ],
  },
  {
    type: 'ADD_PROPOSAL_NOTE',
    label: 'Adicionar Observação na Proposta',
    category: 'PROPOSTAS',
    description: 'Registra nota operacional no histórico da proposta vinculada',
    fields: [
      { name: 'note', label: 'Nota Operacional', type: 'textarea', required: true },
    ],
  },
  {
    type: 'RECORD_AUDIT',
    label: 'Registrar na Trilha de Auditoria',
    category: 'SISTEMA',
    description: 'Gera registro imutável com hash chain na trilha de auditoria do tenant',
    fields: [
      { name: 'action', label: 'Nome da Ação Auditada', type: 'text', required: true },
      { name: 'notes', label: 'Detalhes da Auditoria', type: 'text' },
    ],
  },
];

// Lista de ações estritamente proibidas na primeira versão
export const FORBIDDEN_ACTION_TYPES = [
  'DELETE_PROPOSAL',
  'DELETE_USER',
  'DELETE_PARTNER',
  'CHANGE_PERMISSIONS',
  'CHANGE_TENANT',
  'CHANGE_CREDENTIALS',
  'CHANGE_SECRETS',
  'SEND_SECRETS',
  'UPDATE_COMMISSION',
  'DELETE_FINANCIAL',
  'EXECUTE_SQL',
  'EXECUTE_JAVASCRIPT',
  'WEBHOOK_EXTERNAL',
  'HTTP_POST',
  'HTTP_GET',
];

// Modelos pré-configurados prontos para uso
export const AUTOMATION_TEMPLATES = [
  {
    id: 'template_sla_critico',
    name: 'SLA Crítico em Pendência',
    description: 'Quando o SLA de uma pendência estourar e a prioridade for CRÍTICA, notifica o supervisor e altera atribuição.',
    event: 'PENDENCY_SLA_BREACHED',
    conditions: {
      matchType: 'ALL',
      rules: [
        { field: 'priority', operator: 'EQUALS', value: 'CRITICAL' },
      ],
    },
    actions: [
      {
        type: 'CREATE_NOTIFICATION',
        params: {
          title: '🚨 SLA Crítico Estourado',
          message: 'Uma pendência de prioridade CRÍTICA estourou o prazo de SLA contratual!',
        },
      },
    ],
  },
  {
    id: 'template_sla_estourado',
    name: 'Alerta de SLA Estourado',
    description: 'Notifica imediatamente a equipe operacional quando qualquer pendência exceder o tempo limite de SLA.',
    event: 'PENDENCY_SLA_BREACHED',
    conditions: {
      matchType: 'ALL',
      rules: [],
    },
    actions: [
      {
        type: 'CREATE_NOTIFICATION',
        params: {
          title: '⚠️ SLA de Pendência Estourado',
          message: 'A pendência ultrapassou o SLA operacional. Necessário atendimento imediato.',
        },
      },
    ],
  },
  {
    id: 'template_pendencia_sem_responsavel',
    name: 'Pendência sem Responsável',
    description: 'Quando uma nova pendência for criada sem operador designado, gera notificação para a fila geral.',
    event: 'PENDENCY_CREATED',
    conditions: {
      matchType: 'ALL',
      rules: [
        { field: 'assignedToId', operator: 'IS_EMPTY', value: '' },
      ],
    },
    actions: [
      {
        type: 'CREATE_NOTIFICATION',
        params: {
          title: '📋 Nova Pendência Não Atribuída',
          message: 'Uma nova pendência foi criada e está aguardando operador na fila geral.',
        },
      },
    ],
  },
  {
    id: 'template_erro_integracao',
    name: 'Falha de Integração Bancária',
    description: 'Cria pendência automática do tipo INTEGRAÇÃO e notifica a equipe técnica ao detectar erro em chamadas bancárias.',
    event: 'INTEGRATION_ERROR',
    conditions: {
      matchType: 'ALL',
      rules: [],
    },
    actions: [
      {
        type: 'CREATE_PENDENCY',
        params: {
          title: 'Erro de Comunicação com Banco Parceiro',
          description: 'A API bancária retornou falha na operação. Verificar payload e credenciais.',
          priority: 'HIGH',
          type: 'INTEGRACAO',
        },
      },
      {
        type: 'CREATE_NOTIFICATION',
        params: {
          title: '⚠️ Erro em API Bancária',
          message: 'Houve falha de comunicação com a instituição parceira. Pendência técnica registrada.',
        },
      },
    ],
  },
  {
    id: 'template_proposta_aprovada',
    name: 'Proposta Aprovada pelo Banco',
    description: 'Quando uma proposta for aprovada pelo banco, gera notificação de sucesso para a equipe comercial.',
    event: 'PROPOSAL_APPROVED',
    conditions: {
      matchType: 'ALL',
      rules: [],
    },
    actions: [
      {
        type: 'CREATE_NOTIFICATION',
        params: {
          title: '🎉 Proposta Aprovada!',
          message: 'A proposta de crédito foi deferida pelo banco parceiro e avançou para liquidação.',
        },
      },
    ],
  },
  {
    id: 'template_proposta_negada',
    name: 'Proposta Negada pelo Banco',
    description: 'Notifica imediatamente o gestor quando uma proposta for reprovada ou recusada pela instituição financeira.',
    event: 'PROPOSAL_DENIED',
    conditions: {
      matchType: 'ALL',
      rules: [],
    },
    actions: [
      {
        type: 'CREATE_NOTIFICATION',
        params: {
          title: '❌ Proposta Recusada',
          message: 'A instituição financeira recusou a proposta de crédito. Verifique as pendências.',
        },
      },
    ],
  },
  {
    id: 'template_proposta_paga',
    name: 'Proposta Liquidada / Paga',
    description: 'Registra notificação de pagamento confirmado e liquidação financeira do contrato.',
    event: 'PROPOSAL_PAID',
    conditions: {
      matchType: 'ALL',
      rules: [],
    },
    actions: [
      {
        type: 'CREATE_NOTIFICATION',
        params: {
          title: '💰 Pagamento Confirmado',
          message: 'Contrato liquidado com sucesso pela instituição parceira!',
        },
      },
    ],
  },
];

// ==========================================
// AVALIADOR DE CONDIÇÕES & HELPERS
// ==========================================

export class AutomationEngine {
  private static isInitialized = false;
  // Cache in-memory de idempotência: tenantId:autoId:eventId -> timestamp
  private static idempotencyCache = new Map<string, number>();

  /**
   * Extrai valor aninhado ou direto de um objeto de dados (ex: 'priority', 'proposal.bank', 'data.value')
   */
  public static extractFieldValue(data: any, fieldPath: string): any {
    if (!data || typeof data !== 'object') return undefined;
    if (fieldPath in data) return data[fieldPath];

    const parts = fieldPath.split('.');
    let current = data;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Avalia uma única regra de condição comparando o valor real com o esperado
   */
  public static evaluateRule(
    rule: ConditionRule,
    data: any
  ): { matched: boolean; actualValue: any; field: string; operator: string; expectedValue: any; error?: string } {
    const actualValue = this.extractFieldValue(data, rule.field);
    const op = String(rule.operator || 'EQUALS').toUpperCase();
    const expectedValue = rule.value;

    let matched = false;

    // Regras de vazio
    if (op === 'IS_EMPTY' || op === 'ISEMPTY') {
      matched =
        actualValue === undefined ||
        actualValue === null ||
        actualValue === '' ||
        (Array.isArray(actualValue) && actualValue.length === 0);
      return { matched, actualValue, field: rule.field, operator: op, expectedValue: null };
    }

    if (op === 'IS_NOT_EMPTY' || op === 'ISNOTEMPTY') {
      matched =
        actualValue !== undefined &&
        actualValue !== null &&
        actualValue !== '' &&
        (!Array.isArray(actualValue) || actualValue.length > 0);
      return { matched, actualValue, field: rule.field, operator: op, expectedValue: null };
    }

    // Se o valor real for indefinido ou nulo e não for IS_EMPTY, não corresponde
    if (actualValue === undefined || actualValue === null) {
      return { matched: false, actualValue, field: rule.field, operator: op, expectedValue };
    }

    // Avaliação dos operadores
    switch (op) {
      case 'EQUALS':
      case '==':
      case 'EQUALS_TO':
        if (typeof actualValue === 'number' && !isNaN(Number(expectedValue))) {
          matched = actualValue === Number(expectedValue);
        } else if (typeof actualValue === 'boolean') {
          matched = actualValue === (expectedValue === true || expectedValue === 'true');
        } else {
          matched = String(actualValue).trim().toLowerCase() === String(expectedValue).trim().toLowerCase();
        }
        break;

      case 'NOT_EQUALS':
      case '!=':
        if (typeof actualValue === 'number' && !isNaN(Number(expectedValue))) {
          matched = actualValue !== Number(expectedValue);
        } else if (typeof actualValue === 'boolean') {
          matched = actualValue !== (expectedValue === true || expectedValue === 'true');
        } else {
          matched = String(actualValue).trim().toLowerCase() !== String(expectedValue).trim().toLowerCase();
        }
        break;

      case 'CONTAINS':
        if (Array.isArray(actualValue)) {
          matched = actualValue.some((item) =>
            String(item).toLowerCase().includes(String(expectedValue).toLowerCase())
          );
        } else {
          matched = String(actualValue).toLowerCase().includes(String(expectedValue).toLowerCase());
        }
        break;

      case 'NOT_CONTAINS':
        if (Array.isArray(actualValue)) {
          matched = !actualValue.some((item) =>
            String(item).toLowerCase().includes(String(expectedValue).toLowerCase())
          );
        } else {
          matched = !String(actualValue).toLowerCase().includes(String(expectedValue).toLowerCase());
        }
        break;

      case 'GREATER_THAN':
      case '>': {
        const numActual = Number(actualValue);
        const numExpected = Number(expectedValue);
        if (!isNaN(numActual) && !isNaN(numExpected)) {
          matched = numActual > numExpected;
        } else if (Date.parse(String(actualValue)) && Date.parse(String(expectedValue))) {
          matched = new Date(actualValue).getTime() > new Date(expectedValue).getTime();
        } else {
          return {
            matched: false,
            actualValue,
            field: rule.field,
            operator: op,
            expectedValue,
            error: 'Comparação numérica não aplicável a texto não numérico.',
          };
        }
        break;
      }

      case 'LESS_THAN':
      case '<': {
        const numActual = Number(actualValue);
        const numExpected = Number(expectedValue);
        if (!isNaN(numActual) && !isNaN(numExpected)) {
          matched = numActual < numExpected;
        } else if (Date.parse(String(actualValue)) && Date.parse(String(expectedValue))) {
          matched = new Date(actualValue).getTime() < new Date(expectedValue).getTime();
        } else {
          return {
            matched: false,
            actualValue,
            field: rule.field,
            operator: op,
            expectedValue,
            error: 'Comparação numérica não aplicável a texto não numérico.',
          };
        }
        break;
      }

      case 'GREATER_OR_EQUAL':
      case '>=': {
        const numActual = Number(actualValue);
        const numExpected = Number(expectedValue);
        if (!isNaN(numActual) && !isNaN(numExpected)) {
          matched = numActual >= numExpected;
        } else if (Date.parse(String(actualValue)) && Date.parse(String(expectedValue))) {
          matched = new Date(actualValue).getTime() >= new Date(expectedValue).getTime();
        } else {
          return {
            matched: false,
            actualValue,
            field: rule.field,
            operator: op,
            expectedValue,
            error: 'Comparação numérica não aplicável a texto não numérico.',
          };
        }
        break;
      }

      case 'LESS_OR_EQUAL':
      case '<=': {
        const numActual = Number(actualValue);
        const numExpected = Number(expectedValue);
        if (!isNaN(numActual) && !isNaN(numExpected)) {
          matched = numActual <= numExpected;
        } else if (Date.parse(String(actualValue)) && Date.parse(String(expectedValue))) {
          matched = new Date(actualValue).getTime() <= new Date(expectedValue).getTime();
        } else {
          return {
            matched: false,
            actualValue,
            field: rule.field,
            operator: op,
            expectedValue,
            error: 'Comparação numérica não aplicável a texto não numérico.',
          };
        }
        break;
      }

      case 'BETWEEN': {
        const parts = Array.isArray(expectedValue)
          ? expectedValue
          : String(expectedValue).split(',').map((s) => s.trim());
        const min = Number(parts[0]);
        const max = Number(parts[1]);
        const numActual = Number(actualValue);
        if (!isNaN(numActual) && !isNaN(min) && !isNaN(max)) {
          matched = numActual >= min && numActual <= max;
        } else {
          matched = false;
        }
        break;
      }

      default:
        // Padrão de igualdade se operador desconhecido
        matched = String(actualValue).trim().toLowerCase() === String(expectedValue).trim().toLowerCase();
        break;
    }

    return { matched, actualValue, field: rule.field, operator: op, expectedValue };
  }

  /**
   * Avalia um grupo completo de condições (modo AND ou OR)
   */
  public static evaluateConditions(
    rawConditions: any,
    data: any
  ): { matched: boolean; matchType: 'ALL' | 'ANY'; evaluatedRules: any[] } {
    let matchType: 'ALL' | 'ANY' = 'ALL';
    let rules: ConditionRule[] = [];

    if (Array.isArray(rawConditions)) {
      rules = rawConditions;
      matchType = 'ALL';
    } else if (rawConditions && typeof rawConditions === 'object') {
      matchType = rawConditions.matchType === 'ANY' ? 'ANY' : 'ALL';
      rules = Array.isArray(rawConditions.rules) ? rawConditions.rules : [];
    }

    if (rules.length === 0) {
      return { matched: true, matchType, evaluatedRules: [] };
    }

    const evaluatedRules = rules.map((r) => this.evaluateRule(r, data));

    let matched: boolean;
    if (matchType === 'ANY') {
      matched = evaluatedRules.some((r) => r.matched);
    } else {
      matched = evaluatedRules.every((r) => r.matched);
    }

    return { matched, matchType, evaluatedRules };
  }

  /**
   * Gera uma descrição em linguagem natural compreensível por qualquer operador
   */
  public static generateHumanPreview(automation: {
    event: string;
    conditions: any;
    actions: any;
  }): string {
    const trigger = AVAILABLE_TRIGGERS.find((t) => t.id === automation.event);
    const triggerName = trigger ? trigger.label : automation.event;

    let conditionText = '';
    const { matchType, rules } = Array.isArray(automation.conditions)
      ? { matchType: 'ALL', rules: automation.conditions }
      : {
          matchType: automation.conditions?.matchType === 'ANY' ? 'ANY' : 'ALL',
          rules: automation.conditions?.rules || [],
        };

    if (rules.length > 0) {
      const glue = matchType === 'ANY' ? ' OU ' : ' E ';
      const ruleTexts = rules.map((r: ConditionRule) => {
        const opName = String(r.operator || 'igual a').toLowerCase();
        return `${r.field} ${opName} "${r.value ?? ''}"`;
      });
      conditionText = ` SE ${ruleTexts.join(glue)},`;
    }

    const actions = Array.isArray(automation.actions) ? automation.actions : [];
    let actionText = 'não executar nada';
    if (actions.length > 0) {
      const actionDescs = actions.map((act: AutomationAction) => {
        const def = AVAILABLE_ACTIONS.find((a) => a.type === act.type);
        const name = def ? def.label : act.type;
        if (act.type === 'CREATE_PENDENCY') return `criar pendência "${act.params?.title || ''}"`;
        if (act.type === 'ASSIGN_PENDENCY') return `atribuir pendência ao operador "${act.params?.userId || ''}"`;
        if (act.type === 'CREATE_NOTIFICATION') return `notificar "${act.params?.title || ''}"`;
        if (act.type === 'UPDATE_PENDENCY_PRIORITY') return `alterar prioridade para ${act.params?.priority || ''}`;
        if (act.type === 'RESOLVE_PENDENCY') return `resolver pendência`;
        return name;
      });
      actionText = actionDescs.join(' e ');
    }

    return `QUANDO "${triggerName}" ocorrer,${conditionText} ENTÃO ${actionText}.`;
  }

  /**
   * Verifica se o erro é transitório e pode sofrer retry
   */
  public static isTransientError(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('etimedout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('deadlock') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('504')
    );
  }

  /**
   * Executa uma única ação com verificação estrita de segurança e catálogo permitido
   */
  public static async executeAction(
    prisma: PrismaClient,
    action: AutomationAction,
    context: AutomationExecutionContext,
    timeline: AutomationExecutionTimelineItem[]
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const actionType = action.type;

    // 1. Verificação de segurança: Ações expressamente proibidas
    if (FORBIDDEN_ACTION_TYPES.includes(actionType)) {
      const errorMsg = `Ação proibida pelo Sentinel Consig: '${actionType}' viola as políticas de segurança da plataforma.`;
      timeline.push({
        timestamp: new Date().toISOString(),
        step: `Validação de Segurança`,
        description: errorMsg,
        status: 'ERROR',
      });
      throw new Error(errorMsg);
    }

    // 2. Execução segura com retry para erros transitórios
    let attempts = 0;
    while (attempts < MAX_ACTION_RETRIES) {
      attempts++;
      try {
        timeline.push({
          timestamp: new Date().toISOString(),
          step: `Execução da Ação [${actionType}]`,
          description: `Tentativa ${attempts}/${MAX_ACTION_RETRIES}...`,
          status: 'INFO',
        });

        let actionResult: any = null;

        switch (actionType) {
          case 'CREATE_PENDENCY': {
            const proposalId = action.params?.proposalId || context.data?.proposalId || (context.event.startsWith('PROPOSAL_') ? context.data?.id : null);
            const title = action.params?.title || `Pendência gerada por Automação (${context.event})`;
            const description = action.params?.description || `Gerada automaticamente pelo Sentinel Consig a partir do evento ${context.event}.`;
            const priority = action.params?.priority || 'HIGH';
            const type = action.params?.type || 'ESTEIRA';

            const created = await PendencyService.createPendency(prisma, {
              tenantId: context.tenantId,
              title,
              description,
              priority,
              type,
              proposalId: proposalId || null,
              bankId: action.params?.bankId || context.data?.bankId || null,
              assignedToId: action.params?.assignedToId || null,
              source: 'AUTOMACAO',
              sourceEventId: context.eventId ? `auto_${context.eventId}` : undefined,
              metadata: {
                automationTrigger: context.event,
                data: context.data,
              },
              userId: context.userId || null,
              userName: context.userName || 'Motor de Automação',
            });

            actionResult = { pendencyId: created.pendency.id, isDuplicate: created.isDuplicate };
            break;
          }

          case 'ASSIGN_PENDENCY': {
            const pendencyId = action.params?.pendencyId || context.data?.id || context.data?.pendencyId;
            const targetUserId = action.params?.userId;
            if (!pendencyId || !targetUserId) {
              throw new Error('Parâmetros pendencyId e userId são obrigatórios para atribuir pendência.');
            }

            const updated = await PendencyService.assignPendency(prisma, {
              id: pendencyId,
              tenantId: context.tenantId,
              assignedToId: targetUserId,
              userId: context.userId || 'system',
              userName: context.userName || 'Motor de Automação',
              notes: action.params?.note || 'Atribuição automática realizada pelo workflow do Sentinel Consig',
            });
            actionResult = { pendencyId: updated.id, assignedToId: updated.assignedToId };
            break;
          }

          case 'UPDATE_PENDENCY_PRIORITY': {
            const pendencyId = action.params?.pendencyId || context.data?.id;
            const priority = action.params?.priority;
            if (!pendencyId || !priority) {
              throw new Error('Parâmetros pendencyId e priority são obrigatórios.');
            }

            const updated = await prisma.pendency.update({
              where: { id: pendencyId },
              data: {
                priority,
                histories: {
                  create: {
                    tenantId: context.tenantId,
                    action: 'PRIORIDADE_ALTERADA',
                    userName: 'Motor de Automação',
                    notes: action.params?.reason || `Prioridade ajustada para ${priority} via automação.`,
                  },
                },
              },
            });
            actionResult = { pendencyId: updated.id, newPriority: updated.priority };
            break;
          }

          case 'UPDATE_PENDENCY_STATUS': {
            const pendencyId = action.params?.pendencyId || context.data?.id;
            const newStatus = action.params?.status as PendencyStatus;
            if (!pendencyId || !newStatus) {
              throw new Error('Parâmetros pendencyId e status são obrigatórios.');
            }

            const updated = await PendencyService.updateStatus(prisma, {
              id: pendencyId,
              tenantId: context.tenantId,
              newStatus,
              userId: context.userId || 'system',
              userName: context.userName || 'Motor de Automação',
              notes: action.params?.notes || 'Status alterado pelo fluxo de automação.',
            });
            actionResult = { pendencyId: updated.id, status: updated.status };
            break;
          }

          case 'RESOLVE_PENDENCY': {
            const pendencyId = action.params?.pendencyId || context.data?.id;
            if (!pendencyId) throw new Error('pendencyId é obrigatório para resolver a pendência.');

            const resolved = await PendencyService.updateStatus(prisma, {
              id: pendencyId,
              tenantId: context.tenantId,
              newStatus: 'RESOLVIDA',
              userId: context.userId || 'system',
              userName: context.userName || 'Motor de Automação',
              notes: action.params?.notes || 'Baixa automática concluída com sucesso.',
            });
            actionResult = { pendencyId: resolved.id, status: resolved.status };
            break;
          }

          case 'ADD_PENDENCY_COMMENT': {
            const pendencyId = action.params?.pendencyId || context.data?.id;
            const comment = action.params?.comment;
            if (!pendencyId || !comment) throw new Error('pendencyId e comment são obrigatórios.');

            const hist = await PendencyService.addComment(prisma, {
              id: pendencyId,
              tenantId: context.tenantId,
              userId: context.userId || 'system',
              userName: context.userName || 'Motor de Automação',
              notes: comment,
            });
            actionResult = { historyId: hist.id };
            break;
          }

          case 'CREATE_NOTIFICATION':
          case 'NOTIFY_USER': {
            const title = action.params?.title || 'Notificação de Automação';
            const message = action.params?.message || action.params?.notes || 'Regra de automação acionada com sucesso.';
            const targetUserId = action.params?.userId || context.data?.assignedToId || null;

            const notif = await prisma.notification.create({
              data: {
                tenantId: context.tenantId,
                userId: targetUserId,
                title,
                message,
                read: false,
              },
            });
            actionResult = { notificationId: notif.id };
            break;
          }

          case 'ADD_PROPOSAL_NOTE': {
            const proposalId = action.params?.proposalId || context.data?.proposalId || context.data?.id;
            const note = action.params?.note || action.params?.notes;
            if (!proposalId || !note) throw new Error('proposalId e note são obrigatórios.');

            const commentRecord = await prisma.comment.create({
              data: {
                tenantId: context.tenantId,
                proposalId,
                authorName: 'Motor de Automação',
                text: note,
              },
            });
            actionResult = { commentId: commentRecord.id };
            break;
          }

          case 'RECORD_AUDIT': {
            const auditAction = action.params?.action || 'AUTOMATION_AUDIT_LOG';
            await AuditLogService.record(prisma, {
              tenantId: context.tenantId,
              userId: context.userId || null,
              userName: context.userName || 'Motor de Automação',
              action: auditAction,
              entity: 'AUTOMATION',
              entityId: context.data?.id || null,
              newData: { context: context.event, params: action.params },
            });
            actionResult = { recorded: true };
            break;
          }

          case 'TRIGGER_SYNC': {
            // Apenas para sincronizações legítimas com endpoints internos
            actionResult = { triggered: true, target: action.params?.bank || 'ALL' };
            break;
          }

          case 'CREATE_TASK': {
            actionResult = { taskCreated: true, summary: action.params?.message || 'Tarefa automática criada.' };
            break;
          }

          default:
            throw new Error(`Tipo de ação desconhecido ou não suportado: '${actionType}'`);
        }

        timeline.push({
          timestamp: new Date().toISOString(),
          step: `Ação Concluída`,
          description: `Ação '${actionType}' executada com sucesso.`,
          status: 'SUCCESS',
        });

        return { success: true, result: actionResult };
      } catch (err: any) {
        const isTransient = this.isTransientError(err);
        if (isTransient && attempts < MAX_ACTION_RETRIES) {
          const delayMs = Math.min(50 * Math.pow(2, attempts), 500);
          timeline.push({
            timestamp: new Date().toISOString(),
            step: `Retry Transitório`,
            description: `Erro transitório detectado (${err.message}). Aguardando ${delayMs}ms para retry.`,
            status: 'WARNING',
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          timeline.push({
            timestamp: new Date().toISOString(),
            step: `Falha na Ação`,
            description: `Erro definitivo na ação '${actionType}': ${err.message}`,
            status: 'ERROR',
          });
          return { success: false, error: err.message };
        }
      }
    }

    return { success: false, error: 'Número máximo de tentativas de execução excedido.' };
  }

  /**
   * Processa todas as automações ativas do tenant configuradas para o evento
   */
  public static async processEvent(
    prisma: PrismaClient,
    context: AutomationExecutionContext
  ): Promise<void> {
    const { tenantId, event, data } = context;
    if (!prisma || !prisma.automation || !tenantId) return;

    const depth = context.depth || 0;
    const visitedAutomations = context.visitedAutomations || [];

    // 1. Proteção contra loops de automação (profundidade máxima)
    if (depth >= MAX_EXECUTION_DEPTH) {
      logger.warn(
        { tenantId, event, depth },
        `[AUTOMATION_ENGINE] Limite de profundidade de execução atingido (${depth}). Abortando para evitar cascata infinita.`
      );
      return;
    }

    try {
      // 2. Busca automações ativas configuradas para o evento
      const automations = await prisma.automation.findMany({
        where: {
          tenantId,
          active: true,
          event,
        },
      });

      if (!automations || automations.length === 0) return;

      for (const auto of automations) {
        // 3. Proteção contra recursão circular (visited automations)
        if (visitedAutomations.includes(auto.id)) {
          logger.warn(
            { tenantId, automationId: auto.id, event },
            `[AUTOMATION_ENGINE] Recursão detectada: automação '${auto.name}' (${auto.id}) já foi visitada na mesma cadeia de eventos.`
          );
          continue;
        }

        const startTimestamp = Date.now();
        const timeline: AutomationExecutionTimelineItem[] = [
          {
            timestamp: new Date().toISOString(),
            step: 'Evento Recebido',
            description: `Evento '${event}' recebido com ${Object.keys(data || {}).length} propriedades.`,
            status: 'INFO',
          },
        ];

        // 4. Idempotência: Checa se a automação já executou com sucesso para este mesmo eventId
        const eventId = context.eventId || context.requestId || (data?.id ? `${data.id}_${event}` : null);
        if (eventId) {
          const cacheKey = `${tenantId}:${auto.id}:${eventId}`;
          if (this.idempotencyCache.has(cacheKey)) {
            logger.info(
              { tenantId, automationId: auto.id, eventId },
              '[AUTOMATION_ENGINE] Idempotência detectada em memória: execução já concluída.'
            );
            continue;
          }

          // Checagem no banco de dados para persistência entre instâncias
          const existingExecution = await prisma.automationExecution.findFirst({
            where: {
              tenantId,
              automationId: auto.id,
              status: 'SUCCESS',
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          });

          if (existingExecution && (existingExecution.details as any)?.eventId === eventId) {
            logger.info(
              { tenantId, automationId: auto.id, eventId },
              '[AUTOMATION_ENGINE] Idempotência detectada no banco: execução já concluída anteriormente.'
            );
            this.idempotencyCache.set(cacheKey, Date.now());
            continue;
          }
        }

        // 5. Avaliação de condições
        const conditionEval = this.evaluateConditions(auto.conditions, data);
        timeline.push({
          timestamp: new Date().toISOString(),
          step: 'Condições Avaliadas',
          description: `Modo ${conditionEval.matchType}: ${conditionEval.evaluatedRules.length} regra(s) testada(s). Resultado: ${conditionEval.matched ? 'CORRESPONDE (TRUE)' : 'NÃO CORRESPONDE (FALSE)'}.`,
          status: conditionEval.matched ? 'SUCCESS' : 'INFO',
        });

        let executionStatus = 'SUCCESS';
        let errorMsg: string | null = null;
        const executedActionsResult: any[] = [];

        if (!conditionEval.matched) {
          executionStatus = 'SKIPPED';
          timeline.push({
            timestamp: new Date().toISOString(),
            step: 'Execução Ignorada',
            description: 'As condições da regra não foram atendidas.',
            status: 'INFO',
          });
        } else {
          // 6. Execução sequencial das ações
          const actions = Array.isArray(auto.actions) ? (auto.actions as unknown as AutomationAction[]) : [];
          let successCount = 0;
          let failCount = 0;

          for (const act of actions) {
            try {
              const res = await this.executeAction(
                prisma,
                act,
                {
                  ...context,
                  depth: depth + 1,
                  visitedAutomations: [...visitedAutomations, auto.id],
                },
                timeline
              );

              if (res.success) {
                successCount++;
                executedActionsResult.push({ type: act.type, success: true, result: res.result });
              } else {
                failCount++;
                executedActionsResult.push({ type: act.type, success: false, error: res.error });
                errorMsg = res.error || 'Falha na execução de ação';
              }
            } catch (actErr: any) {
              failCount++;
              executedActionsResult.push({ type: act.type, success: false, error: actErr.message });
              errorMsg = actErr.message;
            }
          }

          if (failCount > 0 && successCount > 0) {
            executionStatus = 'PARTIAL';
          } else if (failCount > 0 && successCount === 0) {
            executionStatus = 'FAILED';
          } else {
            executionStatus = 'SUCCESS';
          }
        }

        const durationMs = Date.now() - startTimestamp;

        timeline.push({
          timestamp: new Date().toISOString(),
          step: 'Finalização',
          description: `Execução finalizada com status ${executionStatus} em ${durationMs}ms.`,
          status: executionStatus === 'SUCCESS' ? 'SUCCESS' : executionStatus === 'SKIPPED' ? 'INFO' : 'ERROR',
        });

        // 7. Persistência do registro de AutomationExecution
        const executionRecord = await prisma.automationExecution.create({
          data: {
            tenantId,
            automationId: auto.id,
            event,
            status: executionStatus,
            result: `Executado em ${durationMs}ms. Ações: ${executedActionsResult.length}.`,
            error: errorMsg,
            durationMs,
            details: {
              eventId,
              depth,
              evaluatedConditions: conditionEval.evaluatedRules,
              matchType: conditionEval.matchType,
              conditionsMatched: conditionEval.matched,
              actionsExecuted: executedActionsResult,
              timeline,
            } as any,
          },
        });

        if (executionStatus === 'SUCCESS' && eventId) {
          this.idempotencyCache.set(`${tenantId}:${auto.id}:${eventId}`, Date.now());
          // Limpeza periódica do cache se ultrapassar 5.000 itens
          if (this.idempotencyCache.size > 5000) {
            const oldestKey = this.idempotencyCache.keys().next().value;
            if (oldestKey) this.idempotencyCache.delete(oldestKey);
          }
        }

        // 8. Broadcast em tempo real para os clientes do tenant via SSE
        try {
          await sseRegistry.broadcastToTenant(tenantId, {
            type: 'AUTOMATION_EXECUTED',
            entity: 'AUTOMATION',
            entityId: auto.id,
            data: {
              executionId: executionRecord.id,
              automationId: auto.id,
              automationName: auto.name,
              status: executionStatus,
              durationMs,
            },
          });
        } catch {
          // Broadcast silencioso se ninguém conectado
        }
      }
    } catch (err: any) {
      logger.error({ error: err?.message, tenantId, event }, '[AUTOMATION_ENGINE] Erro no processamento de automações');
    }
  }

  /**
   * Modo Teste / Simulação: avalia sem executar mutações ou alterações de banco
   */
  public static testAutomation(
    autoConfig: {
      name?: string;
      event: string;
      conditions: any;
      actions: any;
    },
    mockEvent: {
      event: string;
      data: any;
    }
  ): {
    triggerMatched: boolean;
    conditionsMatched: boolean;
    matchType: 'ALL' | 'ANY';
    evaluatedRules: any[];
    plannedActions: Array<{ type: string; label: string; params: any; preview: string }>;
    humanPreview: string;
    summary: string;
  } {
    const triggerMatched = autoConfig.event === mockEvent.event;
    const condResult = this.evaluateConditions(autoConfig.conditions, mockEvent.data);
    const conditionsMatched = condResult.matched;

    const rawActions = Array.isArray(autoConfig.actions) ? autoConfig.actions : [];
    const plannedActions = rawActions.map((act: AutomationAction) => {
      const def = AVAILABLE_ACTIONS.find((a) => a.type === act.type);
      return {
        type: act.type,
        label: def ? def.label : act.type,
        params: act.params || {},
        preview: def ? `${def.label} (${JSON.stringify(act.params || {})})` : act.type,
      };
    });

    const humanPreview = this.generateHumanPreview(autoConfig);

    let summary = '';
    if (!triggerMatched) {
      summary = `Gatilho não corresponde. A regra espera '${autoConfig.event}' mas o evento simulado foi '${mockEvent.event}'.`;
    } else if (!conditionsMatched) {
      summary = `Gatilho corresponde, mas as condições não foram atendidas no cenário simulado. Nenhuma ação seria executada.`;
    } else {
      summary = `Simulação bem-sucedida! Todas as condições foram atendidas e ${plannedActions.length} ação(ões) seriam disparadas com sucesso.`;
    }

    return {
      triggerMatched,
      conditionsMatched,
      matchType: condResult.matchType,
      evaluatedRules: condResult.evaluatedRules,
      plannedActions,
      humanPreview,
      summary,
    };
  }

  /**
   * Inicializa os ouvintes do CentralEventBus para capturar eventos de domínio automaticamente
   */
  public static initEventBusSubscriptions(prisma: PrismaClient): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Ouve todos os eventos emitidos pelo CentralEventBus
    centralEventBus.subscribe('*', async (eventPayload: DomainEventPayload) => {
      try {
        // Ignora eventos gerados por automações para evitar cascata imediata
        if (eventPayload.eventType === 'AUTOMATION_EXECUTED') return;

        await AutomationEngine.processEvent(prisma, {
          tenantId: eventPayload.tenantId,
          event: eventPayload.eventType,
          eventId: eventPayload.entityId,
          userId: eventPayload.userId,
          userName: eventPayload.userName,
          origin: 'EVENT_BUS',
          data: eventPayload.data,
        });
      } catch (err: any) {
        logger.error(
          { error: err?.message, event: eventPayload.eventType },
          '[AUTOMATION_ENGINE] Erro no listener global de eventos'
        );
      }
    });

    logger.info('[AUTOMATION_ENGINE] Motor de Automações Sentinel Consig conectado ao CentralEventBus com sucesso.');
  }
}
