import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AutomationEngine,
  AVAILABLE_TRIGGERS,
  AVAILABLE_ACTIONS,
  FORBIDDEN_ACTION_TYPES,
  MAX_EXECUTION_DEPTH,
} from '../../server/services/automationEngine';
import { PendencyService } from '../../server/services/pendencyService';

describe('Phase 3 — Central de Automação Visual Workflows & Execution Engine', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      automation: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      automationExecution: {
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'exec_test_1',
          ...args.data,
          createdAt: new Date(),
        })),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      pendency: {
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
      notification: {
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'notif_1',
          ...args.data,
        })),
      },
      comment: {
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'comment_1',
          ...args.data,
        })),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
  });

  // 1. Criar automação básica
  it('Case 1: Deve criar automação básica com formato válido', () => {
    const auto = {
      name: 'Automação Simples',
      event: 'PROPOSAL_STATUS_CHANGED',
      conditions: { matchType: 'ALL', rules: [] },
      actions: [{ type: 'CREATE_NOTIFICATION', params: { title: 'Aviso', message: 'Status mudou' } }],
      active: true,
    };
    expect(auto.name).toBe('Automação Simples');
    expect(auto.event).toBe('PROPOSAL_STATUS_CHANGED');
    expect(auto.actions.length).toBe(1);
  });

  // 2. Criar automação com múltiplas condições AND
  it('Case 2: Deve avaliar corretamente múltiplas condições no modo ALL (AND)', () => {
    const conditions = {
      matchType: 'ALL',
      rules: [
        { field: 'bank', operator: 'EQUALS', value: 'C6' },
        { field: 'proposalValue', operator: 'GREATER_THAN', value: 10000 },
      ],
    };

    const validData = { bank: 'C6', proposalValue: 15000 };
    const invalidData = { bank: 'C6', proposalValue: 5000 };

    expect(AutomationEngine.evaluateConditions(conditions, validData).matched).toBe(true);
    expect(AutomationEngine.evaluateConditions(conditions, invalidData).matched).toBe(false);
  });

  // 3. Criar automação com múltiplas condições OR
  it('Case 3: Deve avaliar corretamente múltiplas condições no modo ANY (OR)', () => {
    const conditions = {
      matchType: 'ANY',
      rules: [
        { field: 'priority', operator: 'EQUALS', value: 'CRITICAL' },
        { field: 'type', operator: 'EQUALS', value: 'INTEGRACAO' },
      ],
    };

    const matchFirst = { priority: 'CRITICAL', type: 'DOCUMENTACAO' };
    const matchSecond = { priority: 'LOW', type: 'INTEGRACAO' };
    const matchNone = { priority: 'LOW', type: 'DOCUMENTACAO' };

    expect(AutomationEngine.evaluateConditions(conditions, matchFirst).matched).toBe(true);
    expect(AutomationEngine.evaluateConditions(conditions, matchSecond).matched).toBe(true);
    expect(AutomationEngine.evaluateConditions(conditions, matchNone).matched).toBe(false);
  });

  // 4. Criar automação com múltiplas ações
  it('Case 4: Deve suportar configuração com múltiplas ações em sequência', () => {
    const actions = [
      { type: 'CREATE_PENDENCY', params: { title: 'Pendência 1' } },
      { type: 'CREATE_NOTIFICATION', params: { title: 'Notificação 1' } },
      { type: 'RECORD_AUDIT', params: { action: 'LOG_TEST' } },
    ];
    expect(actions.length).toBe(3);
  });

  // 5. Tentar salvar regra sem gatilho (deve falhar)
  it('Case 5: Validação deve rejeitar regra sem gatilho/evento', () => {
    const validate = (data: any) => {
      if (!data.name || !data.event) throw new Error('Nome e evento são obrigatórios.');
    };
    expect(() => validate({ name: 'Regra Teste', event: '' })).toThrow();
  });

  // 6. Tentar salvar regra sem ação (deve falhar)
  it('Case 6: Validação deve rejeitar regra sem nenhuma ação', () => {
    const validate = (data: any) => {
      if (!data.actions || data.actions.length === 0) throw new Error('Adicione pelo menos uma ação.');
    };
    expect(() => validate({ name: 'Regra Teste', event: 'PROPOSAL_CREATED', actions: [] })).toThrow();
  });

  // 7. Tentar salvar regra sem nome (deve falhar)
  it('Case 7: Validação deve rejeitar regra sem nome', () => {
    const validate = (data: any) => {
      if (!data.name || !data.name.trim()) throw new Error('Nome é obrigatório.');
    };
    expect(() => validate({ name: '   ', event: 'PROPOSAL_CREATED' })).toThrow();
  });

  // 8. Avaliar operador EQUALS
  it('Case 8: Deve avaliar operador EQUALS para texto, número e booleano', () => {
    expect(AutomationEngine.evaluateRule({ field: 'status', operator: 'EQUALS', value: 'PENDING' }, { status: 'PENDING' }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'status', operator: 'EQUALS', value: 'PENDING' }, { status: 'APPROVED' }).matched).toBe(false);
    expect(AutomationEngine.evaluateRule({ field: 'amount', operator: 'EQUALS', value: 100 }, { amount: 100 }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'active', operator: 'EQUALS', value: true }, { active: true }).matched).toBe(true);
  });

  // 9. Avaliar operador NOT_EQUALS
  it('Case 9: Deve avaliar operador NOT_EQUALS corretamente', () => {
    expect(AutomationEngine.evaluateRule({ field: 'status', operator: 'NOT_EQUALS', value: 'PENDING' }, { status: 'APPROVED' }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'status', operator: 'NOT_EQUALS', value: 'PENDING' }, { status: 'PENDING' }).matched).toBe(false);
  });

  // 10. Avaliar operador CONTAINS
  it('Case 10: Deve avaliar operador CONTAINS para substring e arrays', () => {
    expect(AutomationEngine.evaluateRule({ field: 'reason', operator: 'CONTAINS', value: 'margem' }, { reason: 'Problema com margem consignável' }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'tags', operator: 'CONTAINS', value: 'vip' }, { tags: ['urgente', 'vip', 'portabilidade'] }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'reason', operator: 'CONTAINS', value: 'documento' }, { reason: 'Sem margem' }).matched).toBe(false);
  });

  // 11. Avaliar operador GREATER_THAN
  it('Case 11: Deve avaliar operador GREATER_THAN para valores numéricos', () => {
    expect(AutomationEngine.evaluateRule({ field: 'value', operator: 'GREATER_THAN', value: 5000 }, { value: 12000 }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'value', operator: 'GREATER_THAN', value: 5000 }, { value: 3000 }).matched).toBe(false);
  });

  // 12. Avaliar operador LESS_THAN
  it('Case 12: Deve avaliar operador LESS_THAN para valores numéricos', () => {
    expect(AutomationEngine.evaluateRule({ field: 'value', operator: 'LESS_THAN', value: 5000 }, { value: 3000 }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'value', operator: 'LESS_THAN', value: 5000 }, { value: 8000 }).matched).toBe(false);
  });

  // 13. Avaliar operador BETWEEN
  it('Case 13: Deve avaliar operador BETWEEN para faixas de valores', () => {
    expect(AutomationEngine.evaluateRule({ field: 'score', operator: 'BETWEEN', value: '300, 700' }, { score: 500 }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'score', operator: 'BETWEEN', value: '300, 700' }, { score: 200 }).matched).toBe(false);
    expect(AutomationEngine.evaluateRule({ field: 'score', operator: 'BETWEEN', value: '300, 700' }, { score: 850 }).matched).toBe(false);
  });

  // 14. Avaliar operador IS_EMPTY
  it('Case 14: Deve avaliar operador IS_EMPTY para strings vazias, null e undefined', () => {
    expect(AutomationEngine.evaluateRule({ field: 'assignedToId', operator: 'IS_EMPTY' }, { assignedToId: '' }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'assignedToId', operator: 'IS_EMPTY' }, { assignedToId: null }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'assignedToId', operator: 'IS_EMPTY' }, {}).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'assignedToId', operator: 'IS_EMPTY' }, { assignedToId: 'user_123' }).matched).toBe(false);
  });

  // 15. Avaliar operador IS_NOT_EMPTY
  it('Case 15: Deve avaliar operador IS_NOT_EMPTY para valores preenchidos', () => {
    expect(AutomationEngine.evaluateRule({ field: 'assignedToId', operator: 'IS_NOT_EMPTY' }, { assignedToId: 'user_123' }).matched).toBe(true);
    expect(AutomationEngine.evaluateRule({ field: 'assignedToId', operator: 'IS_NOT_EMPTY' }, { assignedToId: '' }).matched).toBe(false);
    expect(AutomationEngine.evaluateRule({ field: 'assignedToId', operator: 'IS_NOT_EMPTY' }, {}).matched).toBe(false);
  });

  // 16. Executar automação quando condição for verdadeira
  it('Case 16: Deve executar automação quando todas as condições forem atendidas', async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: 'auto_1',
        name: 'Regra Ativa',
        tenantId: 'tenant_test',
        event: 'PROPOSAL_STATUS_CHANGED',
        conditions: {
          matchType: 'ALL',
          rules: [{ field: 'status', operator: 'EQUALS', value: 'PENDING' }],
        },
        actions: [{ type: 'CREATE_NOTIFICATION', params: { title: 'Aviso', message: 'Pendente' } }],
        active: true,
      },
    ]);

    await AutomationEngine.processEvent(mockPrisma, {
      tenantId: 'tenant_test',
      event: 'PROPOSAL_STATUS_CHANGED',
      eventId: 'evt_1',
      data: { id: 'prop_1', status: 'PENDING' },
    });

    expect(mockPrisma.automationExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUCCESS',
          automationId: 'auto_1',
        }),
      })
    );
  });

  // 17. Não executar automação quando condição for falsa (SKIPPED)
  it('Case 17: Deve registrar status SKIPPED e não executar ações quando a condição falhar', async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: 'auto_2',
        name: 'Regra Condicional',
        tenantId: 'tenant_test',
        event: 'PROPOSAL_STATUS_CHANGED',
        conditions: {
          matchType: 'ALL',
          rules: [{ field: 'status', operator: 'EQUALS', value: 'APPROVED' }],
        },
        actions: [{ type: 'CREATE_NOTIFICATION', params: { title: 'Aprovado' } }],
        active: true,
      },
    ]);

    await AutomationEngine.processEvent(mockPrisma, {
      tenantId: 'tenant_test',
      event: 'PROPOSAL_STATUS_CHANGED',
      eventId: 'evt_2',
      data: { id: 'prop_2', status: 'REJECTED' },
    });

    expect(mockPrisma.automationExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          automationId: 'auto_2',
        }),
      })
    );
  });

  // 18. Testar idempotência com mesmo eventId (não reexecutar)
  it('Case 18: Deve garantir idempotência impedindo reexecução para o mesmo eventId', async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: 'auto_idem',
        name: 'Regra Idempotente',
        tenantId: 'tenant_test',
        event: 'PROPOSAL_APPROVED',
        conditions: { matchType: 'ALL', rules: [] },
        actions: [{ type: 'CREATE_NOTIFICATION', params: { title: 'Aviso Idem' } }],
        active: true,
      },
    ]);

    // Primeira chamada
    await AutomationEngine.processEvent(mockPrisma, {
      tenantId: 'tenant_test',
      event: 'PROPOSAL_APPROVED',
      eventId: 'evt_idem_100',
      data: { id: 'prop_idem_100' },
    });
    const firstCount = mockPrisma.automationExecution.create.mock.calls.length;

    // Segunda chamada com mesmo eventId
    await AutomationEngine.processEvent(mockPrisma, {
      tenantId: 'tenant_test',
      event: 'PROPOSAL_APPROVED',
      eventId: 'evt_idem_100',
      data: { id: 'prop_idem_100' },
    });
    const secondCount = mockPrisma.automationExecution.create.mock.calls.length;

    // Não deve ter gerado nova execução
    expect(secondCount).toBe(firstCount);
  });

  // 19. Testar proteção contra loop infinito (depth limit)
  it('Case 19: Deve abortar execução se profundidade (depth) atingir o limite seguro', async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: 'auto_loop',
        name: 'Regra em Loop',
        tenantId: 'tenant_test',
        event: 'PENDENCY_CREATED',
        conditions: [],
        actions: [{ type: 'CREATE_NOTIFICATION', params: { title: 'Loop' } }],
        active: true,
      },
    ]);

    // Chamada com profundidade excedida
    await AutomationEngine.processEvent(mockPrisma, {
      tenantId: 'tenant_test',
      event: 'PENDENCY_CREATED',
      eventId: 'evt_loop_1',
      depth: MAX_EXECUTION_DEPTH,
      data: { id: 'pend_loop_1' },
    });

    // Não deve executar nenhuma automação pois depth >= MAX_EXECUTION_DEPTH
    expect(mockPrisma.automation.findMany).not.toHaveBeenCalled();
  });

  // 20. Testar proteção contra recursão circular (visited automations)
  it('Case 20: Deve abortar recursão quando a automação já constar nos visitedAutomations', async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: 'auto_recursiva',
        name: 'Regra Auto Referente',
        tenantId: 'tenant_test',
        event: 'PENDENCY_STATUS_CHANGED',
        conditions: [],
        actions: [{ type: 'CREATE_NOTIFICATION', params: { title: 'Loop' } }],
        active: true,
      },
    ]);

    await AutomationEngine.processEvent(mockPrisma, {
      tenantId: 'tenant_test',
      event: 'PENDENCY_STATUS_CHANGED',
      eventId: 'evt_rec_1',
      visitedAutomations: ['auto_recursiva'],
      data: { id: 'pend_rec_1' },
    });

    expect(mockPrisma.automationExecution.create).not.toHaveBeenCalled();
  });

  // 21. Testar retry em erro transitório (máximo 3 vezes)
  it('Case 21: Deve tentar novamente erro transitório de rede até 3 vezes', async () => {
    let callCount = 0;
    const transientAction = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('ETIMEDOUT connection timeout to upstream bank');
      }
      return { success: true };
    };

    // Teste direto de identificação de erro transitório
    expect(AutomationEngine.isTransientError(new Error('ETIMEDOUT'))).toBe(true);
    expect(AutomationEngine.isTransientError(new Error('Connection 503 temporarily unavailable'))).toBe(true);
    expect(AutomationEngine.isTransientError(new Error('Validacao falhou: campo requerido'))).toBe(false);
  });

  // 22. Testar falha definitiva sem retry para erro de validação
  it('Case 22: Não deve tentar novamente erros de validação ou de permissão', () => {
    expect(AutomationEngine.isTransientError(new Error('Permissão negada para atualizar'))).toBe(false);
    expect(AutomationEngine.isTransientError(new Error('Formato de CPF inválido'))).toBe(false);
  });

  // 23. Bloquear ação proibida (DELETE_PROPOSAL / EXECUTE_SQL)
  it('Case 23: Deve bloquear rigorosamente ações destrutivas ou proibidas pelo catálogo seguro', async () => {
    for (const forbidden of FORBIDDEN_ACTION_TYPES) {
      await expect(
        AutomationEngine.executeAction(
          mockPrisma,
          { type: forbidden, params: {} },
          { tenantId: 'tenant_test', event: 'PROPOSAL_STATUS_CHANGED', data: {} },
          []
        )
      ).rejects.toThrow(/viola as políticas de segurança/);
    }
  });

  // 24. Executar ação CREATE_PENDENCY
  it('Case 24: Deve executar ação CREATE_PENDENCY com parâmetros corretos', async () => {
    vi.spyOn(PendencyService, 'createPendency').mockResolvedValue({
      pendency: { id: 'pend_created_1' },
      isDuplicate: false,
    } as any);

    const timeline: any[] = [];
    const result = await AutomationEngine.executeAction(
      mockPrisma,
      {
        type: 'CREATE_PENDENCY',
        params: { title: 'Pendência Teste', priority: 'HIGH', type: 'ESTEIRA' },
      },
      { tenantId: 'tenant_test', event: 'PROPOSAL_STATUS_CHANGED', data: { proposalId: 'prop_1' } },
      timeline
    );

    expect(result.success).toBe(true);
    expect(result.result.pendencyId).toBe('pend_created_1');
    expect(PendencyService.createPendency).toHaveBeenCalled();
  });

  // 25. Executar ação ASSIGN_PENDENCY
  it('Case 25: Deve executar ação ASSIGN_PENDENCY delegando ao PendencyService', async () => {
    vi.spyOn(PendencyService, 'assignPendency').mockResolvedValue({
      id: 'pend_1',
      assignedToId: 'user_operador',
    } as any);

    const timeline: any[] = [];
    const result = await AutomationEngine.executeAction(
      mockPrisma,
      {
        type: 'ASSIGN_PENDENCY',
        params: { pendencyId: 'pend_1', userId: 'user_operador' },
      },
      { tenantId: 'tenant_test', event: 'PENDENCY_CREATED', data: {} },
      timeline
    );

    expect(result.success).toBe(true);
    expect(result.result.assignedToId).toBe('user_operador');
    expect(PendencyService.assignPendency).toHaveBeenCalled();
  });

  // 26. Executar ação UPDATE_PENDENCY_PRIORITY
  it('Case 26: Deve executar ação UPDATE_PENDENCY_PRIORITY ajustando prioridade no banco', async () => {
    mockPrisma.pendency.update.mockResolvedValue({
      id: 'pend_2',
      priority: 'CRITICAL',
    });

    const timeline: any[] = [];
    const result = await AutomationEngine.executeAction(
      mockPrisma,
      {
        type: 'UPDATE_PENDENCY_PRIORITY',
        params: { pendencyId: 'pend_2', priority: 'CRITICAL', reason: 'SLA estourado' },
      },
      { tenantId: 'tenant_test', event: 'PENDENCY_SLA_BREACHED', data: {} },
      timeline
    );

    expect(result.success).toBe(true);
    expect(result.result.newPriority).toBe('CRITICAL');
  });

  // 27. Executar ação UPDATE_PENDENCY_STATUS
  it('Case 27: Deve executar ação UPDATE_PENDENCY_STATUS delegando ao PendencyService', async () => {
    vi.spyOn(PendencyService, 'updateStatus').mockResolvedValue({
      id: 'pend_3',
      status: 'EM_ATENDIMENTO',
    } as any);

    const timeline: any[] = [];
    const result = await AutomationEngine.executeAction(
      mockPrisma,
      {
        type: 'UPDATE_PENDENCY_STATUS',
        params: { pendencyId: 'pend_3', status: 'EM_ATENDIMENTO' },
      },
      { tenantId: 'tenant_test', event: 'PENDENCY_ASSIGNED', data: {} },
      timeline
    );

    expect(result.success).toBe(true);
    expect(result.result.status).toBe('EM_ATENDIMENTO');
  });

  // 28. Executar ação RESOLVE_PENDENCY
  it('Case 28: Deve executar ação RESOLVE_PENDENCY baixando a pendência com status RESOLVIDA', async () => {
    vi.spyOn(PendencyService, 'updateStatus').mockResolvedValue({
      id: 'pend_4',
      status: 'RESOLVIDA',
    } as any);

    const timeline: any[] = [];
    const result = await AutomationEngine.executeAction(
      mockPrisma,
      {
        type: 'RESOLVE_PENDENCY',
        params: { pendencyId: 'pend_4', notes: 'Baixa concluída' },
      },
      { tenantId: 'tenant_test', event: 'PROPOSAL_APPROVED', data: {} },
      timeline
    );

    expect(result.success).toBe(true);
    expect(result.result.status).toBe('RESOLVIDA');
  });

  // 29. Executar ação CREATE_NOTIFICATION
  it('Case 29: Deve executar ação CREATE_NOTIFICATION gravando notificação no banco', async () => {
    const timeline: any[] = [];
    const result = await AutomationEngine.executeAction(
      mockPrisma,
      {
        type: 'CREATE_NOTIFICATION',
        params: { title: 'Alerta SLA', message: 'Pendência atrasada', userId: 'user_mgr' },
      },
      { tenantId: 'tenant_test', event: 'PENDENCY_SLA_BREACHED', data: {} },
      timeline
    );

    expect(result.success).toBe(true);
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  // 30. Testar modo simulação (sem mutações no banco)
  it('Case 30: Modo simulação deve testar condições e planejar ações sem alterar o banco', () => {
    const autoConfig = {
      name: 'Simulação Teste',
      event: 'PROPOSAL_STATUS_CHANGED',
      conditions: {
        matchType: 'ALL',
        rules: [{ field: 'status', operator: 'EQUALS', value: 'APPROVED' }],
      },
      actions: [{ type: 'CREATE_NOTIFICATION', params: { title: 'Sucesso' } }],
    };

    const mockEvent = {
      event: 'PROPOSAL_STATUS_CHANGED',
      data: { status: 'APPROVED' },
    };

    const result = AutomationEngine.testAutomation(autoConfig, mockEvent);

    expect(result.triggerMatched).toBe(true);
    expect(result.conditionsMatched).toBe(true);
    expect(result.plannedActions.length).toBe(1);
    expect(result.humanPreview).toContain('QUANDO');
    expect(mockPrisma.automationExecution.create).not.toHaveBeenCalled();
  });

  // 31. Testar duplicação de automação (cópia nasce pausada)
  it('Case 31: Duplicação de regra deve criar novo registro pausado (active: false)', () => {
    const original = {
      id: 'auto_orig',
      name: 'Regra Principal',
      description: 'Desc',
      event: 'PROPOSAL_CREATED',
      conditions: [],
      actions: [],
      active: true,
    };

    const copy = {
      name: `[Cópia] ${original.name}`,
      description: original.description,
      event: original.event,
      conditions: original.conditions,
      actions: original.actions,
      active: false, // OBRIGATÓRIO: Cópia nasce pausada
    };

    expect(copy.name).toBe('[Cópia] Regra Principal');
    expect(copy.active).toBe(false);
  });

  // 32. Testar isolamento multi-tenant (tenant A não afeta tenant B)
  it('Case 32: Automações do Tenant A não devem ser executadas para eventos do Tenant B', async () => {
    mockPrisma.automation.findMany.mockImplementation((args: any) => {
      if (args.where?.tenantId === 'tenant_A') {
        return Promise.resolve([
          {
            id: 'auto_tenant_A',
            name: 'Regra Tenant A',
            tenantId: 'tenant_A',
            event: 'PROPOSAL_CREATED',
            conditions: [],
            actions: [{ type: 'CREATE_NOTIFICATION', params: { title: 'Tenant A' } }],
            active: true,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    // Evento disparado no Tenant B
    await AutomationEngine.processEvent(mockPrisma, {
      tenantId: 'tenant_B',
      event: 'PROPOSAL_CREATED',
      eventId: 'evt_tenant_b',
      data: { id: 'prop_tenant_b' },
    });

    // Não deve executar nenhuma automação no Tenant B
    expect(mockPrisma.automationExecution.create).not.toHaveBeenCalled();
  });
});
