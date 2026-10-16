import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import { PartnerPortalService } from './partnerPortalService.js';
import { hasPermission } from '../../src/lib/permissions.js';

// Suspended at the company request after confirmation with C6 (16/10/2026).
// Keep explicit responses for old browser tabs; no credentials or bank calls.
export function registerC6CltRoutes(app: Express, db: PrismaClient, getSession: (req: Request) => Promise<any>) {
 for (const portal of [false,true]) {
  const base=portal?'/api/partner-portal/c6-clt':'/api/integrations/c6/clt';
  const handler=async(req:Request,res:any)=>{
   res.setHeader('Cache-Control','no-store');
   try {
    if(portal){const session=await PartnerPortalService.getPartnerSession(req,db);if(!session || session.access.mustChangePassword)return res.status(403).json({error:'Entre no portal para continuar.'});}
    else{const session=await getSession(req);if(!session?.user || !session.effectiveTenantId || !hasPermission(session.activeRole || session.user.role,session.activePermissions || session.user.customPermissions,'simulations.view'))return res.status(403).json({error:'Sem acesso às simulações.'});}
    if(req.method==='GET')return res.json({enabled:false,suspended:true});
    return res.status(409).json({error:'C6 CLT temporariamente suspenso. Utilize os demais bancos disponíveis.'});
   }catch{return res.status(500).json({error:'Não foi possível verificar a sessão.'});}
  };
  app.get(base+'/availability',handler);
  app.post(base+'/authorize',handler);
  app.post(base+'/status',handler);
 }
}
