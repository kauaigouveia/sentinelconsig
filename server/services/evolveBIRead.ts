import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';

const TENANT = 'cmwwf76ef0000jm074ydgay0f';
const digest = (value: string) => createHash('sha256').update(value).digest();
export function authorizedBIRead(auth: unknown, token: string | undefined, tenant: unknown) {
  return typeof token === 'string' && token.length >= 48 && tenant === TENANT &&
    typeof auth === 'string' && auth.startsWith('Bearer ') &&
    timingSafeEqual(digest(auth.slice(7)), digest(token));
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
        select:{id:true,proposalNumber:true,createdAt:true,type:true,standardCategory:true,contractValue:true,releasedValue:true,debtBalance:true,
          partner:{select:{tenantId:true,name:true,deletedAt:true}},
          bank:{select:{tenantId:true,name:true}},
          status:{select:{tenantId:true,name:true,code:true}},
          product:{select:{tenantId:true,scope:true,name:true}},
          convenio:{select:{tenantId:true,scope:true,name:true}},
          createdBy:{select:{tenantId:true,name:true,deletedAt:true}}}
      });
      const page = rows.slice(0,250);
      return res.json({records:page.map(p=>({
        id:p.proposalNumber, sourceId:p.id, created:date(p.createdAt), modality:p.type,
        category:p.standardCategory, status:p.status?.tenantId===TENANT?p.status.name:p.standardCategory,
        statusCode:p.status?.tenantId===TENANT?p.status.code:'',
        producer:p.partner?.tenantId===TENANT&&!p.partner.deletedAt?p.partner.name:'',
        bank:p.bank?.tenantId===TENANT?p.bank.name:'',
        product:p.product&&(p.product.tenantId===TENANT||p.product.scope==='GLOBAL'&&p.product.tenantId===null)?p.product.name:'',
        entity:p.convenio&&(p.convenio.tenantId===TENANT||p.convenio.scope==='GLOBAL'&&p.convenio.tenantId===null)?p.convenio.name:'',
        operator:p.createdBy?.tenantId===TENANT&&!p.createdBy.deletedAt?p.createdBy.name:'',
        gross:Number(p.contractValue),net:Number(p.releasedValue),refinance:Number(p.debtBalance??0)
      })),next:rows.length>250?page[page.length-1].id:null});
    } catch {return res.status(503).json({error:'Consulta temporariamente indisponível.'});}
  });
}
