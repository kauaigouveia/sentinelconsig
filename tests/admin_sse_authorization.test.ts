import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../server/services/pusherService.js',()=>({eventBus:{publishToTenant:vi.fn(),publishToUser:vi.fn()}}));
import { sseRegistry, type SSEConnection } from '../server/realtime';
beforeEach(()=>{vi.stubEnv('VITE_REALTIME_PROVIDER','sse');});
afterEach(()=>{sseRegistry.closeAllConnections();vi.useRealTimers();vi.unstubAllEnvs();});
function connection(id:string,validateAuthorization=vi.fn(async()=>true),tenantId='tenant-a'):SSEConnection {
  return {connectionId:id,userId:'user-a',tenantId,userRole:'MASTER',createdAt:new Date(),validateAuthorization,
    res:{write:vi.fn(),end:vi.fn(),writableEnded:false} as any};
}
const event={type:'SUPPORT_MESSAGE_RECEIVED',entity:'SUPPORT',entityId:'conversation-a'};
describe('Administrative SSE per-delivery authorization',()=>{
  it('revalidates every delivery and closes a revoked stream without writing the event',async()=>{
    const validate=vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),conn=connection('revoked',validate);
    sseRegistry.registerConnection(conn);await sseRegistry.broadcastToTenant('tenant-a',event);
    expect(conn.res.write).toHaveBeenCalledOnce();await sseRegistry.broadcastToTenant('tenant-a',event);
    expect(validate).toHaveBeenCalledTimes(2);expect(conn.res.write).toHaveBeenCalledOnce();expect(conn.res.end).toHaveBeenCalledOnce();
  });
  it('revalidates user-specific delivery and fails closed on errors',async()=>{
    const conn=connection('error',vi.fn(async()=>{throw Error('DB unavailable');}));sseRegistry.registerConnection(conn);
    await sseRegistry.emitToUser('tenant-a','user-a',event);expect(conn.res.write).not.toHaveBeenCalled();expect(conn.res.end).toHaveBeenCalledOnce();
  });
  it('coalesces in-flight authorization for tabs with the same context, without caching decisions',async()=>{
    const validate=vi.fn(async()=>true),a=connection('tab-a',validate),b=connection('tab-b',validate);
    a.authorizationKey=b.authorizationKey='same-session-and-scope';sseRegistry.registerConnection(a);sseRegistry.registerConnection(b);
    await sseRegistry.broadcastToTenant('tenant-a',event);expect(validate).toHaveBeenCalledOnce();
    await sseRegistry.broadcastToTenant('tenant-a',event);expect(validate).toHaveBeenCalledTimes(2);
  });
  it('heartbeats close invalid sessions and never write after a stream is removed',async()=>{
    vi.useFakeTimers();const conn=connection('expired',vi.fn(async()=>false));sseRegistry.registerConnection(conn);
    await vi.advanceTimersByTimeAsync(25000);expect(conn.res.write).not.toHaveBeenCalled();expect(conn.res.end).toHaveBeenCalledOnce();
  });
  it('does not query or deliver to another tenant',async()=>{
    const conn=connection('other',vi.fn(async()=>true),'tenant-b');sseRegistry.registerConnection(conn);
    await sseRegistry.broadcastToTenant('tenant-a',event);expect(conn.validateAuthorization).not.toHaveBeenCalled();expect(conn.res.write).not.toHaveBeenCalled();
  });
});
