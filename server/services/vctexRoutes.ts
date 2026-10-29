import {vctexConsultationRows} from '../../src/lib/vctexCurrentState.js';
import type {Express,Request} from 'express';
import rateLimit from 'express-rate-limit';
import {hasPermission} from '../../src/lib/permissions.js';
import {resolveBankPromoter} from './bankPromoterConfig.js';
import {CltJourneyService} from './cltJourneyService.js';
import {VctexBankService} from './vctexBankService.js';
import {withinJourneyDeadline} from './cltJourneyDeadline.js';
import {AuditLogService} from './auditLogService.js';

export function registerVctexRoutes(app:Express,db:any,getSession:(req:Request)=>Promise<any>,journeys=new CltJourneyService()){
  const base='/api/integrations/vctex';
  app.use(base,rateLimit({windowMs:60000,limit:20,standardHeaders:true,legacyHeaders:false}));
  const wrap=(permission:string,run:(req:Request,c:{tenant:string;actor:string;user:string;promoter:string})=>Promise<unknown>)=>async(req:any,res:any)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      const session=await getSession(req),tenant=session?.effectiveTenantId;
      if(!session?.user||!tenant)return res.status(401).json({error:'Sessão inválida.'});
      const role=session.activeRole||session.user.role;
      if(session.partner||session.partnerId||session.user.partnerId||/PARTNER|PARCEIRO/i.test(role||'')||!hasPermission(role,session.activePermissions||session.user.customPermissions,permission))return res.status(403).json({error:'Sem permissão VCTEX nesta empresa.'});
      const company=await db.tenant.findUnique({where:{id:tenant},select:{status:true,deletedAt:true}});
      if(!company||company.deletedAt||company.status!=='ACTIVE')return res.status(403).json({error:'Empresa indisponível.'});
      if(req.path!==base+'/connections'&&(typeof req.query.promoterId!=='string'||!req.query.promoterId))return res.status(400).json({error:'Selecione a conexão autorizada.'});
      const promoter=req.path===base+'/connections'?{id:''}:await resolveBankPromoter(db,tenant,req.query.promoterId);
      const value=await withinJourneyDeadline(AbortSignal.timeout(45000),()=>run(req,{tenant,actor:'user:'+session.user.id,user:session.user.id,promoter:promoter.id}));
      return res.json(value);
    }catch(error){
      // Only our fixed messages are exposed; fetch/Prisma/provider bodies never reach the response.
      const message=error instanceof Error?error.message:'';
      if(message==='VCTEX_NOT_FOUND')return res.status(404).json({error:'Acompanhamento não encontrado nesta empresa e usuário.'});
      const unknown=/UNKNOWN|CLAIM_LOST/.test(message);
      return res.status(unknown?409:400).json({error:unknown?'Resultado VCTEX incerto. Atualize pelo ID; nenhuma solicitação será repetida.':/^(VCTEX|Gateway Oracle|Contrato do token|Conexão VCTEX|Aguarde autorização|Vínculo VCTEX|Oferta VCTEX|Prazo ou parcela|Revise os dados|Referência VCTEX|A pré-operação VCTEX|Operação VCTEX|Simulação VCTEX)/.test(message)?message:'Não foi possível concluir a operação VCTEX.',uncertain:unknown});
    }
  };
  app.get(base+'/connections',wrap('simulations.create',async(_req,c)=>{
    const rows=await db.promoter.findMany({where:{tenantId:c.tenant,status:'ATIVO'},select:{id:true,name:true}}),out=[];
    for(const p of rows){const config=await VctexBankService.config(db,c.tenant,p.id);if(config.enabled&&config.cpf&&config.password)out.push({id:p.id,name:p.name});}return out;
  }));
  app.get(base+'/config',wrap('integrations.manage',async(_req,c)=>VctexBankService.status(db,c.tenant,c.promoter)));
  app.put(base+'/config',wrap('integrations.manage',async(req,c)=>{
    const result=await VctexBankService.save(db,c.tenant,c.promoter,req.body||{});
    await AuditLogService.record(db,{tenantId:c.tenant,userId:c.user,action:'VCTEX_CONFIG_UPDATED',entity:'SystemConfig',entityId:c.promoter,newData:{enabled:result.enabled,environment:result.environment},req});return result;
  }));
  app.post(base+'/diagnostic',wrap('integrations.manage',async(_req,c)=>VctexBankService.diagnostic(db,c.tenant,c.promoter)));
  async function owned(req:any,c:{tenant:string;actor:string}){
    if(typeof req.body?.executionId!=='string'&&typeof req.query.executionId!=='string')throw Error('Execução obrigatória.');
    const executionId=req.body?.executionId||req.query.executionId;
    const entry=await journeys.get(db,c.tenant,c.actor,executionId);
    if(!entry?.snapshot.customer||entry.snapshot.historical||!['DONE','UNKNOWN'].includes(entry.record.phase)||!entry.snapshot.banks.some(b=>b.id==='vctex'))throw Error('VCTEX_NOT_FOUND');
    const customer=entry.snapshot.customer;
    return {executionId,request:entry.snapshot.results.vctex?.request,identity:{cpf:customer.cpf,name:customer.name,phone:customer.phone,email:customer.v8Email||''}};
  }
  app.post(base+'/start',wrap('simulations.create',async(req,c)=>{const own=await owned(req,c);const value=await VctexBankService.refresh(db,c.tenant,c.actor,c.promoter,own.identity,true);const journeyResult=await journeys.recordObservation(db,c.tenant,c.actor,own.executionId,own.identity.cpf,'vctex',vctexConsultationRows(value,c.promoter));return {...value,journeyResult};}));
  // Follow the stored ID, or recover an existing official ID by the owned CPF. Never create consent or a financial POST.
  app.get(base+'/observe',wrap('simulations.create',async(req,c)=>{const own=await owned(req,c);const value=await VctexBankService.refresh(db,c.tenant,c.actor,c.promoter,own.identity,false,true);const journeyResult=await journeys.recordObservation(db,c.tenant,c.actor,own.executionId,own.identity.cpf,'vctex',vctexConsultationRows(value,c.promoter));return {...value,journeyResult};}));
  app.get(base+'/rates',wrap('simulations.create',async(req,c)=>{const own=await owned(req,c);if(typeof req.query.employmentId!=='string')throw Error('Referência VCTEX inválida.');return VctexBankService.rates(db,c.tenant,c.actor,c.promoter,own.identity,req.query.employmentId);}));
  app.post(base+'/simulate',wrap('simulations.create',async(req,c)=>{
    const own=await owned(req,c),b=req.body||{};
    if(typeof b.employmentId!=='string'||typeof b.offerId!=='string'||b.term!==undefined&&typeof b.term!=='number'||b.installment!==undefined&&typeof b.installment!=='number')throw Error('Referência VCTEX inválida.');
    if(own.request?.value>0&&(b.installment!==own.request.value||own.request.term&&b.term!==own.request.term))throw Error('Simulação VCTEX não corresponde aos parâmetros atuais. Use Simular condições.');
    const quote=await VctexBankService.simulate(db,c.tenant,c.actor,c.promoter,own.identity,{employmentId:b.employmentId,offerId:b.offerId,term:b.term,installment:b.installment});
    // The server derives every financial field; the browser cannot inject offers into history.
    for(let attempt=0;attempt<3;attempt++){
      const entry=await journeys.get(db,c.tenant,c.actor,own.executionId);if(!entry)throw Error('Execução indisponível.');
      const old=entry.snapshot.results.vctex;
      if(old?.request?.mode==='Payment'&&old.request.value>0&&(b.installment!==old.request.value||quote.installment>old.request.value+0.005||old.request.term&&quote.term!==old.request.term))throw Error('Simulação VCTEX pertence a parâmetros anteriores. Recupere o acompanhamento atual.');
      entry.snapshot.results.vctex={...old,status:'RETURNED',stage:'RESULT',rows:[...(old?.rows||[]).filter(r=>r.simulationId!==quote.simulationId),{...quote,origin:{providerId:'vctex',connectionId:c.promoter,consultationId:quote.data.vctex.preOperationId,executionId:own.executionId}}]};
      try{await entry.store.compareAndSet(own.executionId,entry.raw,entry.record);return {quote};}catch{}
    }throw Error('VCTEX_RESULT_UNKNOWN');
  }));
}
