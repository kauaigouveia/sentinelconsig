import express from 'express';import request from 'supertest';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('../server/realtime.js',()=>({sseRegistry:{broadcastToTenant:vi.fn()}}));
import {registerBmgRoutes} from '../server/services/bmgRoutes';
import {BmgBankService as Bmg} from '../server/services/bmgBankService';
import {PartnerPortalService} from '../server/services/partnerPortalService';
import {journeyDatabase} from './helpers/cltJourneyDatabase';
const customer={cpf:'52998224725',phone:'11999999999',product:'CLT'};
beforeEach(()=>{vi.stubEnv('JWT_SECRET','synthetic-bmg-http-secret');vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No bank calls');}));vi.spyOn(PartnerPortalService,'getPartnerSession').mockResolvedValue(null);vi.spyOn(Bmg,'config').mockResolvedValue({enabled:true} as any);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('requires session and explicit SMS-contact approval, uses only the authenticated tenant and actor',async()=>{
 const db:any=journeyDatabase();db.promoter={findMany:async({where}:any)=>where.tenantId==='t'?[{id:'p',name:'DG'}]:[]};let actor:any={effectiveTenantId:'t',activeRole:'TENANT_ADMIN',activePermissions:['simulations.create'],user:{id:'a'}};const bank=vi.spyOn(Bmg,'request').mockResolvedValue({verificationToken:'synthetic-otp'});const app=express();app.use(express.json());registerBmgRoutes(app,db,async()=>actor);
 await request(app).post('/api/integrations/bmg/customer/resend-otp').send(customer).expect(400);expect(bank).not.toHaveBeenCalled();const sent=await request(app).post('/api/integrations/bmg/customer/resend-otp').send({...customer,contactAuthorized:true,tenantId:'other',actorId:'user:other'}).expect(200);expect(sent.body.authorization).toMatchObject({status:'WAITING_OTP',ready:false});expect(bank.mock.calls[0][1]).toBe('t');expect(JSON.stringify(sent.body)).not.toContain('synthetic-otp');
 await request(app).post('/api/integrations/bmg/customer/resend-otp').send({...customer,contactAuthorized:true}).expect(200);expect(bank).toHaveBeenCalledOnce();actor={...actor,user:{id:'b'}};const status=await request(app).post('/api/integrations/bmg/customer/authorization-status').send(customer).expect(200);expect(status.body.authorization.status).toBe('MISSING');actor=null;await request(app).post('/api/integrations/bmg/customer/resend-otp').send({...customer,contactAuthorized:true}).expect(401);expect(bank).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
});
