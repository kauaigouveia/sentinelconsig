import {randomUUID} from 'node:crypto';
import {Prisma, PrismaClient, StandardStatusCategory} from '@prisma/client';
import {isValidCpf} from '../../src/lib/utils.js';
import {AuditLogService} from './auditLogService.js';

const norm=(x:unknown)=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
const nameKey=(x:unknown)=>norm(x).replace(/^EVOLVE\s*-\s*/,'');
const bankAliases:Record<string,string>={'BANCO DAYCOVAL S.A.':'DAYCOVAL','FACTA FINANCEIRA S.A':'FACTA FINANCEIRA','BANCO CREFISA S.A.':'CREFISA','BRB - BANCO DE BRASILIA':'BRB','ICRED - CREDITO INTELIGENTE':'ICRED'};
export const inboundBankKey=(s:string)=>bankAliases[norm(s)]||norm(s);
export function inboundCategory(s:string):StandardStatusCategory|null {
 const v=norm(s);
 if(['CONCRETIZADO','PAGO C/PENDENCIA','PAGO'].includes(v))return 'PAGO';
 if(['CANCELADA','CANCELADO'].includes(v))return 'CANCELADO';
 if(['REPROVADO','RECUSADO'].includes(v))return 'RECUSADO';
 if(['CR CLIENTE','PENDENTE','CRC C/ PENDENCIA'].includes(v))return 'PENDENTE';
 if(['ANALISE BANCO','ANALISE NA EMPRESA','AUTORREGULACAO'].includes(v))return 'ANDAMENTO';
 return null;
}
type Row={line:number;id:string;cpf:string;clientName:string;partner:string;producer:string;bank:string;modality:string;convenio:string;status:string;created:string;gross:number;net:number;installment:number;term:number;debt:number|null;commissionRate:number|null;portabilityProposalNumber?:string};
type Batch={version:1;mode:'preview'|'apply';hash:string;offset:number;rows:unknown[]};
type Result={eligible:number;created:number;existing:number;conflicts:number;invalid:number;reasons:Record<string,number>};
const isText=(x:unknown,max:number):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=max&&!/[\x00-\x1f\x7f]/.test(x)&&!/^([=+@]|-\s*[A-Z])/i.test(x.trim());
const amount=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=9999999999.99;
const optionalAmount=(v:unknown)=>v===null||amount(v);
export function validateInboundBatch(x:any):x is Batch{
 return x?.version===1&&['preview','apply'].includes(x.mode)&&typeof x.hash==='string'&&/^[a-f0-9]{64}$/.test(x.hash)&&Number.isInteger(x.offset)&&x.offset>=0&&x.offset<50000&&Array.isArray(x.rows)&&x.rows.length>0&&x.rows.length<=250;
}
export function rowIssue(x:any):string|null{
 if(!x||typeof x!=='object'||Array.isArray(x))return 'Registro inválido';
 if(!isText(x.id,150)||!isText(x.partner,100)||!isText(x.producer,250)||!isText(x.clientName,250))return 'Identificação incompleta';
 if(x.portabilityProposalNumber!==undefined&&!isText(x.portabilityProposalNumber,150))return 'Vínculo de portabilidade inválido';
 if(typeof x.cpf!=='string'||!/^\d{11}$/.test(x.cpf)||!isValidCpf(x.cpf))return 'CPF inválido';
 if(!isText(x.bank,250)||!isText(x.modality,100)||!isText(x.convenio,150)||!isText(x.status,150))return 'Catálogo ou situação ausente';
 if(typeof x.created!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(x.created)||!Number.isFinite(Date.parse(x.created+'T00:00:00Z'))||new Date(x.created+'T00:00:00Z').toISOString().slice(0,10)!==x.created||x.created>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Maceio',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))return 'Data inválida';
 if(!amount(x.gross)||!amount(x.net)||!amount(x.installment)||!Number.isInteger(x.term)||x.term<1||x.term>600||!optionalAmount(x.debt)||!(x.commissionRate===null||(amount(x.commissionRate)&&x.commissionRate<=100)))return 'Condições financeiras incompletas ou inválidas';
 return null;
}
type Partner={id:string;code:string;name:string;deletedAt:Date|null;status:string;promoterId:string|null};
export function resolveInboundPartner<T extends Partner>(list:T[],code:string,name:string):{match:T|null;conflict:boolean}{
 const n=nameKey(name);if(!n)return {match:null,conflict:true};
 const candidates=list.filter(p=>nameKey(p.name)===n);
 if(candidates.length===1){const p=candidates[0];return {match:!p.deletedAt&&p.status==='ATIVO'?p:null,conflict:!!p.deletedAt||p.status!=='ATIVO'};}
 if(candidates.length>1)return {match:null,conflict:true};
 // The code is only a uniqueness guard when creating a NEW partner, never a match criterion.
 return {match:null,conflict:list.some(p=>norm(p.code)===norm(code))};
}
export async function processInbound(prisma:PrismaClient,tenantId:string,batch:Batch):Promise<Result>{
 return prisma.$transaction(async tx=>{
  if(batch.mode==='apply')await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))','bi_extractor_'+tenantId);
  const tenant=await tx.tenant.findFirst({where:{id:tenantId,status:'ACTIVE',deletedAt:null},select:{maxProposals:true}});
  if(!tenant)throw Error('Empresa indisponível');
  const result:Result={eligible:0,created:0,existing:0,conflicts:0,invalid:0,reasons:{}};
  const mark=(k:'conflicts'|'invalid',reason:string)=>{result[k]++;result.reasons[reason]=(result.reasons[reason]||0)+1;};
  const checked:Row[]=[];const seen=new Map<string,number>();
  for(const x of batch.rows){const issue=rowIssue(x);if(issue){mark('invalid',issue);continue;}const r=x as Row;checked.push(r);const k=norm(r.id);seen.set(k,(seen.get(k)||0)+1);}
  const validIds=checked.map(r=>r.id),cpfs=[...new Set(checked.map(r=>r.cpf))];
  const linkedNumbers=[...new Set(checked.flatMap(r=>r.portabilityProposalNumber?[r.portabilityProposalNumber]:[]))];
  const [banks,partners,products,convenios,statuses,promoters,bankPromoters,existing,clients,activeCount,linkedPorts]=await Promise.all([
   tx.bank.findMany({where:{tenantId,status:'ATIVO'},select:{id:true,name:true}}),
   tx.partner.findMany({where:{tenantId},select:{id:true,code:true,name:true,deletedAt:true,status:true,promoterId:true}}),
   tx.product.findMany({where:{active:true,OR:[{tenantId},{tenantId:null,scope:'GLOBAL'}]},select:{id:true,name:true,type:true,convenioIds:true,requiresPortabilityRelation:true}}),
   tx.convenio.findMany({where:{active:true,OR:[{tenantId},{tenantId:null,scope:'GLOBAL'}]},select:{id:true,name:true,code:true}}),
   tx.proposalStatus.findMany({where:{tenantId,active:true},select:{id:true,name:true,standardCategory:true}}),
   tx.promoter.findMany({where:{tenantId,status:'ATIVO'},select:{id:true}}),
   tx.bankPromoter.findMany({where:{tenantId,status:'ATIVO'},select:{bankId:true,promoterId:true}}),
   tx.proposal.findMany({where:{tenantId,proposalNumber:{in:validIds,mode:'insensitive'}},select:{id:true,proposalNumber:true,deletedAt:true,contractValue:true,releasedValue:true,installmentValue:true,installmentsCount:true,standardCategory:true,type:true,relatedPortabilityId:true,client:{select:{tenantId:true,cpf:true,deletedAt:true}},partner:{select:{tenantId:true,code:true,deletedAt:true}},bank:{select:{tenantId:true,name:true}}}}),
   tx.client.findMany({where:{tenantId,cpf:{in:cpfs}},select:{id:true,cpf:true,fullName:true,deletedAt:true}}),
   tx.proposal.count({where:{tenantId,deletedAt:null}}),
   tx.proposal.findMany({where:{tenantId,deletedAt:null,type:'PORTABILIDADE',proposalNumber:{in:linkedNumbers,mode:'insensitive'}},select:{id:true,proposalNumber:true,bankId:true,partnerId:true,createdAt:true,client:{select:{tenantId:true,cpf:true,deletedAt:true}}}})
  ]);
  const pendingPartners:Prisma.PartnerCreateManyInput[]=[],pendingClients:Prisma.ClientCreateManyInput[]=[],pendingProposals:Prisma.ProposalCreateManyInput[]=[],pendingHistory:Prisma.StatusHistoryCreateManyInput[]=[];
  const partnerList:Partner[]=[...partners];const clientMap=new Map(clients.map(c=>[c.cpf,c]));
  const exact=(v:unknown,w:unknown)=>norm(v)===norm(w);
  for(const r of checked){
   if((seen.get(norm(r.id))||0)>1){mark('conflicts','Proposta repetida no lote');continue;}
   const cat=inboundCategory(r.status);
   if(!cat){mark('conflicts','Situação sem equivalência segura');continue;}
   const bankMatch=banks.filter(b=>exact(inboundBankKey(b.name),inboundBankKey(r.bank)));
   if(bankMatch.length!==1){mark('conflicts','Banco não identificado ou ambíguo');continue;}
   const bank=bankMatch[0];
   const prodMatch=products.filter(p=>exact(p.name,r.modality));
   if(prodMatch.length!==1){mark('conflicts','Modalidade não identificada ou ambígua');continue;}
   const product=prodMatch[0];
   const convMatch=convenios.filter(c=>exact(c.name,r.convenio)||exact(c.code,r.convenio));
   if(convMatch.length!==1){mark('conflicts','Convênio não identificado ou ambíguo');continue;}
   const convenio=convMatch[0];
   if(product.convenioIds.length&&!product.convenioIds.includes(convenio.id)){mark('conflicts','Produto incompatível com convênio');continue;}
   const p=resolveInboundPartner(partnerList,r.partner,r.producer);
   if(p.conflict){mark('conflicts','Nome do parceiro ambíguo, inativo ou código ocupado para novo cadastro');continue;}
   const local=existing.filter(x=>exact(x.proposalNumber,r.id));
   if(local.length){
    const x=local[0];
    if(local.length!==1||x.deletedAt||x.client.tenantId!==tenantId||x.client.deletedAt||x.client.cpf!==r.cpf||!p.match||x.partner?.tenantId!==tenantId||x.partner.deletedAt||!exact(x.partner.code,p.match.code)||x.bank?.tenantId!==tenantId||!exact(inboundBankKey(x.bank.name),inboundBankKey(bank.name))||x.standardCategory!==cat||x.type!==product.type||(r.portabilityProposalNumber!==undefined&&!linkedPorts.some(port=>port.id===x.relatedPortabilityId&&exact(port.proposalNumber,r.portabilityProposalNumber)))||Math.abs(Number(x.contractValue)-r.gross)>0.005||Math.abs(Number(x.releasedValue)-r.net)>0.005||Math.abs(Number(x.installmentValue)-r.installment)>0.005||x.installmentsCount!==r.term){mark('conflicts','Proposta existente com divergência; preservada');}
    else result.existing++;
    continue;
   }
   let relatedPortabilityId:string|null=null;
   if(product.requiresPortabilityRelation){
    if(!r.portabilityProposalNumber){mark('conflicts','Refinanciamento exige vínculo de portabilidade');continue;}
    const matching=linkedPorts.filter(x=>exact(x.proposalNumber,r.portabilityProposalNumber)&&x.client.tenantId===tenantId&&!x.client.deletedAt&&x.client.cpf===r.cpf&&x.bankId===bank.id&&p.match&&x.partnerId===p.match.id&&x.createdAt<=new Date(r.created+'T23:59:59-03:00'));
    if(matching.length!==1){mark('conflicts','Portabilidade selecionada ainda não importada ou incompatível');continue;}
    relatedPortabilityId=matching[0].id;
   }else if(r.portabilityProposalNumber){mark('conflicts','Vínculo não permitido para esta modalidade');continue;}
   const oldClient=clientMap.get(r.cpf);
   if(oldClient&&(oldClient.deletedAt||!exact(oldClient.fullName,r.clientName))){mark('conflicts','Cliente existente com divergência; preservado');continue;}
   if(activeCount+pendingProposals.length>=tenant.maxProposals){mark('conflicts','Limite do plano');continue;}
   let partner=p.match;
   if(!partner){partner={id:randomUUID(),code:r.partner.trim(),name:r.producer.trim(),status:'ATIVO',deletedAt:null,promoterId:null};partnerList.push(partner);pendingPartners.push({id:partner.id,tenantId,code:partner.code,name:partner.name,status:'ATIVO'});}
   const promoterId=partner.promoterId&&promoters.some(t=>t.id===partner!.promoterId)&&bankPromoters.some(t=>t.bankId===bank.id&&t.promoterId===partner!.promoterId)?partner.promoterId:null;
   let client=oldClient;
   if(!client){client={id:randomUUID(),cpf:r.cpf,fullName:r.clientName.trim(),deletedAt:null};clientMap.set(r.cpf,client);pendingClients.push({id:client.id,tenantId,cpf:client.cpf,fullName:client.fullName});}
   const exactStatus=statuses.filter(s=>s.standardCategory===cat&&exact(s.name,r.status));
   const categoryStatuses=statuses.filter(s=>s.standardCategory===cat);
   const statusId=exactStatus.length===1?exactStatus[0].id:categoryStatuses.length===1?categoryStatuses[0].id:null;
   const id=randomUUID();
   pendingProposals.push({id,tenantId,proposalNumber:r.id.trim(),clientId:client.id,partnerId:partner.id,bankId:bank.id,promoterId,productId:product.id,convenioId:convenio.id,type:product.type,relatedPortabilityId,statusId,standardCategory:cat,contractValue:r.gross,releasedValue:r.net,installmentValue:r.installment,installmentsCount:r.term,debtBalance:r.debt,commissionRate:r.commissionRate,createdAt:new Date(r.created+'T00:00:00-03:00')});
   pendingHistory.push({tenantId,proposalId:id,statusId,statusName:r.status,notes:relatedPortabilityId?'Situação original informada pelo extrator; portabilidade selecionada manualmente pelo gestor no BI.':'Situação original informada pelo extrator de produção.'});
   if(batch.mode==='preview')result.eligible++;else result.created++;
  }
  if(batch.mode==='apply'){
   if(pendingPartners.length)await tx.partner.createMany({data:pendingPartners});
   if(pendingClients.length)await tx.client.createMany({data:pendingClients});
   if(pendingProposals.length)await tx.proposal.createMany({data:pendingProposals});
   if(pendingHistory.length)await tx.statusHistory.createMany({data:pendingHistory});
   await AuditLogService.recordBatch(tx,[{tenantId,action:'BI_EXTRACTOR_IMPORT',entity:'Proposal',newData:{hash:batch.hash,offset:batch.offset,created:result.created,existing:result.existing,invalid:result.invalid,conflicts:result.conflicts,reasons:result.reasons,partners:pendingPartners.length,clients:pendingClients.length}}]);
  }
  return result;
 },{timeout:20000,isolationLevel:batch.mode==='apply'?Prisma.TransactionIsolationLevel.Serializable:Prisma.TransactionIsolationLevel.RepeatableRead});
}
