// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
const pusher=vi.hoisted(()=>({channel:'',bindings:new Map<string,Function>(),connection:new Map<string,Function>(),disconnect:vi.fn()}));
vi.mock('pusher-js',()=>({default:class {
  connection={bind:(type:string,fn:Function)=>pusher.connection.set(type,fn)};
  subscribe(channel:string){pusher.channel=channel;return {bind:(type:string,fn:Function)=>pusher.bindings.set(type,fn)};}
  disconnect=pusher.disconnect;
}}));
import { connectPartnerSupportRealtime } from '../src/services/partnerSupportRealtime';
const context={provider:'sse',tenantId:'tenant-a',channel:'private-support-partner-'+ 'a'.repeat(64)};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();pusher.bindings.clear();pusher.connection.clear();vi.clearAllMocks();});
describe('External partner transport lifecycle, synthetic only',()=>{
  it('receives SSE invalidations, catches up on reopen and ignores foreign events',async()=>{
    const sources:any[]=[];
    class Source {onopen:any;onmessage:any;close=vi.fn();constructor(public url:string){sources.push(this);}}
    vi.stubGlobal('EventSource',Source);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>context})));
    const receive=vi.fn(),catchUp=vi.fn(),stop=connectPartnerSupportRealtime(receive,catchUp);
    await waitFor(()=>expect(sources).toHaveLength(1));
    sources[0].onopen();sources[0].onopen();expect(catchUp).toHaveBeenCalledTimes(2);
    const event={type:'SUPPORT_MESSAGE_RECEIVED',entity:'SUPPORT',entityId:'conversation-a',tenantId:'tenant-a'};
    sources[0].onmessage({data:JSON.stringify(event)});
    sources[0].onmessage({data:JSON.stringify({...event,tenantId:'tenant-b'})});
    sources[0].onmessage({data:'invalid json'});expect(receive).toHaveBeenCalledTimes(1);
    stop();sources[0].onmessage({data:JSON.stringify(event)});expect(receive).toHaveBeenCalledTimes(1);expect(sources[0].close).toHaveBeenCalledOnce();
  });
  it('subscribes only to the server-authorized partner Pusher channel and catches up after reconnect',async()=>{
    vi.stubEnv('VITE_PUSHER_KEY','synthetic-public-key');
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({...context,provider:'pusher'})})));
    const receive=vi.fn(),catchUp=vi.fn(),stop=connectPartnerSupportRealtime(receive,catchUp);
    await waitFor(()=>expect(pusher.bindings.size).toBe(4));expect(pusher.channel).toBe(context.channel);
    pusher.connection.get('connected')!();pusher.connection.get('connected')!();expect(catchUp).toHaveBeenCalledTimes(2);
    pusher.bindings.get('SUPPORT_CONVERSATION_ASSIGNED')!({entity:'SUPPORT',entityId:'conversation-a',tenantId:'tenant-a'});
    expect(receive).toHaveBeenCalledOnce();stop();expect(pusher.disconnect).toHaveBeenCalledOnce();
  });
  it('does not open a transport after unmount or an unauthorized session',async()=>{
    let finish:any;vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{finish=resolve;})));
    const Source=vi.fn();vi.stubGlobal('EventSource',Source);
    const stop=connectPartnerSupportRealtime(vi.fn(),vi.fn());stop();
    finish({ok:true,json:async()=>context});await Promise.resolve();await Promise.resolve();expect(Source).not.toHaveBeenCalled();
  });
});
