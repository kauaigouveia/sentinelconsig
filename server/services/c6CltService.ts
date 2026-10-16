import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { C6BankService } from './c6BankService.js';
import { PartnerPortalService } from './partnerPortalService.js';
import { hasPermission } from '../../src/lib/permissions.js';
import { isValidCpf } from '../../src/lib/utils.js';
export function registerC6CltRoutes(app: Express, db: PrismaClient, getSession: (req: Request) => Promise<any>) {
 const limiter = rateLimit({windowMs:60000,limit:10,standardHeaders:true,legacyHeaders:false});
 for (const portal of [false,true]) {
  const base = portal ? '/api/partner-portal/c6-clt' : '/api/integrations/c6/clt';
  async function tenant(req:Request, write=false) {
   if (portal) { const session=await PartnerPortalService.getPartnerSession(req,db); return session && !session.access.mustChangePassword ? session.tenant.id : null; }
   const session=await getSession(req); return session?.user && session.effectiveTenantId && hasPermission(session.activeRole || session.user.role,session.activePermissions || session.user.customPermissions,write?'simulations.create':'simulations.view') ? session.effectiveTenantId : null;
  }
  app.get(base+'/availability',async(req,res)=>{res.setHeader('Cache-Control','no-store');try{const id=await tenant(req);if(!id)return res.status(403).json({error:'Entre em uma sessão com acesso às simulações.'});const config=await C6BankService.getTenantConfig(db,id);return res.json({enabled:config.isConfigured && config.cltEnabled===true});}catch{return res.status(500).json({error:'Não foi possível verificar a conexão C6 CLT.'});}});
  for (const action of ['authorize','status']) app.post(base+'/'+action,limiter,async(req,res)=>{
   res.setHeader('Cache-Control','no-store');
   try {
    const id=await tenant(req,true);if(!id)return res.status(403).json({error:'Sessão e permissão para consultar são necessárias.'});
    const config=await C6BankService.getTenantConfig(db,id);if(!config.isConfigured || !config.cltEnabled)return res.status(409).json({error:'Habilite C6 CLT na conexão da empresa.'});
    if(config.baseUrl!==C6BankService.DEFAULT_BASE_URL)return res.status(400).json({error:'Endereço C6 CLT não documentado. Confira a URL da conexão.'});
    const cpf=String(req.body?.cpf || '').replace(/\D/g,'');if(!isValidCpf(cpf))return res.status(400).json({error:'Informe CPF válido.'});
    const name=String(req.body?.name || '').trim(),birthDate=String(req.body?.birthDate || ''),phone=String(req.body?.phone || '').replace(/\D/g,'');
    if(action==='authorize' && (!name || name.length>150 || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(Date.parse(birthDate)) || new Date(birthDate).toISOString().slice(0,10)!==birthDate || Date.parse(birthDate)>=Date.now() || phone && !/^\d{10,11}$/.test(phone)))return res.status(400).json({error:'Confira nome, nascimento e telefone com DDD.'});
    const token=await C6BankService.getAccessToken(db,id);
    const response=await fetch(config.baseUrl+(action==='authorize'?'/marketplace/authorization/generate-liveness':'/marketplace/authorization/status'),{method:'POST',headers:{Authorization:token,'Content-Type':'application/json',Accept:action==='authorize'?'application/vnd.c6bank_authorization_generate_liveness_v1+json':'application/vnd.c6bank_authorization_status_v1+json'},body:JSON.stringify(action==='authorize'?{nome:name,cpf,data_nascimento:birthDate,...(phone?{telefone:{codigo_area:phone.slice(0,2),numero:phone.slice(2)}}:{})}:{cpf}),signal:AbortSignal.timeout(20000),redirect:'error'});
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data || data.error || data.errors)return res.status(502).json({error:`C6 CLT não concluiu a consulta (HTTP ${response.status}). Confira a habilitação CLT da conexão no banco.`});
    if(action==='authorize') {
     let link:URL;try{link=new URL(data.link);}catch{return res.status(502).json({error:'C6 não retornou um link de autorização válido.'});}
     if(!['https:','http:'].includes(link.protocol) || link.username || link.password || !(link.hostname==='c6consig.com.br' || link.hostname.endsWith('.c6consig.com.br')))return res.status(502).json({error:'C6 retornou um endereço de autorização não reconhecido.'});
     return res.json({link:link.href,expiresAt:typeof data.data_expiracao==='string'?data.data_expiracao.slice(0,30):null,message:'Abra o link e aguarde a autorização do cliente. Depois consulte o status.'});
    }
    const returnedStatus=String(data.status || '');
    const status=returnedStatus==='AUTHORIZED'?'AUTORIZADO':returnedStatus;const messages:Record<string,string>={AUTORIZADO:'Cliente autorizado pelo C6.',AGUARDANDO_AUTORIZACAO:'Aguardando autorização do cliente.',NAO_AUTORIZADO:'Autorização não concedida ou expirada.',WAITING_FOR_AUTHORIZATION:'Aguardando autorização do cliente.',PENDING_OF_LIVENESS:'Aguardando verificação do cliente.'};
    const expiresAt=typeof data.data_expiracao==='string' && /^\d{4}-\d{2}-\d{2}$/.test(data.data_expiracao) && Number.isFinite(Date.parse(data.data_expiracao)) ? data.data_expiracao : null;
    return res.json({status:messages[status]?status:'UNKNOWN',expiresAt,message:messages[status] || 'C6 retornou um status ainda não reconhecido. Confira no banco.'});
   }catch{return res.status(502).json({error:'Não foi possível concluir a consulta C6 CLT. Tente novamente.'});}
  });
 }
}
