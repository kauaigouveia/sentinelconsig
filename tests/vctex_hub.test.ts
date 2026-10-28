import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {parseVctexToken,vctexFieldNames} from '../server/services/vctexContract';
import {vctexPermissions,vctexConnectionStatus} from '../server/services/vctexDiagnostic';
import {VctexBankService as Bank} from '../server/services/vctexBankService';
import {IntegrationHubService as Hub} from '../server/services/integrationHubService';
import {registerVctexRoutes} from '../server/services/vctexRoutes';
import {journeyDatabase} from './helpers/cltJourneyDatabase';
const token='synthetic-access-token-not-real';
const login={token:{accessToken:token,expires:3600,type:'Bearer'},access:{restrictedAccess:false,restrictions:[]},data:{permissions:['synthetic-unknown-permission'],products:{consignado:true}}};
const config={cpf:'52998224725',password:'synthetic-password',enabled:true,environment:'production'};
function database(){
 const db:any=journeyDatabase();
 db.promoter={findMany:vi.fn(async({where}:any)=>['a','b'].filter(id=>!where.id||where.id===id).map(id=>({id:where.tenantId+'-'+id,name:'Sintética'})).filter(p=>!where.id||p.id===where.id))};
 db.promoter.findMany.mockImplementation(async({where}:any)=>[where.tenantId+'-a',where.tenantId+'-b'].filter(id=>!where.id||id===where.id).map(id=>({id,name:'Sintética'})));
 db.tenant.findUnique=async()=>({status:'ACTIVE',deletedAt:null});
 for(const name of ['c6SyncHistory','factaSyncHistory','happySyncHistory'])db[name]={findFirst:vi.fn(async()=>null)};
 db.integrationHealthLog={findMany:vi.fn(async()=>[])};db.apiIncident={findMany:vi.fn(async()=>[])};
 return db;
}
beforeEach(()=>{vi.stubEnv('JWT_SECRET','synthetic-secret-only-for-tests-123456');vi.stubEnv('VCTEX_GATEWAY_URL','https://oracle.example.invalid/vctex');vi.stubEnv('VCTEX_GATEWAY_SECRET','synthetic-gateway-key-32-characters');vi.stubGlobal('fetch',vi.fn(async()=>Response.json(login)));});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('accepts the confirmed nested token and retains compatible aliases without exposing metadata',()=>{
 expect(parseVctexToken(login)).toBe(token);expect(parseVctexToken({access_token:token})).toBe(token);expect(parseVctexToken({data:{accessToken:token}})).toBe(token);expect(parseVctexToken({...login,accessToken:token})).toBe(token);
});
it.each([{}, {token:{}},{token:{accessToken:'bad'}},{token:{accessToken:'contains whitespace token'}},{token:{accessToken:12}},{...login,accessToken:'different-synthetic-token'},{...login,accessToken:'bad'},{token:{accessToken:'x'.repeat(8193)}}])('rejects missing, invalid and ambiguous tokens',body=>expect(()=>parseVctexToken(body)).toThrow());
it('never assumes permissions from product presence, unrestricted access or unknown grants',()=>{
 expect(vctexPermissions(login)).toBe('UNPROVEN');expect(vctexPermissions({...login,access:{restrictedAccess:true,restrictions:['unknown']}})).toBe('UNPROVEN');expect(vctexPermissions({data:{products:{consignado:false}}})).toBe('DENIED');expect(vctexPermissions({data:{products:{consignado:{enabled:true}}}})).toBe('UNPROVEN');
 expect(vctexFieldNames({...login,secretTokenAsDynamicKey:'never',data:{permissions:{SensitiveCustomerName:true}}})).not.toContain('secretTokenAsDynamicKey');
});
it('persists sanitized history, reads without bank calls and invalidates evidence when credentials change',async()=>{
 const db=database();await Bank.save(db,'t','t-a',config);const result=await Bank.diagnostic(db,'t','t-a');
 expect(result).toMatchObject({httpStatus:200,authenticationSucceeded:true,tokenRecognized:true,permissionsClt:'UNPROVEN',transportAvailable:true});
 const status=await Bank.status(db,'t','t-a');expect(status.status).toBe('ATTENTION');expect(status.history).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(1);
 for(const sensitive of [token,config.password,config.cpf]){expect(JSON.stringify(result)).not.toContain(sensitive);expect(JSON.stringify(db.rows)).not.toContain(sensitive);expect(JSON.stringify(status)).not.toContain(sensitive);}
 await Bank.save(db,'t','t-a',{...config,password:'synthetic-new-password'});expect((await Bank.status(db,'t','t-a')).lastDiagnostic).toBeNull();
});
it('isolates diagnostics by tenant and promoter and rejects foreign promoter IDs before HTTP',async()=>{
 const db=database();await Bank.save(db,'t','t-a',config);await Bank.diagnostic(db,'t','t-a');expect((await Bank.status(db,'t','t-b')).history).toEqual([]);expect((await Bank.status(db,'other','other-a')).history).toEqual([]);
 await expect(Bank.status(db,'other','t-a')).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([401,403,500])('records authentication failure HTTP %s without raw provider body',async status=>{
 const db=database();await Bank.save(db,'t','t-a',config);vi.mocked(fetch).mockResolvedValue(Response.json({message:'PRIVATE_PROVIDER_MESSAGE'}, {status}));const result=await Bank.diagnostic(db,'t','t-a');expect(result.authenticationSucceeded).toBe(false);expect(result.error).not.toContain('PRIVATE_PROVIDER_MESSAGE');expect((await Bank.status(db,'t','t-a')).status).toBe('OFFLINE');expect((await Bank.status(db,'t','t-a')).metrics.errors24h).toBe(1);
});
it('distinguishes HTTP 200 from an unrecognized token and transport failure',async()=>{
 const db=database();await Bank.save(db,'t','t-a',config);vi.mocked(fetch).mockResolvedValueOnce(Response.json({token:{}}));const result=await Bank.diagnostic(db,'t','t-a');expect(result).toMatchObject({authenticationSucceeded:true,tokenRecognized:false,permissionsVerified:false});
 vi.mocked(fetch).mockRejectedValueOnce(Error('PRIVATE_NETWORK_DETAIL'));const failure=await Bank.diagnostic(db,'t','t-a');expect(failure.transportAvailable).toBe(false);expect(JSON.stringify(failure)).not.toContain('PRIVATE_NETWORK_DETAIL');expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not mark a missing or stale diagnostic online and separates an explicit CLT denial',()=>{
 const c={enabled:true,hasCredentials:true,gatewayReady:true};expect(vctexConnectionStatus(c,null)).toBe('ATTENTION');const d:any={timestamp:new Date().toISOString(),transportAvailable:true,authenticationSucceeded:true,tokenRecognized:true,permissionsClt:'UNPROVEN'};expect(vctexConnectionStatus(c,d)).toBe('ATTENTION');expect(vctexConnectionStatus(c,{...d,permissionsClt:'DENIED'})).toBe('ATTENTION');expect(vctexConnectionStatus(c,{...d,permissionsClt:'CONFIRMED',timestamp:'2000-01-01'})).toBe('ATTENTION');expect(vctexConnectionStatus({...c,enabled:false},d)).toBe('DISABLED');
});
it('adds VCTEX once to monitored indicators without a login and never marks unverified legacy banks online',async()=>{
 const db=database();await Bank.save(db,'t','t-a',config);await Bank.diagnostic(db,'t','t-a');const catalog=await Hub.getCatalog(db,'t');expect(catalog.integrations.map(i=>i.slug)).toEqual(['c6','facta','bmg','happy','vctex']);expect(catalog.summary).toMatchObject({total:5,online:0,attention:4,disabled:1,errors24h:0});expect(fetch).toHaveBeenCalledTimes(1);await expect(Hub.getCatalog(db,null)).rejects.toThrow('Empresa');
});
it('enforces administrative permission and active company before config or diagnostic access',async()=>{
 const db=database();let session:any=null;const app=express();app.use(express.json());registerVctexRoutes(app,db,async()=>session);
 await request(app).get('/api/integrations/vctex/config?promoterId=t-a').expect(401);
 session={effectiveTenantId:'t',user:{id:'u',role:'USER'},activeRole:'USER',activePermissions:[]};await request(app).post('/api/integrations/vctex/diagnostic?promoterId=t-a').send({}).expect(403);
 session.activeRole='TENANT_ADMIN';session.user.role='TENANT_ADMIN';session.activePermissions=['integrations.manage'];await Bank.save(db,'t','t-a',config);
 const response=await request(app).get('/api/integrations/vctex/config?promoterId=t-a').expect(200);expect(response.body.hasCredentials).toBe(true);expect(JSON.stringify(response.body)).not.toContain(config.password);
 await request(app).post('/api/integrations/vctex/diagnostic?promoterId=other-a').send({}).expect(400);expect(fetch).not.toHaveBeenCalled();
});
