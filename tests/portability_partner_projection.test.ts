import fs from 'node:fs';
import ts from 'typescript';
import express from 'express';
import request from 'supertest';
import {expect,it,vi} from 'vitest';
import {publicPortabilityRows,routingAuditConstraint,routingAuditAction,routingDiagnostic} from '../server/services/portabilityRouting';
import {hasPermission} from '../src/lib/permissions';
const source=ts.createSourceFile('server.ts',fs.readFileSync(new URL('../server.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function handler(method:string,path:string,dependencies:Record<string,any>){let text='';const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text===method&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===path)text=node.arguments.at(-1)!.getText(source);ts.forEachChild(node,visit);};visit(source);if(!text)throw Error('Route not found');return new Function(...Object.keys(dependencies),`return ${ts.transpileModule('('+text+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText}`)(...Object.values(dependencies));}
const context={tenant:{id:'tenant-a'},partner:{id:'partner-a',code:'SYN'},access:{id:'access-a',name:'Sintético'}};
const offer={provider:'DAYCOVAL',institution:'Daycoval',state:'OFFER',amount:100,installment:35,term:36,rate:1.5,policyReview:'PRIVATE_PRIORITY',routing:{reason:'PRIVATE_PRIORITY'},quoteKind:'ESTIMATE'};
it('projects historical workbook offers over the real HTTP callback and binds history to tenant/partner',async()=>{
 const findMany=vi.fn(async(..._args:any[])=>[{id:'synthetic-history',operationType:'INSS:PORT_REFIN',simulationType:'SPREADSHEET_INSS',customerData:{offers:[{...offer,state:undefined}]} }]);
 const app=express();app.get('/api/partner-portal/simulations',handler('get','/api/partner-portal/simulations',{PartnerPortalService:{getPartnerSession:async()=>context},PartnerSimulationTracking:{reconcile:async()=>{}},prisma:{simulationRequest:{findMany}},publicPortabilityRows}));
 const response=await request(app).get('/api/partner-portal/simulations?tenantId=tenant-b');expect(response.status).toBe(200);
 expect(findMany.mock.calls[0][0].where).toMatchObject({tenantId:'tenant-a',partnerId:'partner-a'});
 expect(response.body.rows[0].offers[0]).toMatchObject({institution:'Daycoval',amount:100,quoteKind:'ESTIMATE'});expect(JSON.stringify(response.body)).not.toContain('PRIVATE_PRIORITY');
});
it('projects an idempotent replay without re-executing the bank dispatcher',async()=>{
 const input={product:'INSS',operation:'PORT_REFIN',cpf:'52998224725',name:'Pessoa sintética',phone:'11999999999',birthDate:'1980-01-01',benefitNumber:'00000001',benefitType:41,mode:'Payment',term:36,value:35,debt:900,originalTerm:60,remainingTerm:36,originalInstallment:35,originalBank:'001',originalContract:'SYNTHETIC',employerDocument:'',attemptKey:'synthetic-replay-0001'};
 const run=vi.fn();const app=express();app.use(express.json());
 app.post('/api/partner-portal/simulations/:action',handler('post','/api/partner-portal/simulations/:action',{PartnerPortalService:{getPartnerSession:async()=>context},portabilityReviewMetadata:()=>({}),isValidCpf:()=>true,ageAt:()=>46,prisma:{simulationRequest:{findUnique:async()=>({id:'saved',customerData:{...input,offers:[offer]}})}},PartnerSimulationService:{run},publicPortabilityRows}));
 const response=await request(app).post('/api/partner-portal/simulations/simulate').send(input);
 expect(response.status).toBe(200);expect(run).not.toHaveBeenCalled();expect(response.body.rows[0].institution).toBe('Daycoval');expect(JSON.stringify(response.body)).not.toContain('PRIVATE_PRIORITY');
});
it.each([false,true])('protects routing diagnostics through the general audit API too (authorized=%s)',async(authorized)=>{
 const permissions=['users.view',...(authorized?['audit_logs.view','integrations.manage']:[])];
 const findMany=vi.fn(async(..._args:any[])=>[]),count=vi.fn(async()=>0);
 const session={user:{id:'synthetic',role:'OPERADOR',customPermissions:permissions,tenantId:'tenant-a'},effectiveTenantId:'tenant-a'};
 const app=express();app.get('/api/audit-logs',handler('get','/api/audit-logs',{getAuthSession:async()=>session,hasPermission,routingAuditConstraint,prisma:{auditLog:{findMany,count}},logger:{error:vi.fn()}}));
 const response=await request(app).get('/api/audit-logs?action='+routingAuditAction+'&tenantId=tenant-b');
 expect(response.status).toBe(200);expect(findMany.mock.calls[0][0].where).toMatchObject({tenantId:'tenant-a',AND:[routingAuditConstraint(authorized,'tenant-a')]});
});
it('reads the actual string-based audit schema and tolerates malformed history without leaking fields',()=>{
 for(const newData of ['null','not-json'])expect(routingDiagnostic({id:'x',createdAt:'synthetic',newData}).trace).toEqual([]);
 expect(routingDiagnostic({id:'x',createdAt:'synthetic',newData:JSON.stringify({trace:[{code:'PRIORITY_SELECTED',reason:'Motivo interno',secret:'hidden'}]})}).trace[0]).toEqual({code:'PRIORITY_SELECTED',reason:'Motivo interno',bank:undefined,ruleId:undefined,version:undefined});
});
