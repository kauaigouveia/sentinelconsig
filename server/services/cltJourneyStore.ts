import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import type { JourneySnapshot } from './cltJourneyService.js';

export type JourneyRecord = { fingerprint: string; phase: 'READY' | 'RUNNING' | 'DONE' | 'UNKNOWN'; deadline: number; snapshot: JourneySnapshot };
const prefix = 'runtime:clt-journey:v1:';
function key() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw Error('JOURNEY_ENCRYPTION_UNAVAILABLE');
  return createHash('sha256').update(`sentinel:clt-journey:v1:${secret}`).digest();
}
function identity(tenant: string, actor: string, id: string) { return JSON.stringify([tenant, actor, id]); }
function configKey(actor: string, id: string) { return prefix + createHash('sha256').update(identity('', actor, id)).digest('hex'); }
export function journeyFingerprint(value: unknown) { return createHmac('sha256', key()).update(JSON.stringify(value)).digest('hex'); }
function seal(value: unknown, aad: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
function open(value: string, aad: string): JourneyRecord {
  const [iv, tag, data] = value.split('.').map(s => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv); decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString());
}

// SystemConfig's existing tenant/key unique constraint is the distributed reservation.
// No external operation is allowed until its RUNNING claim is committed.
export class CltJourneyStore {
  constructor(private db: any, private tenant: string, private actor: string) {}
  async remember(id: string) {
    const configKey=prefix+'history:'+journeyFingerprint(this.actor)+':'+journeyFingerprint(id);
    const data={tenantId:this.tenant,configKey,configValue:seal({id},identity(this.tenant,this.actor,configKey)),isSecret:true};
    await this.db.systemConfig.upsert({where:{tenantId_configKey:{tenantId:this.tenant,configKey}},create:data,update:{configValue:data.configValue,isSecret:true}});
  }
  async history() {
    const rows=await this.db.systemConfig.findMany({where:{tenantId:this.tenant,configKey:{startsWith:prefix+'history:'+journeyFingerprint(this.actor)+':'}},orderBy:{updatedAt:'desc'},take:30});
    const legacy=await this.db.systemConfig.findMany({where:{tenantId:this.tenant,configKey:{startsWith:prefix+'intent:'}},orderBy:{updatedAt:'desc'},take:200});
    const results:any[]=[],seen=new Set<string>();
    for(const row of [...rows,...legacy].sort((a,b)=>new Date(b.updatedAt||0).getTime()-new Date(a.updatedAt||0).getTime()))try{const value=open(row.configValue,identity(this.tenant,this.actor,row.configKey)) as unknown as {id:string};if(!value.id||seen.has(value.id))continue;const saved=await this.read(value.id);if(!saved?.record.snapshot.customer)continue;seen.add(value.id);results.push({executionId:saved.record.snapshot.executionId,updatedAt:row.updatedAt,phase:saved.record.phase,banks:saved.record.snapshot.banks.map(b=>b.name)});if(results.length>=30)break;}catch{/* Invalid or other-actor entries never disclose customer data. */}
    return results;
  }
  async read(id: string) {
    const row = await this.db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId: this.tenant, configKey: configKey(this.actor, id) } } });
    if (!row) return undefined;
    const value = open(row.configValue, identity(this.tenant, this.actor, id));
    const alias = (value as unknown as { alias?: string }).alias;
    if (alias) {
      const target = await this.db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId: this.tenant, configKey: configKey(this.actor, alias) } } });
      return target ? { raw: target.configValue as string, record: open(target.configValue, identity(this.tenant, this.actor, alias)) } : undefined;
    }
    return { raw: row.configValue as string, record: value };
  }
  async create(id: string, record: JourneyRecord) {
    const data = { tenantId: this.tenant, configKey: configKey(this.actor, id), configValue: seal(record, identity(this.tenant, this.actor, id)), isSecret: true };
    // Intent reservation also protects simultaneous tabs using different execution UUIDs.
    const intentKey = prefix + 'intent:' + journeyFingerprint([this.actor, record.fingerprint]);
    try {
      await this.db.$transaction(async (tx: any) => {
        await tx.systemConfig.create({ data: { ...data, configKey: intentKey, configValue: seal({ id }, identity(this.tenant, this.actor, intentKey)) } });
        await tx.systemConfig.create({ data });
      });
      return id;
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e;
      if (await this.read(id)) return id;
      const intent = await this.db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId: this.tenant, configKey: intentKey } } });
      if (!intent) throw e;
      const existingId = (open(intent.configValue, identity(this.tenant, this.actor, intentKey)) as unknown as { id: string }).id;
      const existing = await this.read(existingId);
      // Only an explicit later POST may start a fresh attempt after a completed window.
      // UNKNOWN/RUNNING reservations never expire into a bank retry.
      if (existing?.record.phase === 'DONE' && Date.now() - existing.record.deadline > 30000) {
        await this.db.$transaction(async (tx: any) => {
          const claim = await tx.systemConfig.updateMany({ where: { tenantId: this.tenant, configKey: intentKey, configValue: intent.configValue }, data: { configValue: seal({ id }, identity(this.tenant, this.actor, intentKey)) } });
          if (claim.count !== 1) throw Error('EXECUTION_CONFLICT');
          await tx.systemConfig.create({ data });
        });
        return id;
      }
      // Preserve the caller's UUID too: a lost first frame must not lose recovery.
      try { await this.db.systemConfig.create({ data: { ...data, configValue: seal({ alias: existingId }, identity(this.tenant, this.actor, id)) } }); }
      catch (aliasError: any) { if (aliasError?.code !== 'P2002') throw aliasError; }
      return existingId;
    }
  }
  async compareAndSet(id: string, raw: string, record: JourneyRecord) {
    const next = seal(record, identity(this.tenant, this.actor, id));
    const result = await this.db.systemConfig.updateMany({ where: { tenantId: this.tenant, configKey: configKey(this.actor, id), configValue: raw }, data: { configValue: next } });
    if (result.count !== 1) throw Error('EXECUTION_CLAIM_LOST');
    return next;
  }
}
