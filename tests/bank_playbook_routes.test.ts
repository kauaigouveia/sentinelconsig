import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerBankPlaybookRoutes } from '../server/services/bankPlaybookRoutes';
import { SentinelaAIService } from '../server/services/sentinelaAIService';
import { SentinelaToolRouter } from '../server/services/sentinelaToolRouter';
vi.mock('../server/services/sentinelaAIService', () => ({ SentinelaAIService: { checkRateLimit: vi.fn(() => ({ allowed: true })), query: vi.fn(async () => ({ answer: 'Resposta de teste', sources: [], toolsUsed: [] })) } }));
afterEach(() => vi.clearAllMocks());
const session: any = { tenant: { id: 'tenant-a' }, access: { id: 'access-a', mustChangePassword: false } };
function app(actor: any = session) { const server = express(); server.use(express.json()); registerBankPlaybookRoutes(server, {} as any, async () => actor); return server; }
describe('playbook portal authorization', () => {
 it('requires a portal session and password change before AI access', async () => {
  expect((await request(app(null)).post('/api/partner-portal/bank-playbooks/query').send({ message: 'Facta prazo' })).status).toBe(401);
  expect((await request(app({ ...session, access: { ...session.access, mustChangePassword: true } })).post('/api/partner-portal/bank-playbooks/query').send({ message: 'Facta prazo' })).status).toBe(403);
  expect(SentinelaAIService.query).not.toHaveBeenCalled();
 });
 it('binds the AI actor to the server session and ignores injected roles and tenant IDs', async () => {
  expect((await request(app()).post('/api/partner-portal/bank-playbooks/query').send({ message: 'FACTA prazo', tenantId: 'other', role: 'MASTER' })).status).toBe(200);
  expect(SentinelaAIService.query).toHaveBeenCalledWith({}, { user: { id: 'partner-access-a', role: 'PARTNER' }, effectiveTenantId: 'tenant-a' }, { message: 'FACTA prazo' });
 });
 it('blocks partner analytics tools and permits only the static company playbooks', async () => {
  const actor = { user: { id: 'partner-a', role: 'PARTNER' }, effectiveTenantId: 'tenant-a' };
  expect((await SentinelaToolRouter.executeTool({} as any, actor, 'getOperationalOverview')).rbacBlocked).toBe(true);
  const result = await SentinelaToolRouter.executeTool({} as any, actor, 'searchBankPlaybooks', { query: 'FACTA prazo', tenantId: 'other' });
  expect(result.success).toBe(true); expect(result.data.excerpts.length).toBeGreaterThan(0);
  expect((await SentinelaToolRouter.executeTool({} as any, { ...actor, effectiveTenantId: '' }, 'searchBankPlaybooks', { query: 'FACTA' })).success).toBe(false);
 });
 it('rejects oversized questions', async () => {
  expect((await request(app()).post('/api/partner-portal/bank-playbooks/query').send({ message: 'x'.repeat(1001) })).status).toBe(400);
 });
});
