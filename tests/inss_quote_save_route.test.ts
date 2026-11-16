// @vitest-environment node
import fs from 'node:fs';
import ts from 'typescript';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { inssSimulationDraft } from '../server/services/inssSimulationDraft';
import { portabilityQuoteCondition } from '../src/lib/portRefinQuote';

/** Exercises the actual POST handler without a database connection or bank calls. */
const source=ts.createSourceFile('server.ts',fs.readFileSync(new URL('../server.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function findCreateHandler(dependencies:Record<string,any>){
 let found='';
 const visit=(node:ts.Node)=>{
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)
    &&node.expression.name.text==='post'&&node.arguments[0]
    &&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='/api/simulations')
    found=node.arguments.at(-1)!.getText(source);
  ts.forEachChild(node,visit);
 };
 visit(source);
 if(!found)throw new Error('Rota de simulações não encontrada');
 const compiled=ts.transpileModule('('+found+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...Object.keys(dependencies),'return '+compiled)(...Object.values(dependencies));
}
const customerData={birthDate:'1966-06-15',benefitNumber:'0000000001',benefitType:32,name:'Pessoa sintética',
 originContract:{lenderCode:'237',contractNumber:'TESTE-0001',term:'84',installmentsRemaining:'54',installmentValue:'30',dueBalanceValue:'1018.99'}};
function setup(){
 const create=vi.fn(async (query:any)=>({id:'persisted',...query.data}));
 const partner=vi.fn(async (query:any)=>query.where.tenantId==='tenant-a'&&query.where.id==='partner-a'?{id:'partner-a',status:'ATIVO'}:null);
 const bankConfig=vi.fn(), broadcast=vi.fn(), audit=vi.fn();
 const deps={
  getAuthSession:async()=>({user:{id:'user-a',name:'Operador Teste',role:'MASTER',customPermissions:[]},effectiveTenantId:'tenant-a'}),
  hasPermission:()=>true,
  inssSimulationDraft,
  SimulationService:{normalizeCpf:(v:string)=>v,checkExistingPendingSimulation:async()=>null},
  isValidCpf:()=>true,
  prisma:{partner:{findFirst:partner},simulationRequest:{create}},
  resolveBankPromoter:vi.fn(),
  ParanaBankService:{config:bankConfig},
  sseRegistry:{broadcastToTenant:broadcast},
  AuditLogService:{record:audit},
  maskCPF:()=> '***.***.***-**',
 };
 const app=express();app.use(express.json());app.post('/api/simulations',findCreateHandler(deps));
 return {app,create,partner,bankConfig,broadcast,audit};
}
describe('POST /api/simulations recebe cotação por planilha para revisão',()=>{
 it.each(['DAYCOVAL','C6','PARANA'])('grava estimativa %s sem executar API bancária',async(provider)=>{
  const server=setup();
  const selectedCondition=portabilityQuoteCondition({
   provider,table:{cod_tabela:'TEST-108',name:'Condição simulada'},
   troco:334.12,term:108,requiresReview:true,
   data:{rate:1.85,installment:30},
  },30);
  const response=await request(server.app).post('/api/simulations').send({
   cpf:'52998224725',partnerId:'partner-a',simulationType:'INSS_MULTI',operationType:'PORT_REFIN',
   selectedCondition,customerData,
  });
  expect(response.status).toBe(201);
  expect(server.create).toHaveBeenCalledTimes(1);
  const recorded=server.create.mock.calls[0][0].data;
  expect(recorded.tenantId).toBe('tenant-a');
  expect(recorded.selectedCondition).toMatchObject({quoteKind:'SPREADSHEET_ESTIMATE',reviewRequired:true,reviewState:'PENDING'});
  expect(recorded.customerData.quoteReview).toMatchObject({required:true,status:'PENDING'});
  expect(recorded.status).toBe('SIMULAÇÃO ENVIADA');
  expect(server.bankConfig).not.toHaveBeenCalled();
  expect(server.broadcast).toHaveBeenCalledTimes(1);
  expect(server.audit).toHaveBeenCalledTimes(1);
 });
 it('impede parceiro de outra empresa',async()=>{
  const server=setup();
  const selectedCondition=portabilityQuoteCondition({provider:'DAYCOVAL',table:{cod_tabela:'TEST',name:'Planilha teste'},troco:200,term:108,data:{rate:1.85,installment:30}},30);
  const response=await request(server.app).post('/api/simulations').send({
   cpf:'52998224725',partnerId:'partner-other-tenant',simulationType:'INSS_MULTI',operationType:'PORT_REFIN',
   selectedCondition,customerData,
  });
  expect(response.status).toBe(400);
  expect(server.create).not.toHaveBeenCalled();
  expect(server.partner.mock.calls[0][0].where).toMatchObject({tenantId:'tenant-a'});
 });
});
