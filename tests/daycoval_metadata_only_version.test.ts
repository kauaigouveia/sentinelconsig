import fs from 'node:fs';
import ts from 'typescript';
import express from 'express';
import request from 'supertest';
import {expect,it,vi} from 'vitest';

const source=ts.createSourceFile('daycovalRoutes.ts',fs.readFileSync(new URL('../server/services/daycovalRoutes.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function handler(deps:Record<string,unknown>){
 let expression='';
 const visit=(node:ts.Node)=>{
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text==='patch' &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text==='/api/daycoval/version-date')expression=node.arguments.at(-1)!.getText(source);
  ts.forEachChild(node,visit);
 };
 visit(source);if(!expression)throw Error('Route not found');
 const compiled=ts.transpileModule('('+expression+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...Object.keys(deps),'return '+compiled)(...Object.values(deps));
}
function setup(authorize=true,compatible=true){
 const book={fileName:'planilha-oficial.xlsx',enabled:true,formulaHash:'homologated',hash:'sha256-original',versionDate:'2026-10-30',terms:[108,96]};
 const update=vi.fn(async()=>({})),audit=vi.fn(async()=>({}));
 const deps={
   context:async()=>authorize?{canImport:true,tenantId:'tenant-a',userId:'user-a',userName:'Operador'}:null,
   bank:'DAYCOVAL',read:async()=>({...book}),
   isPortRefinModelCompatible:()=>compatible,
   prisma:{systemConfig:{update}},KEY:'DAYCOVAL_INSS_WORKBOOK_V1',
   encodeDaycoval:(value:unknown)=>JSON.stringify(value),
   AuditLogService:{record:audit},
 };
 const app=express();app.use(express.json());app.patch('/api/daycoval/version-date',handler(deps));
 return {app,update,audit,book};
}
it('corrige apenas a data e preserva o hash e as fórmulas aprovadas, com auditoria',async()=>{
 const x=setup();
 const r=await request(x.app).patch('/api/daycoval/version-date').send({versionDate:'2026-11-13',confirmMetadataOnly:true});
 expect(r.status).toBe(200);
 expect(r.body).toMatchObject({metadataOnly:true,versionDate:'2026-11-13',hash:x.book.hash});
 const update=x.update.mock.calls[0][0] as any;
 const payload=JSON.parse(update.data.configValue);
 expect(payload).toMatchObject({hash:x.book.hash,formulaHash:x.book.formulaHash,fileName:x.book.fileName,versionDate:'2026-11-13'});
 expect(x.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({action:'DAYCOVAL_DATA_VERSAO_CORRIGIDA',newData:expect.objectContaining({metadataOnly:true,previousDate:'2026-10-30'})}));
});
it('não corrige data sem confirmação expressa',async()=>{
 const x=setup();
 const r=await request(x.app).patch('/api/daycoval/version-date').send({versionDate:'2026-11-13'});
 expect(r.status).toBe(400);expect(x.update).not.toHaveBeenCalled();
});
it('não aceita atualização de data quando a planilha está incompatível',async()=>{
 const x=setup(true,false);
 const r=await request(x.app).patch('/api/daycoval/version-date').send({versionDate:'2026-11-13',confirmMetadataOnly:true});
 expect(r.status).toBe(409);expect(x.update).not.toHaveBeenCalled();
});
it('respeita permissão de gerenciar integrações e valida o calendário',async()=>{
 const unauthorized=setup(false);
 expect((await request(unauthorized.app).patch('/api/daycoval/version-date').send({versionDate:'2026-11-13',confirmMetadataOnly:true})).status).toBe(403);
 const invalid=setup();
 expect((await request(invalid.app).patch('/api/daycoval/version-date').send({versionDate:'2026-11-31',confirmMetadataOnly:true})).status).toBe(400);
 expect(invalid.update).not.toHaveBeenCalled();
});
