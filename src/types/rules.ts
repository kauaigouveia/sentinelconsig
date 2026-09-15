import { PrismaClient } from '@prisma/client';

export type RuleCode =
  | 'RULE_SLA_WARNING'
  | 'RULE_SLA_BREACHED'
  | 'RULE_STUCK_PROPOSAL'
  | 'RULE_TASK_OVERDUE'
  | 'RULE_CIP_PORTABILITY_ALERT'
  | 'RULE_OPERATOR_QUEUE_OVERLOAD'
  | 'RULE_UNASSIGNED_PENDENCY'
  | 'RULE_CONVERSION_DROP';

export type RuleCategory = 'SLA' | 'BOTTLENECK' | 'TASK' | 'PORTABILITY' | 'QUEUE' | 'PERFORMANCE';

export type RuleSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'WARNING' | 'CRITICAL';

export type RuleExecutionStatus = 'SUCCESS' | 'ERROR' | 'DISABLED';

export interface RuleEngineContext {
  tenantId: string;
  prisma: PrismaClient;
  now: Date;
}

export interface RuleEvaluationResult {
  evaluatedCount: number;
  matchedCount: number;
  alertsDispatched: number;
  details?: Record<string, any>;
}

export interface RuleDefinition {
  code: RuleCode;
  name: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
  enabled: boolean;
  evaluate: (context: RuleEngineContext) => Promise<RuleEvaluationResult>;
}

export interface RuleExecutionResult {
  executionId: string;
  ruleCode: RuleCode;
  tenantId: string;
  evaluatedCount: number;
  matchedCount: number;
  alertsDispatched: number;
  status: RuleExecutionStatus;
  durationMs: number;
  errorMessage?: string;
  details?: Record<string, any>;
}

export interface RuleEngineRunSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tenantsProcessed: number;
  totalEvaluated: number;
  totalMatched: number;
  totalAlertsDispatched: number;
  tenantResults: Array<{
    tenantId: string;
    tenantSlug: string;
    results: RuleExecutionResult[];
  }>;
}
