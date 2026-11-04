import {it,expect,vi,beforeEach} from 'vitest';
import {readCatalogConnections} from '../server/services/integrationCatalogConnections';
import {IntegrationHubService} from '../server/services/integrationHubService';
import {VctexBankService} from '../server/services/vctexBankService';
const promos=[{id:'synthetic-promoter'}];
it('whitelists config metadata, scopes tenant/promoter and never calls banks',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('External request prohibited'));
 const source=vi.fn(async(_db:any,tenant:string,promoter:string)=>{expect(tenant).toBe('synthetic-company');expect(promoter).toBe(promos[0].id);return {enabled:true,configured:true,environment:'production',password:'synthetic-secret',token:'synthetic-token'};});
 const result=await readCatalogConnections({} as any,'synthetic-company',promos,{v8:source});
 expect(result.v8.connections[0]).toEqual({enabled:true,configured:true,environment:'production',baseUrl:undefined});expect(JSON.stringify(result)).not.toContain('synthetic-secret');expect(JSON.stringify(result)).not.toContain('token');expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});
it('fails closed per provider and does not reuse another tenant data',async()=>{
 const source=vi.fn(async()=>{throw Error('synthetic credential decryption error');});
 const a=await readCatalogConnections({} as any,'company-A',promos,{v8:source,finanto:async()=>({enabled:true,configured:true})});
 expect(a.finanto.connections[0]).toMatchObject({enabled:true,configured:true});
 const b=await readCatalogConnections({} as any,'company-B',[],{v8:source});
 expect(a.v8).toEqual({connections:[],unavailable:true});expect(b.v8).toEqual({connections:[],unavailable:false});expect(source).toHaveBeenCalledTimes(1);
 await expect(readCatalogConnections({} as any,'',promos,{})).rejects.toThrow('Empresa');
});
it('catalog includes all banks without asserting online merely from credentials',async()=>{
 // Config getters are stubbed at their DB boundary: no real database or provider is reachable.
 const prisma={promoter:{findMany:vi.fn(async()=>[])},systemConfig:{findMany:vi.fn(async()=>[])},c6SyncHistory:{findFirst:vi.fn(async()=>null)},factaSyncHistory:{findFirst:vi.fn(async()=>null)},happySyncHistory:{findFirst:vi.fn(async()=>null)},integrationHealthLog:{findMany:vi.fn(async()=>[])},apiIncident:{findMany:vi.fn(async()=>[])}};
 const result=await IntegrationHubService.getCatalog(prisma as any,'synthetic-company');
 expect(result.integrations.map(row=>row.slug).sort()).toEqual(['c6','facta','bmg','happy','finanto','nossa-fintech','workbank','parana','presenca','v8','vctex'].sort());
 expect(result.summary.total).toBe(11);expect(result.summary.online).toBe(0);expect(result.integrations.every(row=>!row.active)).toBe(true);
 for(const call of prisma.integrationHealthLog.findMany.mock.calls as any[])expect(call[0].where.tenantId).toBe('synthetic-company');
 expect(prisma.promoter.findMany).toHaveBeenCalledWith({where:{tenantId:'synthetic-company',status:'ATIVO'},select:{id:true}});
});
it('does not echo malformed URLs or URL credentials',()=>{
 expect(IntegrationHubService.maskUrl('synthetic-secret')).toBe('Não informada');
 expect(IntegrationHubService.maskUrl('https://user:password@example.test/secret?token=sensitive')).toBe('https://example.test/***');
});

it('uses current configured/enabled flags and needs fresh evidence before online',async()=>{
 const status=vi.spyOn(VctexBankService,'status').mockResolvedValue({enabled:false,hasCredentials:false,history:[],metrics:{requests24h:0,errors24h:0,complete:true}} as any);
 const log={bank:'C6',timestamp:new Date(),success:true,httpStatus:200,latencyMs:12,errorMessage:null,rayId:null};
 const prisma={promoter:{findMany:vi.fn(async()=>promos)},c6SyncHistory:{findFirst:vi.fn(async()=>null)},factaSyncHistory:{findFirst:vi.fn(async()=>null)},happySyncHistory:{findFirst:vi.fn(async()=>null)},integrationHealthLog:{findMany:vi.fn(async()=>[log])},apiIncident:{findMany:vi.fn(async()=>[])}};
 const read=vi.fn(async()=>Object.fromEntries(['c6','facta','bmg','happy','finanto','nossa-fintech','workbank','parana','presenca','v8'].map(slug=>[slug,{connections:[{enabled:['c6','v8'].includes(slug),configured:['c6','v8','finanto'].includes(slug),environment:'production'}],unavailable:false}])));
 const result=await IntegrationHubService.getCatalog(prisma as any,'synthetic-company',read);
 expect(read).toHaveBeenCalledWith(prisma,'synthetic-company',promos);
 expect(result.integrations.find(row=>row.slug==='c6')?.status).toBe('ONLINE');
 expect(result.integrations.find(row=>row.slug==='v8')).toMatchObject({active:true,configured:true,status:'UNKNOWN'});
 expect(result.integrations.find(row=>row.slug==='finanto')).toMatchObject({active:false,configured:true,status:'DISABLED'});
 expect(result.summary).toMatchObject({total:11,online:1,attention:0,unknown:1,disabled:9});status.mockRestore();
});
it('retains independently scoped VCTEX diagnostics across promoters rather than treating them as unscoped legacy logs',async()=>{const promoters=[{id:'synthetic-one'},{id:'synthetic-two'}];const status=vi.spyOn(VctexBankService,'status').mockImplementation(async(_db,_tenant,promoter)=>({enabled:true,hasCredentials:true,status:'ONLINE',history:[{timestamp:new Date().toISOString(),authenticationRecognized:true,httpStatus:200,latencyMs:1}],metrics:{requests24h:1,errors24h:0,complete:true}} as any));try{const prisma={promoter:{findMany:vi.fn(async()=>promoters)},c6SyncHistory:{findFirst:vi.fn(async()=>null)},factaSyncHistory:{findFirst:vi.fn(async()=>null)},happySyncHistory:{findFirst:vi.fn(async()=>null)},integrationHealthLog:{findMany:vi.fn(async()=>[])},apiIncident:{findMany:vi.fn(async()=>[])}};const read=vi.fn(async()=>Object.fromEntries(['c6','facta','bmg','happy','finanto','nossa-fintech','workbank','parana','presenca','v8'].map(slug=>[slug,{connections:[],unavailable:false}])));const catalog=await IntegrationHubService.getCatalog(prisma as any,'synthetic-company',read);expect(catalog.integrations.find(b=>b.slug==='vctex')?.status).toBe('ONLINE');expect(status.mock.calls.map(call=>call.slice(1))).toEqual([['synthetic-company','synthetic-one'],['synthetic-company','synthetic-two']]);}finally{status.mockRestore();}});
