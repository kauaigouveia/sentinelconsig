vi.mock('../server/services/partnerSupportRealtime.js', () => ({publishPartnerSupport:vi.fn()}));
import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({broadcastToTenant: vi.fn().mockResolvedValue(undefined)}));
vi.mock('../server/realtime.js', () => ({sseRegistry: transport}));
vi.mock('../server/logger.js', () => ({logger:{info:vi.fn(),error:vi.fn(),warn:vi.fn()}}));
vi.mock('../server/services/auditLogService.js', () => ({AuditLogService:{record:vi.fn()}}));
import { publishPartnerSupport } from '../server/services/partnerSupportRealtime';
import { eventBus } from '../server/services/eventBus';
import { SUPPORT_EVENTS } from '../src/lib/supportRealtime';
beforeEach(()=>vi.clearAllMocks());
describe('Actual backend support broadcast contract, transport injected',()=>{
  it.each(SUPPORT_EVENTS)('keeps %s invalidation tenant-scoped and content-free',async eventType=>{
    await eventBus.publish({eventType,entity:'SUPPORT',entityId:'synthetic-conversation',tenantId:'synthetic-tenant',data:{partnerId:'synthetic-partner',conversationId:'synthetic-conversation',message:'synthetic private content',partnerName:'synthetic partner'}});
    expect(transport.broadcastToTenant).toHaveBeenCalledWith('synthetic-tenant',expect.objectContaining({type:eventType,entity:'SUPPORT',entityId:'synthetic-conversation',data:undefined}));
    const json=JSON.stringify(transport.broadcastToTenant.mock.calls[0]);
    expect(json).not.toContain('synthetic private content');
    expect(json).not.toContain('partnerName');
    expect(publishPartnerSupport).toHaveBeenCalledWith('synthetic-tenant','synthetic-partner',{type:eventType,entityId:'synthetic-conversation'});
  });
});
