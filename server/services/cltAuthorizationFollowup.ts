import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {journeyFingerprint} from './cltJourneyStore.js';
import {V8CltPilot} from './v8CltPilot.js';
import type {CltJourneyService,JourneySnapshot,JourneyProvider} from './cltJourneyService.js';
const prefix='runtime:clt-followup:v1:';
type Task={actor:string;executionId:string;created:number;next:number;attempts:number};
function key(){const secret=process.env.JWT_SECRET||process.env.AUTH_SECRET;if(!secret)throw Error('FOLLOWUP_CRYPTO_UNAVAILABLE');return createHash('sha256').update('clt-followup:'+secret).digest();}
function seal(task:Task,tenant:string,id:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from(JSON.stringify([tenant,id])));const data=Buffer.concat([c.update(JSON.stringify(task)),c.final()]);return [iv,c.getAuthTag(),data].map(b=>b.toString('base64url')).join('.');}
function open(value:string,tenant:string,id:string):Task{const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64url')),c=createDecipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from(JSON.stringify([tenant,id])));c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(data),c.final()]).toString());}
export class CltAuthorizationFollowup {
  static pendingBank(snapshot:JourneySnapshot,bank:string){const rows=snapshot.results[bank]?.rows||[];return rows.some(r=>r.state!=='OFFER'&&r.outcome!=='INELIGIBLE'&&(r.outcome==='AUTHORIZATION_REQUIRED'||r.outcome==='PENDING'||r.state==='DATA'&&!rows.some(offer=>offer.state==='OFFER'&&offer.institution===r.institution)));}
  static pending(snapshot:JourneySnapshot){return ['v8','nossa'].some(bank=>this.pendingBank(snapshot,bank));}
  static async schedule(db:any,tenant:string,actor:string,snapshot:JourneySnapshot){
    if(!snapshot.automaticEnabled||!this.pending(snapshot))return;
    const executionId=snapshot.rootExecutionId||snapshot.executionId,configKey=prefix+journeyFingerprint([tenant,actor,executionId]);
    const task:Task={actor,executionId,created:Date.now(),next:Date.now()+60000,attempts:0};
    try{await db.systemConfig.create({data:{tenantId:tenant,configKey,configValue:seal(task,tenant,configKey),isSecret:true}});}catch(error){if((error as any)?.code!=='P2002')throw error;}
  }
  /** Existing authenticated daily cron is a persistent backstop, not an in-process timer. */
  static async run(db:any,service:CltJourneyService){
    const started=Date.now(),tasks=await db.systemConfig.findMany({where:{configKey:{startsWith:prefix}},orderBy:{updatedAt:'asc'},take:50});let checked=0;
    for(const row of tasks){
      if(Date.now()-started>18000)break;
      const tenant=row.tenantId;if(!tenant)continue;
      let task:Task;try{task=open(row.configValue,tenant,row.configKey);}catch{continue;}
      if(task.next>Date.now())continue;
      const remove=()=>db.systemConfig.deleteMany({where:{tenantId:tenant,configKey:row.configKey}});
      if(Date.now()-task.created>7*24*3600000||task.attempts>=8){await remove();continue;}
      const claimed={...task,attempts:task.attempts+1,next:Date.now()+60000};
      const value=seal(claimed,tenant,row.configKey);
      const claim=await db.systemConfig.updateMany({where:{tenantId:tenant,configKey:row.configKey,configValue:row.configValue},data:{configValue:value}});if(claim.count!==1)continue;
      try{
        const entry=await service.get(db,tenant,task.actor,task.executionId);
        if(!entry?.snapshot.customer||!entry.snapshot.automaticEnabled){await remove();continue;}
        // Revalidate active user, membership, company and simulation permission before every background read.
        const permit=await V8CltPilot.authorize(db,tenant,{...entry.snapshot.customer,bmgActorId:task.actor});
        if(!permit.allowed){await remove();continue;}
        const candidates=(['v8','nossa'] as JourneyProvider[]).filter(provider=>entry.snapshot.results[provider]&&entry.snapshot.results[provider].status!=='UNKNOWN'&&this.pendingBank(entry.snapshot,provider));
        const provider=candidates[task.attempts % Math.max(1,candidates.length)];
        if(provider){
          if(entry.snapshot.results[provider].readyToSimulate){
            const input={...entry.snapshot.customer,autoConditions:!entry.snapshot.customer.value};
            const next=await service.start(db,tenant,task.actor,randomUUID(),input,provider,'SIMULATE',task.executionId);
            await service.execute(db,tenant,task.actor,next,input,'SIMULATE',provider);
          } else await service.observe(db,tenant,task.actor,task.executionId,provider);
        }
        checked++;
        const current=await service.get(db,tenant,task.actor,task.executionId);
        if(!current||!this.pending(current.snapshot)){await remove();continue;}
      }catch{/* No payload/PII logs and no retry of writes; durable bank reservations remain authoritative. */}
      claimed.next=Date.now()+Math.min(3600000,60000*2**claimed.attempts);
      await db.systemConfig.updateMany({where:{tenantId:tenant,configKey:row.configKey,configValue:value},data:{configValue:seal(claimed,tenant,row.configKey)}});
      break; // One read OR one reserved calculation per invocation; never chain their deadlines.
    }
    return {checked};
  }
}
