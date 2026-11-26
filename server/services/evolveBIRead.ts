import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import { WorkbankService } from './workbankService.js';
import { ParanaBankService } from './paranaBankService.js';

const TENANT = 'cmwwf76ef0000jm074ydgay0f';
const digest = (value: string) => createHash('sha256').update(value).digest();
export function authorizedBIRead(auth: unknown, token: string | undefined, tenant: unknown) {
  return typeof token === 'string' && token.length >= 48 && tenant === TENANT &&
    typeof auth === 'string' && auth.startsWith('Bearer ') &&
    timingSafeEqual(digest(auth.slice(7)), digest(token));
}
type BankStatus = {bankStatus:string,bankStatusAt:string|null,bankStatusSource:string};
function bankStatusValue(value:unknown,at:unknown,source:string):BankStatus|null {
  if(typeof value!=='string'||!value.trim())return null;
  const date=at instanceof Date?at:typeof at==='string'?new Date(at):null;
  return {bankStatus:value.trim().slice(0,250),bankStatusAt:date&&Number.isFinite(date.getTime())?date.toISOString():null,bankStatusSource:source};
}
export function storedBankStatus(p:any):BankStatus|null {
  const bank=String(p.bank?.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),code=p.bank?.code;
  if(p.finantoSimulationId)return bankStatusValue(p.finantoStatus,p.finantoLastSyncAt,'Finanto');
  if(p.nossaFintechDebtKey)return bankStatusValue(p.nossaFintechStatusDescription||p.nossaFintechStatus,p.nossaFintechLastSyncAt,'Nossa Fintech');
  if(code==='336'||/\bC6\b/.test(bank))return bankStatusValue(p.c6RawSituation||p.c6ActivityDescription||p.c6CurrentActivity,p.c6LastSyncAt,'C6');
  if(code==='149'||/FACTA/.test(bank))return bankStatusValue(p.factaRawStatus,p.factaLastSyncAt,'FACTA');
  if(/HAPPY|BYX/.test(bank))return bankStatusValue(p.happyStatusName||p.happyStatusDescription||p.happyStatus,p.happyLastSyncAt,'Happy/BYX');
  if(/FINANTO/.test(bank))return bankStatusValue(p.finantoStatus,p.finantoLastSyncAt,'Finanto');
  if(/NOSSA FINTECH/.test(bank))return bankStatusValue(p.nossaFintechStatusDescription||p.nossaFintechStatus,p.nossaFintechLastSyncAt,'Nossa Fintech');
  return null;
}
const date = (value: Date) => new Date(value.getTime() - 3 * 3600000).toISOString().slice(0, 10);
export function registerEvolveBIRead(app: Express, prisma: PrismaClient) {
  app.get('/api/evolve-bi/proposals-read', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers.cookie || req.headers.origin || !authorizedBIRead(req.headers.authorization, process.env.SENTINEL_BI_READ_TOKEN, req.headers['x-sentinel-tenant'])) {
      return res.status(403).json({ error: 'Consulta não autorizada.' });
    }
    const after = req.query.after;
    if (after !== undefined && (typeof after !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(after))) return res.status(400).json({error:'Cursor inválido.'});
    try {
      const tenant = await prisma.tenant.findFirst({where:{id:TENANT,status:'ACTIVE',deletedAt:null},select:{id:true}});
      if (!tenant) return res.status(403).json({error:'Empresa indisponível.'});
      const rows = await prisma.proposal.findMany({
        where: {tenantId:TENANT, deletedAt:null, ...(typeof after === 'string' ? {id:{gt:after}} : {})},
        orderBy:{id:'asc'}, take:251,
        select:{id:true,proposalNumber:true,createdAt:true,updatedAt:true,promoterId:true,type:true,standardCategory:true,contractValue:true,releasedValue:true,debtBalance:true,
          c6RawSituation:true,c6CurrentActivity:true,c6ActivityDescription:true,c6LastSyncAt:true,
          factaRawStatus:true,factaLastSyncAt:true,happyStatus:true,happyStatusName:true,happyStatusDescription:true,happyLastSyncAt:true,
          finantoSimulationId:true,finantoStatus:true,finantoLastSyncAt:true,nossaFintechDebtKey:true,nossaFintechStatus:true,nossaFintechStatusDescription:true,nossaFintechLastSyncAt:true,
          partner:{select:{tenantId:true,name:true,deletedAt:true}},
          bank:{select:{tenantId:true,name:true,code:true}},
          status:{select:{tenantId:true,name:true,code:true,standardCategory:true}},
          product:{select:{tenantId:true,scope:true,name:true}},
          convenio:{select:{tenantId:true,scope:true,name:true}},
          createdBy:{select:{tenantId:true,name:true,deletedAt:true}}}
      });
      const page = rows.slice(0,250);
      const sources=await prisma.systemConfig.findMany({where:{tenantId:TENANT,configKey:{in:page.map(p=>'workbank:source:'+p.id)}},select:{configKey:true,configValue:true}});
      const workbank=new Map(sources.map(s=>[s.configKey.slice('workbank:source:'.length),s.configValue]));
      const bmgIds=page.filter(p=>p.bank?.tenantId===TENANT&&p.bank.code==='318').map(p=>p.id);
      const audits=bmgIds.length?await prisma.auditLog.findMany({where:{tenantId:TENANT,entity:'Proposal',action:'SINCRONIZAR_BMG_PROPOSTA',entityId:{in:bmgIds}},orderBy:[{createdAt:'desc'},{id:'desc'}],distinct:['entityId'],select:{entityId:true,newData:true,createdAt:true}}):[];
      const bmg=new Map(audits.map(a=>[a.entityId,a]));
      const records=[];
      for(const p of page){
        let current:BankStatus|null=null;
        if(p.bank?.tenantId===TENANT){
          try{
            if(workbank.has(p.id)){
              const source=JSON.parse(workbank.get(p.id)!);
              if(source.promoterId===p.promoterId&&typeof source.externalId==='string'&&p.promoterId){
                const stored=await WorkbankService.read(prisma,TENANT,p.promoterId,'record:'+createHash('sha256').update(source.externalId).digest('hex'));
                const item=stored?.value;
                if(item?.proposalId===p.id&&item.row?.proposalNumber===p.proposalNumber&&!item.message)current=bankStatusValue(item.row.status,item.lastSyncAt,'WorkBank');
              }
            }else if(p.bank.code==='254'&&p.promoterId){
              const value=await ParanaBankService.readProposalStatus(prisma,TENANT,p.promoterId,p.id,p.proposalNumber);
              if(value)current=bankStatusValue(value.status,value.lastSyncAt,'Paraná Banco');
            }else if(p.bank.code==='318'){
              const audit=bmg.get(p.id);
              if(audit?.newData)current=bankStatusValue(JSON.parse(audit.newData).bankStatus,audit.createdAt,'BMG');
            }else current=storedBankStatus(p);
          }catch{/* Do not guess a bank status if stored data is unreadable. */}
        }
        records.push({
        id:p.proposalNumber, sourceId:p.id, created:date(p.createdAt), modality:p.type,
        category:p.status?.tenantId===TENANT?p.status.standardCategory:p.standardCategory, updatedAt:p.updatedAt.toISOString(), status:p.status?.tenantId===TENANT?p.status.name:p.standardCategory,
        statusCode:p.status?.tenantId===TENANT?p.status.code:'',
        producer:p.partner?.tenantId===TENANT&&!p.partner.deletedAt?p.partner.name:'',
        bank:p.bank?.tenantId===TENANT?p.bank.name:'',
        product:p.product&&(p.product.tenantId===TENANT||p.product.scope==='GLOBAL'&&p.product.tenantId===null)?p.product.name:'',
        entity:p.convenio&&(p.convenio.tenantId===TENANT||p.convenio.scope==='GLOBAL'&&p.convenio.tenantId===null)?p.convenio.name:'',
        operator:p.createdBy?.tenantId===TENANT&&!p.createdBy.deletedAt?p.createdBy.name:'',
        gross:Number(p.contractValue),net:Number(p.releasedValue),refinance:Number(p.debtBalance??0), ...(current||{bankStatus:'',bankStatusAt:null,bankStatusSource:''})
        });
      }
      return res.json({records,next:rows.length>250?page[page.length-1].id:null});
    } catch {return res.status(503).json({error:'Consulta temporariamente indisponível.'});}
  });
}
