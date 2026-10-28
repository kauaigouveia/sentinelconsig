import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from './cltJourneyStore.js';
import { currentIntegrationPromoter } from './bankPromoterConfig.js';

/** Existing encrypted SystemConfig reservation, shared across instances; never a memory lock. */
export async function cltBankOnce<T>(db: any, tenant: string, provider: string, intent: unknown, execute?: () => Promise<T>, authorization?:{root:string;confirmedMissing:boolean}): Promise<T> {
  const id = 'clt-bank:' + journeyFingerprint([provider, currentIntegrationPromoter() || null, intent]);
  const store = new CltJourneyStore(db, tenant, 'bank:clt:' + provider);
  const prior = await store.read(id);
  type BankRecord=JourneyRecord & {result?:T;completedAt?:string;authorizationRoot?:string};
  const previous=prior?.record as BankRecord|undefined;
  // This 30s window is duplicate suppression, NOT a bank authorization validity rule.
  // Only a new explicitly started case plus current bank evidence of absence can renew a successful request.
  // UNKNOWN/RUNNING is never released this way.
  const renew=!!(previous?.phase==='DONE'&&authorization?.confirmedMissing&&previous.authorizationRoot&&authorization.root!==previous.authorizationRoot&&previous.completedAt&&Date.now()-Date.parse(previous.completedAt)>=30000);
  if (previous?.phase === 'DONE'&&!renew) {
    const result:any=structuredClone(previous.result);
    if(result&&typeof result==='object'&&!Array.isArray(result)){
      result.operationCached=true;result.operationCalculatedAt=previous.completedAt;
      if(Array.isArray(result.rows))result.rows=result.rows.map((row:any)=>({...row,data:{...row.data,operationCache:{cached:true,calculatedAt:previous.completedAt}}}));
    }
    return result;
  }
  if (prior&&!renew || !execute) throw Object.assign(Error('Resultado incerto. Confira o acompanhamento; nenhuma solicitação será repetida automaticamente.'),{writeUncertain:true});
  const record: BankRecord = { fingerprint: id, phase: 'READY', deadline: Date.now() + 50000, authorizationRoot:authorization?.root, snapshot: { executionId: id, running: true, banks: [], results: {} } };
  if(!renew)await store.create(id, record);
  const saved = renew?prior:await store.read(id);
  if (!saved || !renew&&saved.record.phase !== 'READY') throw Object.assign(Error('CLT_OPERATION_UNCERTAIN'),{writeUncertain:true});
  record.phase = 'RUNNING'; let raw:string;try{raw=await store.compareAndSet(id,saved.raw,record);}catch{throw Object.assign(Error('Reserva concorrente. Atualize o acompanhamento antes de outra operação.'),{writeUncertain:true});}
  try { const result = await execute(); record.result = result; record.phase = 'DONE';record.completedAt=new Date().toISOString(); record.snapshot.running = false; await store.compareAndSet(id, raw, record); return result; }
  catch (error) { record.phase = 'UNKNOWN'; record.snapshot.running = false; await store.compareAndSet(id, raw, record).catch(() => {}); throw Object.assign(error instanceof Error?error:Error('Resultado incerto.'),{writeUncertain:true}); }
}
export const missingCltAuthorization = (message: unknown) => typeof message === 'string' && /autoriz[aãçc].*(n[aã]o encontrad|inexistent|expirad)|n[aã]o.*autoriz[aãçc].*encontrad|\/solicita-autorizacao-consulta/i.test(message);
export async function reserveCltSms(db: any, tenant: string, actor: string) {
  const bucket = Math.floor(Date.now() / 900000), id = 'sms-quota:' + journeyFingerprint([actor,bucket]);
  const store = new CltJourneyStore(db,tenant,'bank:clt:bmg-quota');
  await store.create(id,{fingerprint:id,phase:'DONE',deadline:(bucket+1)*900000,snapshot:{executionId:id,running:false,banks:[],results:{}}});
  for(let attempt=0;attempt<6;attempt++) {const saved=(await store.read(id))!;const record=saved.record as JourneyRecord & {count?:number};if((record.count||0)>=5)throw Error('Limite de cinco solicitações SMS em 15 minutos. Aguarde antes de solicitar outro código.');record.count=(record.count||0)+1;try{await store.compareAndSet(id,saved.raw,record);return;}catch{}}
  throw Error('Solicitações SMS concorrentes. Aguarde e confira o acompanhamento.');
}
