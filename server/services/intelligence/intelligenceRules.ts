import { IntelligenceSeverity } from './intelligenceTypes.js';

export interface IntelligenceRuleDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultSeverity: IntelligenceSeverity;
  defaultThreshold: number;
  unit: string;
  enabled: boolean;
}

export const INTELLIGENCE_RULES_CATALOG: IntelligenceRuleDefinition[] = [
  {
    id: 'PRODUCTION_DROP',
    name: 'Queda Relevante de Produção',
    category: 'PRODUCTION',
    description: 'Detecta redução percentual expressiva no volume financeiro total pago ou bruto em relação ao período anterior.',
    defaultSeverity: 'HIGH',
    defaultThreshold: 15.0, // > 15% drop
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'PRODUCTION_SPIKE',
    name: 'Aumento Incomum de Produção',
    category: 'PRODUCTION',
    description: 'Detecta crescimento atípico acelerado na produção que demanda monitoramento operacional de liquidação e pós-venda.',
    defaultSeverity: 'INFO',
    defaultThreshold: 30.0, // > 30% increase
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'CONVERSION_DROP',
    name: 'Queda na Taxa de Conversão',
    category: 'CONVERSION',
    description: 'Detecta redução significativa na relação entre propostas digitadas e propostas efetivamente pagas.',
    defaultSeverity: 'HIGH',
    defaultThreshold: 20.0, // > 20% drop in relative conversion rate
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'CANCELLATION_SPIKE',
    name: 'Aumento Expressivo de Cancelamentos',
    category: 'CANCELLATION',
    description: 'Identifica aumento na taxa de cancelamento ou forte concentração de desistências/cancelamentos.',
    defaultSeverity: 'HIGH',
    defaultThreshold: 25.0, // > 25% increase in cancelled value/count
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'REFUSAL_SPIKE',
    name: 'Aumento de Recusas e Reprovações',
    category: 'REFUSAL',
    description: 'Detecta salto na taxa de reprovação por políticas de crédito bancárias ou concentração em motivos específicos.',
    defaultSeverity: 'HIGH',
    defaultThreshold: 25.0, // > 25% increase
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'SLA_BACKLOG',
    name: 'Represamento Operacional de Pendências',
    category: 'SLA',
    description: 'Detecta acúmulo de pendências em aberto na esteira sem tratativa ou com tempo de fila elevado.',
    defaultSeverity: 'MEDIUM',
    defaultThreshold: 5.0, // >= 5 open pendencies
    unit: 'count',
    enabled: true,
  },
  {
    id: 'SLA_BREACH_SPIKE',
    name: 'Estouro Crítico de SLA de Pendências',
    category: 'SLA',
    description: 'Alerta quando pendências operacionais ultrapassam o prazo limite regulatório/operacional sem resolução.',
    defaultSeverity: 'CRITICAL',
    defaultThreshold: 1.0, // >= 1 overdue pendency
    unit: 'count',
    enabled: true,
  },
  {
    id: 'INTEGRATION_ERROR_SPIKE',
    name: 'Aumento de Erros em Integração Bancária',
    category: 'INTEGRATION',
    description: 'Identifica elevação da taxa de falhas HTTP/API em bancos parceiros (C6, FACTA, BMG, HAPPY).',
    defaultSeverity: 'CRITICAL',
    defaultThreshold: 10.0, // > 10% error rate
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'INTEGRATION_LATENCY_SPIKE',
    name: 'Degradação de Latência de Integração',
    category: 'INTEGRATION',
    description: 'Detecta tempo de resposta anormalmente alto nos endpoints bancários que causa lentidão aos digitadores.',
    defaultSeverity: 'MEDIUM',
    defaultThreshold: 3000.0, // > 3000ms average latency
    unit: 'ms',
    enabled: true,
  },
  {
    id: 'INTEGRATION_OFFLINE',
    name: 'Indisponibilidade de Provedor Bancário',
    category: 'INTEGRATION',
    description: 'Detecta parada completa ou incidentes ativos de conexão com provedores bancários.',
    defaultSeverity: 'CRITICAL',
    defaultThreshold: 1.0, // Active incident
    unit: 'count',
    enabled: true,
  },
  {
    id: 'PARTNER_PRODUCTION_DROP',
    name: 'Queda Concentrada em Parceiro',
    category: 'PARTNER',
    description: 'Identifica parceiros ativos de relevante volume que sofreram queda acentuada na produção.',
    defaultSeverity: 'HIGH',
    defaultThreshold: 35.0, // > 35% drop
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'PARTNER_CONVERSION_DROP',
    name: 'Queda de Conversão de Parceiro',
    category: 'PARTNER',
    description: 'Alerta sobre perda substancial de eficiência de conversão em parceiros comerciais.',
    defaultSeverity: 'MEDIUM',
    defaultThreshold: 25.0, // > 25% drop
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'BANK_PRODUCTION_DROP',
    name: 'Queda Concentrada por Banco',
    category: 'BANK',
    description: 'Detecta contração acentuada de volume em uma instituição financeira específica.',
    defaultSeverity: 'HIGH',
    defaultThreshold: 25.0, // > 25% drop in bank
    unit: 'percent',
    enabled: true,
  },
  {
    id: 'PRODUCT_PRODUCTION_DROP',
    name: 'Queda Concentrada por Produto',
    category: 'PRODUCT',
    description: 'Detecta queda abrupta na contratação de determinada modalidade (FGTS, INSS, Cartão, Portabilidade).',
    defaultSeverity: 'HIGH',
    defaultThreshold: 25.0, // > 25% drop in product
    unit: 'percent',
    enabled: true,
  },
];
