import express from 'express';
import request from 'supertest';
import {expect,it,vi} from 'vitest';
import {registerBankPlaybookCatalog} from '../server/services/bankPlaybookCatalog';
import {portabilityGuide} from '../src/lib/portabilityGuide';
const db={auditLog:{findMany:vi.fn(async(..._args:any[])=>[{id:'trace-1',createdAt:new Date('2026-10-30T12:00:00Z'),newData:JSON.stringify({priorityId:null,trace:[{code:'OFFICIAL_TRANSPORT_UNAVAILABLE',bank:'daycoval',secret:'do-not-expose'}],cpf:'do-not-expose'})}])}};
const actor=(role='OPERADOR')=>({user:{id:'synthetic',role,customPermissions:role==='MASTER'?['simulations.view','audit_logs.view','integrations.manage']:['simulations.view']},effectiveTenantId:'tenant-a'});
function app(session:any){const app=express();app.use(express.json());registerBankPlaybookCatalog(app,db as any,async()=>session);return app;}
it('uses the existing engine and preserves full documentary sources behind the concise guide',async()=>{
 const guide=portabilityGuide('parana')!;expect(guide.summary.length).toBeGreaterThan(0);expect(guide.sources).toHaveLength(1);expect(guide.hasConflicts).toBe(false);
 const response=await request(app(actor())).get('/api/bank-playbooks');expect(response.status).toBe(200);
 expect(new Set(response.body.rows.map((row:any)=>row.id)).size).toBe(response.body.rows.length);
 expect(response.body.rows.find((row:any)=>row.id==='parana').sections.some((section:any)=>section.id==='parana-replacement-20261030')).toBe(true);
 expect(response.body.canDiagnose).toBe(false);
});
it('denies partner/ordinary-user diagnostics and restricts managers to their server-selected tenant',async()=>{
 expect((await request(app(null)).get('/api/bank-playbooks/routing-diagnostics')).status).toBe(403);
 expect((await request(app(actor())).get('/api/bank-playbooks/routing-diagnostics')).status).toBe(403);
 const response=await request(app(actor('MASTER'))).get('/api/bank-playbooks/routing-diagnostics?tenantId=tenant-b');
 expect(response.status).toBe(200);expect(db.auditLog.findMany.mock.calls[0][0]).toMatchObject({where:{tenantId:'tenant-a'}});
 expect(JSON.stringify(response.body)).not.toContain('do-not-expose');
});

it('projects detailed documentary conflicts according to server permissions',async()=>{
 const ordinary=await request(app(actor())).get('/api/bank-playbooks');
 const authorized=await request(app(actor('MASTER'))).get('/api/bank-playbooks');
 expect(ordinary.body.rows.find((row:any)=>row.id==='parana').guide.details).toEqual([]);
 expect(authorized.body.rows.find((row:any)=>row.id==='parana').guide.details.length).toBeGreaterThan(0);
});
