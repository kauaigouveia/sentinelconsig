import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import { hasPermission } from '../../src/lib/permissions.js';
import { BANK_PLAYBOOKS } from '../../src/lib/bankPlaybooks.js';
import readingContent from '../assets/bank-playbooks/reading-content.json';
import quickReference from '../assets/bank-playbooks/quick-reference.json';
import { PORTABILITY_BOOKS, PORTABILITY_SECTIONS } from '../../src/lib/portabilityPlaybooks.js';
import {portabilityGuide} from '../../src/lib/portabilityGuide.js';
import {PORTABILITY_SOURCE_SUPPLEMENT} from '../../src/lib/portabilityRuleSources.js';
import {routingDiagnostic} from './portabilityRouting.js';
const prefix = 'BANK_PLAYBOOK_PDF_V2_';
export async function customPlaybooks(db: PrismaClient, tenantId: string) {
 const rows = await db.systemConfig.findMany({ where: { tenantId, configKey: { startsWith: prefix } } });
 return rows.flatMap(row => { try { const value = JSON.parse(row.configValue); return !value || value.active === false || !['id','name','version','text','source','receivedAt'].every(key => typeof value[key] === 'string') ? [] : [value]; } catch { return []; } });
}
export function registerBankPlaybookCatalog(app: Express, db: PrismaClient, getSession: (req: Request) => Promise<any>) {
 async function access(req: Request, write = false) {
  const session = await getSession(req);
  if (!session?.user || !session.effectiveTenantId) return null;
  const role = session.activeRole || session.user.role;
  if (write ? !['MASTER','PLATFORM_MASTER','ADMIN'].includes(role) : !hasPermission(role, session.activePermissions || session.user.customPermissions, 'simulations.view')) return null;
  return session;
 }
 app.get('/api/bank-playbooks', async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  try { const session = await access(req); if (!session) return res.status(403).json({error:'Sem acesso aos roteiros.'});
   const books = [...new Map([...PORTABILITY_BOOKS,...BANK_PLAYBOOKS].map(book=>[book.id,book])).values()];
   const extra=PORTABILITY_SOURCE_SUPPLEMENT.banks.map(bank=>({id:bank.id+'-supplement',bankId:bank.id,title:'Documento complementar de portabilidade',page:0,topics:['Portabilidade'],paragraphs:[`Fonte: ${PORTABILITY_SOURCE_SUPPLEMENT.sourceFile}. Vigência e prioridade não informadas. Página ${bank.page} indicada na transcrição.`],tables:[{kind:'table',rows:bank.fields}]}));
   return res.json({ rows: books.map(book=>({...book,convenios:['INSS'],guide:portabilityGuide(book.id),pdfUrl:BANK_PLAYBOOKS.some(old=>old.id===book.id)?`/api/bank-playbooks/${book.id}/pdf`:null,sections:[...PORTABILITY_SECTIONS,...extra,...quickReference,...readingContent].filter(section=>section.bankId===book.id)})), canEdit: false,canDiagnose:hasPermission(session.activeRole||session.user.role,session.activePermissions||session.user.customPermissions,'audit_logs.view')&&hasPermission(session.activeRole||session.user.role,session.activePermissions||session.user.customPermissions,'integrations.manage') });
  } catch { return res.status(500).json({error:'Não foi possível carregar os roteiros.'}); }
 });
 app.get('/api/bank-playbooks/routing-diagnostics',async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  try{const session=await access(req);const role=session?.activeRole||session?.user.role,permissions=session?.activePermissions||session?.user.customPermissions;
   if(!session||!hasPermission(role,permissions,'audit_logs.view')||!hasPermission(role,permissions,'integrations.manage'))return res.status(403).json({error:'Sem acesso ao diagnóstico.'});
   const rows=await db.auditLog.findMany({where:{tenantId:session.effectiveTenantId,action:'simulation.portability_routing'},orderBy:{createdAt:'desc'},take:50,select:{id:true,createdAt:true,newData:true}});
   return res.json({rows:rows.map(routingDiagnostic)});
  }catch{return res.status(500).json({error:'Não foi possível carregar o diagnóstico.'});}
 });
 app.get('/api/bank-playbooks/:id/cover',async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  try{const session=await access(req);if(!session)return res.status(403).end();const book=BANK_PLAYBOOKS.find(row=>row.id===req.params.id);if(!book)return res.status(404).end();res.setHeader('X-Content-Type-Options','nosniff');res.sendFile(path.resolve(process.cwd(),'server/assets/bank-playbooks',book.id+'.png'),error=>{if(error&&!res.headersSent)res.status(404).end();});}catch{if(!res.headersSent)res.status(500).end();}
 });
 app.get('/api/bank-playbooks/:id/pdf',async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  try {const session=await access(req);if(!session)return res.status(403).json({error:'Sem acesso ao documento.'});
   const book=BANK_PLAYBOOKS.find(row=>row.id===req.params.id);if(!book)return res.status(404).json({error:'PDF não encontrado.'});
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Type','application/pdf');
   res.setHeader('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="${book.id}-roteiro.pdf"`);
   const filePath=path.resolve(process.cwd(),'server/assets/bank-playbooks',book.id+'.pdf');
   const {size}=await stat(filePath);let start=0,end=size-1;
   res.setHeader('Accept-Ranges','bytes');
   if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match || !match[1]&&!match[2]){res.setHeader('Content-Range',`bytes */${size}`);return res.status(416).end();}
    if(!match[1])start=Math.max(0,size-Number(match[2]));
    else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){res.setHeader('Content-Range',`bytes */${size}`);return res.status(416).end();}
    res.status(206);res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
   }
   res.setHeader('Content-Length',String(end-start+1));
   res.flushHeaders();
   const stream=createReadStream(filePath,{start,end});
   stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);

  }catch{if(!res.headersSent)res.status(500).json({error:'Não foi possível abrir o PDF.'});}
 });
 app.post('/api/bank-playbooks',async(req,res)=>{const session=await access(req,true);if(!session)return res.status(403).json({error:'Sem permissão.'});return res.status(409).json({error:'A biblioteca foi substituída pelos PDFs. O cadastro antigo de texto foi encerrado.'});});
}
