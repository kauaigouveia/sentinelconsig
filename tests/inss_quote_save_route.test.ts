// @vitest-environment node
import fs from 'node:fs';
import ts from 'typescript';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { inssSimulationDraft } from '../server/services/inssSimulationDraft';
import { portabilityQuoteCondition } from '../src/lib/portRefinQuote';
import { hasPendingOriginOverlap, quoteOriginKeys } from '../server/services/inssQuoteDeduplication';

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
 const records:any[]=[];
 const create=vi.fn(async (query:any)=>{const record={id:'persisted-'+(records.length+1),...query.data};records.push(record);return record;});
 const findMany=vi.fn(async(query:any)=>records.filter(record=>Object.entries(query.where).every(([key,value])=>(value === null ? record[key] == null : record[key] === value))).map(record=>({id:record.id,customerData:record.customerData})));
 const partner=vi.fn(async (query:any)=>query.where.tenantId==='tenant-a'&&query.where.id==='partner-a'?{id:'partner-a',status:'ATIVO'}:null);
 const bankConfig=vi.fn(), broadcast=vi.fn(), audit=vi.fn();
 const deps={
  getAuthSession:async()=>({user:{id:'user-a',name:'Operador Teste',role:'MASTER',customPermissions:[]},effectiveTenantId:'tenant-a'}),
  hasPermission:()=>true,
  inssSimulationDraft,quoteOriginKeys,hasPendingOriginOverlap,
  SimulationService:{normalizeCpf:(v:string)=>v,checkExistingPendingSimulation:async()=>null},
  isValidCpf:()=>true,
  prisma:{partner:{findFirst:partner},simulationRequest:{create,findMany}},
  resolveBankPromoter:vi.fn(),
  ParanaBankService:{config:bankConfig},
  sseRegistry:{broadcastToTenant:broadcast},
  AuditLogService:{record:audit},
  maskCPF:()=> '***.***.***-**',
 };
 const app=express();app.use(express.json());app.post('/api/simulations',findCreateHandler(deps));
 return {app,create,findMany,records,partner,bankConfig,broadcast,audit};
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

it('salva três contratos de origem distintos com o mesmo CPF, parceiro e benefício, sem gerar duplicidade',async()=>{
  const server=setup();
  const quote=portabilityQuoteCondition({provider:'DAYCOVAL',table:{cod_tabela:'SYNTHETIC',name:'Teste'},troco:500,term:108,data:{rate:1.85,installment:30}},30);
  const numbers=['TESTE-001','TESTE-002','TESTE-003'];
  for(const number of numbers){
    const response=await request(server.app).post('/api/simulations').send({
      cpf:'52998224725',partnerId:'partner-a',simulationType:'INSS_MULTI',operationType:'PORT_REFIN',selectedCondition:quote,
      customerData:{...customerData,originContract:{...customerData.originContract,contractNumber:number}},
    });
    expect(response.status).toBe(201);
  }
  expect(server.records).toHaveLength(3);
  expect(server.findMany).toHaveBeenCalled();
  expect(server.findMany.mock.calls[2][0].where).toMatchObject({tenantId:'tenant-a',partnerId:'partner-a',cpf:'52998224725',status:'SIMULAÇÃO ENVIADA',simulationType:'INSS_MULTI'});
  const duplicate=await request(server.app).post('/api/simulations').send({
    cpf:'52998224725',partnerId:'partner-a',simulationType:'INSS_MULTI',operationType:'PORT_REFIN',selectedCondition:quote,
    customerData:{...customerData,originContract:{...customerData.originContract,contractNumber:'TESTE-002'}},
  });
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error).toMatch(/contrato de origem/i);
  expect(server.records).toHaveLength(3);
});
