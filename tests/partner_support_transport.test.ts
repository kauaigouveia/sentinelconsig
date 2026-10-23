import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const calls=vi.hoisted(()=>({trigger:vi.fn().mockResolvedValue(undefined),authorize:vi.fn(()=>({auth:'synthetic-signature'}))}));
vi.mock('pusher',()=>({default:class {trigger=calls.trigger;authorizeChannel=calls.authorize;}}));
vi.mock('../server/logger.js',()=>({logger:{info:vi.fn(),error:vi.fn(),warn:vi.fn(),debug:vi.fn()}}));
import { partnerSupportChannel } from '../server/services/pusherService';
import { publishPartnerSupport, registerPartnerSupportRealtime } from '../server/services/partnerSupportRealtime';

const session={tenant:{id:'tenant-a'},partner:{id:'partner-a'}};
function setup(current: any=session) {
  const routes=new Map<string,Function>();
  const app={get:(path:string,handler:Function)=>routes.set('GET '+path,handler),post:(path:string,handler:Function)=>routes.set('POST '+path,handler)};
  const getSession=vi.fn(async()=>current);
  registerPartnerSupportRealtime(app as any,getSession);
  const req=Object.assign(new EventEmitter(),{body:{} as any});
  const res=Object.assign(new EventEmitter(),{code:200,body:undefined as any,setHeader:vi.fn(),flushHeaders:vi.fn(),write:vi.fn(),end:vi.fn(),status(code:number){this.code=code;return this;},json(body:any){this.body=body;return this;}});
  return {routes,req,res,getSession,run:(method:string,path:string)=>routes.get(method+' /api/partner-portal/realtime'+path)!(req,res)};
}
beforeEach(()=>{
  vi.clearAllMocks();
  for(const key of ['PUSHER_APP_ID','PUSHER_KEY','PUSHER_SECRET','PUSHER_CLUSTER'])vi.stubEnv(key,'synthetic');
  vi.stubEnv('VITE_REALTIME_PROVIDER','pusher');
});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
describe('Partner-specific real route handlers with mocked Pusher, no network/database',()=>{
  it.each([['GET','/context'],['POST','/auth'],['GET','']])('requires a valid portal session for %s %s',async(method,path)=>{
    const fixture=setup(null);await fixture.run(method,path);expect(fixture.res.code).toBe(401);expect(calls.authorize).not.toHaveBeenCalled();
  });
  it.each([
    'private-tenant-tenant-a',partnerSupportChannel('tenant-b','partner-a'),partnerSupportChannel('tenant-a','partner-b'),
  ])('denies every channel outside the authenticated partner scope: %s',async channel=>{
    const fixture=setup();fixture.req.body={socket_id:'123.456',channel_name:channel};await fixture.run('POST','/auth');
    expect(fixture.res.code).toBe(403);expect(calls.authorize).not.toHaveBeenCalled();
  });
  it('authorizes only its opaque channel and rejects invalid sockets',async()=>{
    const fixture=setup();await fixture.run('GET','/context');
    expect(fixture.res.body.channel).toBe(partnerSupportChannel('tenant-a','partner-a'));
    fixture.req.body={socket_id:'invalid',channel_name:fixture.res.body.channel};await fixture.run('POST','/auth');expect(fixture.res.code).toBe(400);
    fixture.req.body.socket_id='123.456';await fixture.run('POST','/auth');expect(calls.authorize).toHaveBeenCalledWith('123.456',partnerSupportChannel('tenant-a','partner-a'),{});
  });
  it('publishes a minimal Pusher invalidation only to the intended partner',async()=>{
    await publishPartnerSupport('tenant-a','partner-a',{type:'SUPPORT_MESSAGE_RECEIVED',entityId:'conversation-a'});
    expect(calls.trigger).toHaveBeenCalledWith(partnerSupportChannel('tenant-a','partner-a'),'SUPPORT_MESSAGE_RECEIVED',expect.objectContaining({entity:'SUPPORT',entityId:'conversation-a',tenantId:'tenant-a'}));
    expect(Object.keys(calls.trigger.mock.calls[0][2]).sort()).toEqual(['entity','entityId','tenantId','timestamp','type']);
  });
  it('isolates SSE by BOTH tenant and partner, and closes a revoked session',async()=>{
    vi.useFakeTimers();vi.stubEnv('VITE_REALTIME_PROVIDER','sse');
    const own=setup(),otherPartner=setup({...session,partner:{id:'partner-b'}}),otherTenant=setup({...session,tenant:{id:'tenant-b'}});
    for(const fixture of [own,otherPartner,otherTenant]){await fixture.run('GET','');fixture.res.write.mockClear();}
    await publishPartnerSupport('tenant-a','partner-a',{type:'SUPPORT_CONVERSATION_STATUS_CHANGED',entityId:'conversation-a'});
    expect(own.res.write).toHaveBeenCalledTimes(1);expect(otherPartner.res.write).not.toHaveBeenCalled();expect(otherTenant.res.write).not.toHaveBeenCalled();
    own.getSession.mockResolvedValue(null);await vi.advanceTimersByTimeAsync(25000);expect(own.res.end).toHaveBeenCalledTimes(1);
    for(const fixture of [own,otherPartner,otherTenant])fixture.req.emit('close');
  });
});
