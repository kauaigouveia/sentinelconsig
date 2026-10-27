import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { parseCltBirthDate, displayCltBirthDate, maskCltBirthDate } from '../src/lib/cltCustomerData';
import { registerCltJourneyRoutes } from '../server/services/cltJourneyRoutes';
import { CltJourneyService } from '../server/services/cltJourneyService';
import { ProductSimulationService } from '../server/services/productSimulationService';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';
import { journeyDatabase } from './helpers/cltJourneyDatabase';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it.each([['29/02/2000','2000-02-29'],['31/04/1990',undefined],['29/02/1900',undefined],['01/01/2999',undefined],['2020-01-01',undefined],['00/01/1990',undefined]])('validates actual calendar dates %s', (value,expected)=>expect(parseCltBirthDate(value)).toBe(expected));
it('masks DD/MM/YYYY and restores ISO without timezone shifts',()=>{expect(maskCltBirthDate('28021990')).toBe('28/02/1990');expect(displayCltBirthDate('1990-02-28')).toBe('28/02/1990');});
const input={cpf:'52998224725',name:'Pessoa sintética',phone:'11999999999',v8BirthDate:'1990-02-28',v8Email:'synthetic@example.invalid',v8Gender:'male' as const};
async function setup(){
 vi.stubEnv('JWT_SECRET','synthetic-customer-encryption');vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Real banks forbidden')}));
 const db=journeyDatabase(),service=new CltJourneyService();vi.spyOn(service,'available').mockResolvedValue([{id:'v8',name:'V8 DIGITAL'},{id:'facta',name:'FACTA'}]);
 const run=vi.spyOn(ProductSimulationService,'run').mockResolvedValue({rows:[],message:undefined});
 const app=express();app.use(express.json());registerCltJourneyRoutes(app,{...db,tenant:{findUnique:async()=>({status:'ACTIVE'})}},async()=>({user:{id:'synthetic-user',role:'MASTER'},effectiveTenantId:'tenant-a'}),service);
 return{db,service,app,run};
}
it('stores the six fields encrypted, scopes recovery, and sends additional data only to V8',async()=>{
 const c=await setup(),id='00000000-0000-4000-8000-000000000077';
 expect((await request(c.app).post('/api/simulations/clt/journey').send({...input,executionId:id})).status).toBe(200);
 const restored=await new CltJourneyService().get(c.db,'tenant-a','user:synthetic-user',id);
 expect(restored?.snapshot.customer).toMatchObject(input);
 expect(await c.service.get(c.db,'tenant-b','user:synthetic-user',id)).toBeUndefined();expect(await c.service.get(c.db,'tenant-a','user:other',id)).toBeUndefined();
 for(const key of [input.cpf,input.phone,input.v8Email,input.v8BirthDate])expect(JSON.stringify(c.db.rows)).not.toContain(key);
 const v8=c.run.mock.calls.find(call=>call[6]?.[0]==='v8')!,facta=c.run.mock.calls.find(call=>call[6]?.[0]==='facta')!;
 expect(v8[4]).toMatchObject(input);expect(facta[4].v8Email).toBeUndefined();expect(facta[4].v8BirthDate).toBeUndefined();expect(facta[4].v8Gender).toBeUndefined();
 expect(V8CltSimulationService.consultationPayload({...v8[4],value:0,term:0,mode:'Payment',eligibility:true})).toEqual({borrowerDocumentNumber:input.cpf,signerName:input.name,gender:'male',birthDate:'1990-02-28',signerEmail:input.v8Email,signerPhone:{phoneNumber:'999999999',countryCode:'55',areaCode:'11'},provider:'QI'});
});
it.each([{v8BirthDate:''},{v8BirthDate:'1990-02-30'},{v8Email:'invalid'},{v8Gender:'other'}])('rejects incomplete/invalid first-step data before providers %s',async patch=>{
 const c=await setup();expect((await request(c.app).post('/api/simulations/clt/journey').send({...input,...patch,executionId:'00000000-0000-4000-8000-000000000078'})).status).toBe(400);expect(c.run).not.toHaveBeenCalled();
});
