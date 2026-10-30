import {simulationPortabilityCheck} from '../../src/lib/portabilitySimulationPolicy.js';
import {portabilityRuleSources,portabilitySourceCatalog} from '../../src/lib/portabilityRuleSources.js';
import {decodeDaycoval} from './daycovalWorkbook.js';

export type RoutingRule={id:string;name:string;operations:string[];convenio:string;conditions:{installmentBelow:number;otherBanksBelowMinimum:true};bank:string;priority:number;tenantId:string;active:boolean;validFrom:string;validUntil?:string;version:number;internalReason:string};
export type RoutingCandidate={id:string;bank:string;enabled:boolean;configured:boolean;authorized:boolean;transport:'OFFICIAL_API'|'WORKBOOK'|'UNAVAILABLE';dataReady:boolean;idempotencyReady:boolean;minimumBalance?:number;check:{blocked:boolean;review:boolean;status:string;reason:string}};
export const routingKey='PORTABILITY_ROUTING_V1';
export const routingAuditAction='simulation.portability_routing';
export function routingAuditConstraint(canView:boolean,tenantId?:string|null){return canView&&tenantId?{OR:[{action:{not:routingAuditAction}},{action:routingAuditAction,tenantId}]}:{action:{not:routingAuditAction}};}
export function routingDiagnostic(row:{id:string;createdAt:unknown;newData:unknown}){
 let data:any={};try{const parsed=typeof row.newData==='string'?JSON.parse(row.newData):row.newData;data=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{/* Malformed history never becomes an unfiltered response. */}
 return {id:row.id,createdAt:row.createdAt,priority:typeof data.priorityId==='string'?data.priorityId:null,
  trace:(Array.isArray(data.trace)?data.trace:[]).filter(Boolean).slice(0,100).map((item:any)=>({code:item.code,bank:item.bank,ruleId:item.ruleId,version:item.version,reason:item.reason})),
  decisions:(Array.isArray(data.decisions)?data.decisions:[]).filter(Boolean).slice(0,100).map((item:any)=>({bank:item.bank,status:item.status,reason:item.reason}))};
}
export const defaultRoutingRule=(tenantId:string):RoutingRule=>({id:'daycoval-small-portability',name:'Daycoval · operações de baixo valor',operations:['PORT','PORT_REFIN'],convenio:'INSS',conditions:{installmentBelow:50,otherBanksBelowMinimum:true},bank:'daycoval',priority:10,tenantId,active:true,validFrom:'2026-10-30',version:1,internalReason:'Parcela inferior a R$ 50 e saldo abaixo dos mínimos dos demais destinos avaliáveis.'});
export function routingCandidate(bank:string,input:any,availability:Omit<RoutingCandidate,'bank'|'check'|'minimumBalance'>):RoutingCandidate{
 const check=simulationPortabilityCheck(bank,input),c=portabilityRuleSources(bank,String(input.originalBank||''),input.originCategory).criteria;
 const minimum=input.operation==='PORT'?(c.pureMinBalance??c.minBalance):c.minBalance;
 return {...availability,bank,check,minimumBalance:typeof minimum==='number'&&Number.isFinite(minimum)?minimum:undefined};
}
export function planPortabilityRouting(tenantId:string,input:any,candidates:RoutingCandidate[],rules:RoutingRule[],today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 const trace:{code:string;bank?:string;ruleId?:string;version?:number;reason?:string}[]=[];
 const validInput=input.product==='INSS'&&['PORT','PORT_REFIN'].includes(input.operation)&&
  [input.originalInstallment,input.debt].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0);
 if(!validInput)return {priorityId:null,trace:[{code:'NOT_APPLICABLE_OR_INCOMPLETE'}]};
 for(const rule of [...rules].sort((a,b)=>a.priority-b.priority)){
  if(rule.tenantId!==tenantId||!rule.active||rule.convenio!==input.product||!rule.operations.includes(input.operation)||today<rule.validFrom||rule.validUntil&&today>rule.validUntil)continue;
  if(!(input.originalInstallment<rule.conditions.installmentBelow))continue;
  const target=candidates.find(candidate=>candidate.bank===rule.bank);
  const blockers:string[]=[];
  if(!target||!target.enabled||!target.configured||!target.authorized)blockers.push('INTEGRATION_UNAVAILABLE');
  if(target?.transport!=='OFFICIAL_API')blockers.push('OFFICIAL_TRANSPORT_UNAVAILABLE');
  if(!target?.dataReady||!target.idempotencyReady)blockers.push('DATA_OR_IDEMPOTENCY_PENDING');
  if(target?.check.blocked)blockers.push('DOCUMENTARY_BLOCK');else if(target?.check.review)blockers.push('DOCUMENTARY_PENDING');
  if(blockers.length||!target){trace.push(...blockers.map(code=>({code,bank:rule.bank,ruleId:rule.id,version:rule.version})));continue;}
  const others=candidates.filter(candidate=>candidate.id!==target.id&&candidate.enabled&&candidate.configured&&candidate.authorized);
  // Unknown minima, a zero minimum or an eligible alternative must never be discarded to favor Daycoval.
  if(!others.length||others.some(candidate=>candidate.check.review||candidate.minimumBalance===undefined||candidate.minimumBalance<=0||input.debt>=candidate.minimumBalance||!candidate.check.blocked)){
   trace.push({code:'OTHER_DESTINATIONS_NOT_EXCLUDED_BY_BALANCE',bank:rule.bank,ruleId:rule.id,version:rule.version});continue;
  }
  trace.push({code:'PRIORITY_SELECTED',bank:rule.bank,ruleId:rule.id,version:rule.version,reason:rule.internalReason});return {priorityId:target.id,trace};
 }
 return {priorityId:null,trace};
}
export async function executeRoutingJobs(jobs:{id:string;run:()=>Promise<void>}[],priorityId:string|null){
 const unique=[...new Map(jobs.map(job=>[job.id,job])).values()];
 const priority=unique.find(job=>job.id===priorityId);
 const outcomes:{id:string;status:string}[]=[];
 const run=async(job:typeof unique[number])=>{try{await job.run();outcomes.push({id:job.id,status:'COMPLETED'});}catch{outcomes.push({id:job.id,status:'FAILED'});}};
 if(priority)await run(priority);
 await Promise.all(unique.filter(job=>job!==priority).map(run));return outcomes;
}
export async function existingPortabilityPlan(db:any,tenantId:string,input:any){
 let rules=[defaultRoutingRule(tenantId)];
 const row=await db.systemConfig.findUnique({where:{tenantId_configKey:{tenantId,configKey:routingKey}}});
 if(row){const value=JSON.parse(row.configValue);if(!Array.isArray(value)||!value.every(rule=>rule&&rule.tenantId===tenantId&&typeof rule.active==='boolean'&&Array.isArray(rule.operations)&&rule.operations.every((v:any)=>['PORT','PORT_REFIN'].includes(v))&&rule.convenio==='INSS'&&portabilitySourceCatalog.some(bank=>bank.id===rule.bank)&&Number.isFinite(rule.priority)&&Number.isInteger(rule.version)&&rule.version>0&&typeof rule.id==='string'&&typeof rule.name==='string'&&typeof rule.internalReason==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(rule.validFrom)&&(!rule.validUntil||/^\d{4}-\d{2}-\d{2}$/.test(rule.validUntil))&&Number.isFinite(rule.conditions?.installmentBelow)&&rule.conditions.installmentBelow>0&&rule.conditions?.otherBanksBelowMinimum===true))throw Error('PORTABILITY_ROUTING_INVALID');rules=value;}
 // The existing Daycoval route is a workbook calculator. A browser/config flag cannot turn it into an official API.
 const workbook=await db.systemConfig.findUnique({where:{tenantId_configKey:{tenantId,configKey:'DAYCOVAL_INSS_WORKBOOK_V1'}}});
 const book=workbook?decodeDaycoval(workbook.configValue):null;
 const candidate=routingCandidate('daycoval',input,{id:'daycoval-workbook',enabled:!!book&&book.enabled!==false,configured:!!book,authorized:!!book,transport:'WORKBOOK',dataReady:false,idempotencyReady:false});
 return planPortabilityRouting(tenantId,input,[candidate],rules);
}
/** Public DTO for offers: internal selection criteria never travel to the partner. */
export function publicPortabilityRows(rows:any[],estimated=false){return rows.filter(row=>row.state==='OFFER'||row.state===undefined&&Number.isFinite(row.amount)&&row.amount>0&&!!(row.provider||row.institution)).map(row=>({...Object.fromEntries(['provider','institution','code','name','table','state','amount','contractAmount','installment','term','rate','portabilityCode'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]])),state:'OFFER',quoteKind:estimated||row.quoteKind==='ESTIMATE'||row.spreadsheet||row.spreadsheetVersion?'ESTIMATE':'BANK'}));}
