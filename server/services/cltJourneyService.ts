import {CltAuthorizationFollowup} from './cltAuthorizationFollowup.js';
import {uniqueV8Reference,v8References} from '../../src/lib/cltV8Selection.js';
import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from './cltJourneyStore.js';
import { withinJourneyDeadline } from './cltJourneyDeadline.js';
import { ProductSimulationService, type ProductSimulationInput, type ProductSimulationRow } from './productSimulationService.js';
import { NossaFintechService } from './nossaFintechService.js';
import { FactaBankService } from './factaBankService.js';
import { BmgBankService } from './bmgBankService.js';
import { V8BankService } from './v8BankService.js';
import { ParanaBankService } from './paranaBankService.js';
import { PresencaBankService } from './presencaBankService.js';
import { integrationConfigStore } from './bankPromoterConfig.js';
import { cltPublicMessage } from '../../src/lib/cltSimulationOutcome.js';
import { cltBankOnce } from './cltBankOperation.js';
import { VctexBankService } from './vctexBankService.js';
import { cltPaymentLimit } from './cltFinancialPolicy.js';

export const journeyProviders = ['nossa', 'finanto', 'facta', 'bmg', 'v8', 'parana', 'presenca', 'happy', 'vctex'] as const;
// Legacy identifiers remain readable in history, but cannot start or resume bank operations.
export const activeJourneyProviders = journeyProviders.filter(id => id !== 'finanto');
export type JourneyProvider = typeof journeyProviders[number];
export type JourneyAction = 'REFRESH' | 'SIMULATE' | 'AUTHORIZE' | 'CREATE_CONSULT';
export type JourneyBank = { id: JourneyProvider; name: string; contextual?: boolean; error?: boolean };
export type JourneyCalculation = Pick<ProductSimulationInput,'value'|'term'|'mode'|'employerDocument'|'factaRegistration'|'v8ConsultId'|'v8PromoterId'|'calculationKey'> & {requestedAt:string};
export type JourneySnapshot = { calculation?:{value:number;term:number;mode:'Payment'|'Liquid';requestedAt:string;banks:string[];sourceExecutionId:string}; executionId: string; running: boolean; rootExecutionId?: string; automaticEnabled?: boolean; observedAt?: string; customer?: ProductSimulationInput; banks: JourneyBank[]; results: Record<string, { request?:JourneyCalculation; status: 'QUERYING' | 'RETURNED' | 'ERROR' | 'CONTEXTUAL' | 'UNKNOWN'; stage?: 'CONSULTATION' | 'CONSENT' | 'MARGIN' | 'SIMULATION' | 'RESULT'; rows: ProductSimulationRow[]; message?: string; readyToSimulate?: boolean; readyKey?: string; contractPending?: boolean; executionId?: string }> };
type Entry = { raw: string; record: JourneyRecord; snapshot: JourneySnapshot; store: CltJourneyStore; listeners: Set<(snapshot: JourneySnapshot) => void> };

export class CltJourneyService {
  async syncRoot(db:any,tenant:string,actor:string,snapshot:JourneySnapshot,provider:JourneyProvider){
    if(!snapshot.rootExecutionId||snapshot.rootExecutionId===snapshot.executionId)return;
    for(let attempt=0;attempt<4;attempt++){const root=await this.get(db,tenant,actor,snapshot.rootExecutionId);if(!root||root.snapshot.customer?.cpf!==snapshot.customer?.cpf||root.record.phase==='RUNNING')return;root.snapshot.results[provider]=structuredClone(snapshot.results[provider]);root.record.phase=Object.values(root.snapshot.results).some(r=>r.status==='UNKNOWN')?'UNKNOWN':'DONE';try{await root.store.compareAndSet(snapshot.rootExecutionId,root.raw,root.record);await root.store.remember(snapshot.rootExecutionId);return;}catch{}}
    throw Error('A consolidação do acompanhamento está concorrente. Recupere a execução registrada.');
  }
  async bindProvider(db:any,tenant:string,actor:string,id:unknown,cpf:string){
    if(typeof id!=='string')throw Error('Execução inválida.');const entry=await this.get(db,tenant,actor,id);
    if(!entry||entry.snapshot.customer?.cpf!==cpf||!['DONE','UNKNOWN'].includes(entry.record.phase))throw Error('Execução indisponível para este cliente, usuário ou empresa.');return entry;
  }
  async recordProvider(db:any,tenant:string,actor:string,id:string,cpf:string,provider:JourneyProvider,rows:ProductSimulationRow[]){
    for(let attempt=0;attempt<3;attempt++){const entry=await this.bindProvider(db,tenant,actor,id,cpf),old=entry.snapshot.results[provider];if(!old)throw Error('Instituição não vinculada à execução.');if(old.request?.value&&old.executionId!==id&&rows.some(r=>r.state==='OFFER'))throw Error('A condição pertence a uma execução anterior. Recupere o acompanhamento atual.');if(old.request?.mode==='Payment'&&old.request.value>0&&rows.some(r=>r.state==='OFFER'&&(!(r.installment!>0)||r.installment!>old.request!.value+0.005||old.request!.term&&r.term!==old.request!.term)))throw Error('A condição pertence a parâmetros anteriores. Recupere o acompanhamento atual.');entry.snapshot.results[provider]={...old,status:'RETURNED',stage:'RESULT',readyToSimulate:false,rows:[...old.rows.filter(r=>r.state!=='OFFER'),...rows.map(row=>projectRow(row,provider,id))]};entry.record.phase=Object.values(entry.snapshot.results).some(r=>r.status==='UNKNOWN')?'UNKNOWN':'DONE';try{await entry.store.compareAndSet(id,entry.raw,entry.record);await entry.store.remember(id);await this.syncRoot(db,tenant,actor,entry.snapshot,provider);return;}catch{}}
    throw Error('Resultado bancário preservado na reserva. Recupere o acompanhamento antes de solicitar novamente.');
  }
  async history(db:any,tenant:string,actor:string){return new CltJourneyStore(db,tenant,actor).history();}
  async observe(db:any,tenant:string,actor:string,id:string,provider?:JourneyProvider,manual=false) {
    if(provider==='finanto')return undefined;
    const entry=await this.get(db,tenant,actor,id);if(!entry?.snapshot.customer)return undefined;
    if(['READY','RUNNING'].includes(entry.record.phase))return entry.snapshot;
    if(entry.snapshot.rootExecutionId&&entry.snapshot.rootExecutionId!==id){const root=await this.get(db,tenant,actor,entry.snapshot.rootExecutionId);if(root?.snapshot.customer?.cpf===entry.snapshot.customer.cpf)entry.snapshot.results={...entry.snapshot.results,...root.snapshot.results};}
    const record=entry.record as JourneyRecord & {observingUntil?:number;observeAfter?:number};
    if((record.observingUntil||0)>Date.now()||(!manual&&(record.observeAfter||0)>Date.now()))return entry.snapshot;
    record.observingUntil=Date.now()+30000;
    try{entry.raw=await entry.store.compareAndSet(id,entry.raw,record);}catch{return(await this.get(db,tenant,actor,id))?.snapshot;}
    try {
      await withinJourneyDeadline(AbortSignal.timeout(25000),async()=>{
        const banks=entry.snapshot.banks.filter(bank=>bank.id!=='finanto'&&(!bank.contextual||provider==='vctex'&&bank.id==='vctex')&&(!provider||provider===bank.id));
        for(let offset=0;offset<banks.length;offset+=3)await Promise.all(banks.slice(offset,offset+3).map(async bank=>{
          const old=entry.snapshot.results[bank.id];
          if(!provider&&old.rows.length&&old.rows.every(r=>r.outcome==='INELIGIBLE'||r.outcome==='UNSUPPORTED'))return;
          if(!provider&&old.rows.some(r=>r.state==='OFFER')&&!old.rows.some(r=>r.outcome==='AUTHORIZATION_REQUIRED'||r.outcome==='PENDING'||r.outcome==='TECHNICAL_ERROR'))return;
          try {
            const input={...entry.snapshot.customer!,...old.request,bmgActorId:actor,journeyId:entry.snapshot.rootExecutionId||id,observeOnly:true,automaticAuthorization:false};
            if(!['v8','vctex'].includes(bank.id)){delete input.v8BirthDate;delete input.v8Email;delete input.v8Gender;}
            const response=await ProductSimulationService.run(db,tenant,'CLT','REFRESH',input,undefined,[bank.id]);
            const rows=response.rows.map(row=>projectRow(row,bank.id,entry.snapshot.executionId));
            const unsupported=rows.some(r=>(r.data as any)?.trackingUnsupported);
            if(unsupported&&old.rows.length&&old.rows.every(r=>r.outcome==='INELIGIBLE')){entry.snapshot.results[bank.id]={...old,message:'Inelegibilidade preservada. Não há endpoint de leitura de acompanhamento confirmado para esta integração.'};return;}
            entry.snapshot.results[bank.id]={...old,rows:[...old.rows.filter(r=>(r.state==='OFFER'&&!rows.some(n=>n.institution===r.institution&&n.outcome==='INELIGIBLE'))||(unsupported&&(r.link||r.outcome==='INELIGIBLE'))),...rows],status:old.status==='UNKNOWN'?'UNKNOWN':'RETURNED',message:unsupported?rows[0]?.message:undefined,readyToSimulate:(old.status!=='UNKNOWN'||bank.id==='nossa')&&mayCalculate(bank.id,rows),readyKey:calculationKey(rows)};
          }catch {entry.snapshot.results[bank.id]={...old,message:'Não foi possível atualizar o estado deste banco. Nenhuma solicitação foi reenviada.'};}
        }));
      });
      bindV8(entry.snapshot);
      entry.snapshot.observedAt=new Date().toISOString();
    } finally {record.observingUntil=0;record.observeAfter=Date.now()+10000;await entry.store.compareAndSet(id,entry.raw,record);}
    return entry.snapshot;
  }
  async refreshV8(db: any, tenant: string, actor: string, id: string, consultId: string, promoterId: string) {
    const entry = await this.get(db, tenant, actor, id);
    const own = entry?.snapshot.results.v8?.rows.some(row => (row.data as any)?.v8?.consultId === consultId && (row.data as any)?.v8?.promoterId === promoterId);
    if (!entry || !['DONE','UNKNOWN'].includes(entry.record.phase) || !entry.snapshot.customer || !own) return undefined;
    // Observation only: this endpoint never invokes SIMULATE or AUTHORIZE.
    const response = await withinJourneyDeadline(AbortSignal.timeout(25000), () => ProductSimulationService.run(db, tenant, 'CLT', 'REFRESH', { ...entry.snapshot.customer!, v8ConsultId: consultId, v8PromoterId: promoterId, bmgActorId: actor }, undefined, ['v8']));
    if (response.rows.some(row => row.state === 'ERROR' && (row.data as any)?.v8?.status !== 'FAILED')) throw Error('V8_STATUS_UNAVAILABLE');
    entry.snapshot.results.v8 = { ...entry.snapshot.results.v8, status: 'RETURNED', rows: response.rows.map(row=>projectRow(row,'v8',id)) };
    await entry.store.compareAndSet(id, entry.raw, entry.record);
    return entry.snapshot;
  }
  async get(db: any, tenant: string, actor: string, id: string): Promise<Entry | undefined> {
    const store = new CltJourneyStore(db, tenant, actor), saved = await store.read(id);
    if (!saved) return undefined;
    const { record } = saved;
    let raw = saved.raw;
    if ((record.phase === 'RUNNING' || record.phase === 'READY') && Date.now() >= record.deadline) {
      record.phase = 'UNKNOWN'; record.snapshot.running = false;
      for (const result of Object.values(record.snapshot.results)) if (result.status === 'QUERYING') {
        result.status = 'UNKNOWN'; result.message = 'Resultado incerto após interrupção. Confira o estado no banco; nenhuma repetição automática.';
      }
      try { raw = await store.compareAndSet(record.snapshot.executionId, raw, record); }
      catch { return this.get(db, tenant, actor, id); }
    }
    return { raw, record, snapshot: record.snapshot, store, listeners: new Set() };
  }
  async available(db: any, tenant: string): Promise<JourneyBank[]> {
    const banks: JourneyBank[] = [];
    const check = async (id: JourneyProvider, name: string, read: () => Promise<boolean>, contextual = false) => {
      try { if (await read()) banks.push({ id, name, contextual }); }
      catch { banks.push({ id, name, contextual: true, error: true }); }
    };
    await Promise.all([
      check('vctex', 'VCTEX DIGITAL', async () => {
        const promoters=await db.promoter.findMany({where:{tenantId:tenant,status:'ATIVO'},select:{id:true}});
        for(const p of promoters){const c=await VctexBankService.config(db,tenant,p.id);if(c.enabled&&c.cpf&&c.password)return true;}return false;
      },true),
      check('nossa', 'Nossa Fintech · instituições CLT', async () => { const c = await NossaFintechService.getConfig(db, tenant); return c.enabled && c.isConfigured; }),
      check('facta', 'FACTA', async () => { const c = await FactaBankService.getTenantConfig(db, tenant); return c.isConfigured && c.simulationEnabled; }),
      check('bmg', 'BMG', async () => { const c = await BmgBankService.config(db, tenant); return c.enabled; }),
      check('v8', 'V8 DIGITAL', async () => {
        const rows = await db.systemConfig.findMany({ where: { tenantId: tenant, configKey: { startsWith: 'integration:v8:' } }, select: { configKey: true } });
        for (const row of rows) { const promoter = /^integration:v8:(.+):config$/.exec(row.configKey)?.[1]; if (promoter) { const c = await V8BankService.config(db, tenant, promoter); if (c.enabled && c.cltEnabled) return true; } }
        return false;
      }),
      check('parana', 'Paraná Banco', async () => {
        const promoters = await db.promoter.findMany({ where: { tenantId: tenant, status: 'ATIVO' }, select: { id: true } });
        for (const p of promoters) { const c = await ParanaBankService.config(db, tenant, p.id); if (c.enabled && c.clientId && c.clientSecret) return true; }
        return false;
      }, true),
      check('presenca', 'Presença Bank', async () => {
        const promoters = await db.promoter.findMany({ where: { tenantId: tenant, status: 'ATIVO' }, select: { id: true } });
        for (const p of promoters) { const c = await PresencaBankService.config(db, tenant, p.id); if (c.enabled && c.cltEnabled) return true; }
        return false;
      }, true),
      check('happy', 'Happy CLT', async () => {
        const access = await db.tenant?.findUnique({ where: { id: tenant }, select: { simulationAccessEnabled: true, happySimulationAccessEnabled: true } });
        if (access?.simulationAccessEnabled === false || access?.happySimulationAccessEnabled === false) return false;
        // Match HappyTokenManager's private namespace, including its documented public fallback.
        const store = await integrationConfigStore(db, tenant, 'happy');
        const rows = await store.findMany({ where: { tenantId: tenant, configKey: { in: ['happy_ativo', 'happy_clt_client_id', 'happy_client_id', 'happy_clt_secret', 'happy_secret', 'happy_clt_usuario', 'happy_usuario', 'happy_clt_senha', 'happy_senha'] } } });
        const values = new Map(rows.map((r: any) => [r.configKey, r.configValue]));
        return values.get('happy_ativo') === 'true' && ['client_id', 'secret', 'usuario', 'senha'].every(field => !!(values.get(`happy_clt_${field}`) || values.get(`happy_${field}`)));
      }, true),
    ]);
    return banks.sort((a, b) => journeyProviders.indexOf(a.id) - journeyProviders.indexOf(b.id));
  }
  async start(db: any, tenant: string, actor: string, id: string, input: ProductSimulationInput, provider?: JourneyProvider, action: JourneyAction = 'REFRESH', parentId?: string) {
    if(provider==='finanto')throw Error('CLT_PROVIDER_RETIRED');
    if(action==='SIMULATE'&&provider&&parentId){const parent=await this.get(db,tenant,actor,parentId);input={...input,calculationKey:parent?.snapshot.results[provider]?.readyKey};}
    const fingerprint = journeyFingerprint({ input, provider, action,...(action==='SIMULATE'?{parentId}: {}) });
    const previous = await this.get(db, tenant, actor, id);
    if (previous) { if (previous.record.fingerprint !== fingerprint) throw Error('EXECUTION_CONFLICT'); return previous; }
    const all = (await this.available(db, tenant)).filter(bank=>bank.id!=='finanto'), banks = provider ? all.filter(bank => bank.id === provider).map(bank => ['v8','vctex'].includes(bank.id) ? { ...bank, contextual: false } : bank) : all;
    const parent = parentId ? await this.get(db, tenant, actor, parentId) : undefined;
    const batch=action==='SIMULATE'&&!provider;
    const parameterView=batch;
    if(batch&&(!parent||!(input.value>0)))throw Error('EXECUTION_CONFLICT');
    if (parentId && (!provider&&!batch || !parent || !(['DONE','UNKNOWN'].includes(parent.record.phase)) || provider&&parent?.record.phase==='UNKNOWN' && parent?.snapshot.results[provider]?.status==='UNKNOWN' && !(provider==='nossa'&&action==='SIMULATE'&&parent.snapshot.results.nossa.readyToSimulate) || parent.snapshot.customer?.cpf !== input.cpf)) throw Error('EXECUTION_CONFLICT');
    const snapshot: JourneySnapshot = { executionId: id, rootExecutionId: parameterView?id:parent?.snapshot.rootExecutionId || parent?.snapshot.executionId || id, automaticEnabled: parameterView?false:parent?.snapshot.automaticEnabled ?? (!provider && action === 'REFRESH'), running: true, customer: provider&&action==='SIMULATE'&&parent?structuredClone(parent.snapshot.customer):{ ...input }, banks: parent ? [...new Map([...parent.snapshot.banks.filter(bank=>bank.id!=='finanto'), ...banks].map(b => [b.id, b])).values()] : banks, results: parent ? structuredClone(Object.fromEntries(Object.entries(parent.snapshot.results).filter(([bank])=>bank!=='finanto'))) : {} };
    if(parameterView){
      snapshot.calculation={value:input.value,term:input.term,mode:input.mode,requestedAt:new Date().toISOString(),banks:banks.map(b=>b.id),sourceExecutionId:parentId!};
      snapshot.results={};snapshot.banks=(batch?banks:snapshot.banks).filter(b=>parent!.snapshot.banks.some(old=>old.id===b.id)).map(b=>({...b,contextual:b.id==='vctex'?false:b.contextual}));snapshot.calculation.banks=(batch?snapshot.banks:banks).map(b=>b.id);
    }
    for (const bank of (parameterView?snapshot.banks:banks)) {
      const previous=parent?.snapshot.results[bank.id];
      const margins=previous?.rows.filter(r=>r.state==='DATA')||[];
      const uncertain=parameterView&&previous?.status==='UNKNOWN';
      const marginOnly=parameterView&&provider&&bank.id!==provider;
      if(uncertain)bank.contextual=true;
      snapshot.results[bank.id]={request:action==='SIMULATE'?{value:input.value,term:input.term,mode:input.mode,employerDocument:input.employerDocument,factaRegistration:input.factaRegistration,v8ConsultId:input.v8ConsultId,v8PromoterId:input.v8PromoterId,calculationKey:input.calculationKey,requestedAt:new Date().toISOString()}:previous?.request,executionId:id,status:uncertain?'UNKNOWN':marginOnly?'RETURNED':bank.contextual?'CONTEXTUAL':'QUERYING',rows:action==='SIMULATE'?margins:[],message:uncertain?'Resultado anterior incerto. Nenhum POST foi repetido.':bank.contextual?'Esta integração exige parâmetros próprios; o cálculo com estes filtros não possui contrato confirmado.':undefined};
    }
    const record: JourneyRecord = { fingerprint, phase: 'READY', deadline: Date.now() + 50000, snapshot };
    const store = new CltJourneyStore(db, tenant, actor), canonical = await store.create(id, record);
    await store.remember(canonical);
    const entry = await this.get(db, tenant, actor, canonical);
    if (!entry || entry.record.fingerprint !== fingerprint) throw Error('EXECUTION_CONFLICT');
    return entry;
  }
  async execute(db: any, tenant: string, actor: string, entry: Entry, input: ProductSimulationInput, action: JourneyAction = 'REFRESH', provider?: JourneyProvider) {
    if (entry.record.phase !== 'READY') return;
    input={...input,calculationKey:provider?entry.snapshot.results[provider]?.request?.calculationKey:entry.snapshot.customer?.calculationKey};
    const { record, store, snapshot } = entry, id = snapshot.executionId;
    record.phase = 'RUNNING'; record.deadline = Date.now() + 50000;
    try { entry.raw = await store.compareAndSet(id, entry.raw, record); }
    catch { const current = await this.get(db, tenant, actor, id); if (current) Object.assign(entry, current); return; }
    const stop = new AbortController(), signal = AbortSignal.any([stop.signal, AbortSignal.timeout(40000)]);
    let writes = Promise.resolve();
    const publish = () => {
      // Serialize writes, but use CAS as the distributed authority. Partial results are durable before broadcast.
      const copy = structuredClone(record);
      writes = writes.then(async () => { entry.raw = await store.compareAndSet(id, entry.raw, copy); for (const listener of entry.listeners) listener(copy.snapshot); });
      writes = writes.catch(error => { stop.abort(); throw error; });
      return writes;
    };
    await withinJourneyDeadline(signal, async () => {
      const outcomes = await Promise.allSettled(snapshot.banks.filter(bank => bank.id!=='finanto' && !bank.contextual && (!provider || bank.id === provider)).map(async bank => {
        const result = snapshot.results[bank.id];
        try {
          const previousMargins=action==='SIMULATE'?result.rows.filter(r=>r.state==='DATA'):[];
          const update = async (rows: ProductSimulationRow[]) => { result.rows = [...previousMargins,...rows.map(row=>projectRow(row,bank.id,id))]; await publish(); };
          result.stage = action === 'AUTHORIZE' || action === 'CREATE_CONSULT' ? 'CONSENT' : 'CONSULTATION';
          const bankInput = { ...input, bmgActorId: actor, journeyId: snapshot.rootExecutionId || id, automaticAuthorization: action === 'REFRESH' && !provider, observeOnly: false };
          if (!['v8','vctex'].includes(bank.id)) { delete bankInput.v8BirthDate; delete bankInput.v8Email; delete bankInput.v8Gender; }
          const run = () => ProductSimulationService.run(db, tenant, 'CLT', action, bankInput, update, [bank.id]);
          let response = action === 'SIMULATE' ? await cltBankOnce(db,tenant,bank.id,['SIMULATE',bankInput.journeyId,actor,input.cpf,input.employerDocument||null,input.factaRegistration||null,input.value,input.term,input.mode,input.calculationKey||null],run) : await run();
          result.rows = [...previousMargins,...response.rows.map(row=>projectRow(row,bank.id,id))];
          if(bank.id==='v8')bindV8(snapshot);
          // Publish eligibility/margin before calculating. Each adapter revalidates the bank
          // response and derives its own payment; no browser-supplied margin is trusted.
          if (action === 'REFRESH' && mayCalculate(bank.id, response.rows)) {
            result.stage = 'MARGIN'; await publish();
            result.stage = 'SIMULATION'; await publish();
            const offers = await cltBankOnce(db,tenant,bank.id,['SIMULATE',bankInput.journeyId,actor,input.cpf,input.employerDocument||null,input.factaRegistration||null,input.value,input.term,input.mode,calculationKey(result.rows)],()=>ProductSimulationService.run(db, tenant, 'CLT', 'SIMULATE', { ...bankInput, autoConditions: !input.value, automaticAuthorization:false }, undefined, [bank.id]));
            response = { ...offers, rows: [...response.rows, ...offers.rows] };
            result.rows = response.rows.map(row=>projectRow(row,bank.id,id));
          }
          result.status = result.rows.some(row => (row.data as any)?.writeUncertain === true) ? 'UNKNOWN' : 'RETURNED';
          if(result.status==='UNKNOWN')result.message='Há solicitação com resultado incerto nesta integração. Atualize o estado; nenhuma repetição automática será realizada.';
          result.readyKey = calculationKey(result.rows);
          result.readyToSimulate = mayCalculate(bank.id,result.rows) && !result.rows.some(r=>r.state==='OFFER');
          result.stage = 'RESULT';
          if (bank.id === 'v8') { result.contractPending = !result.rows.some(r => r.state === 'OFFER'); result.message = result.rows.some(r => r.state === 'OFFER') ? undefined : 'Confira o estado da consulta e as pendências específicas da conexão V8.'; }
          else if (!result.rows.length) result.message = 'Sem ofertas retornadas nesta consulta.';
        } catch { result.status = 'UNKNOWN'; result.message = 'Resultado incerto. Confira o estado antes de outra operação; nenhuma repetição automática.'; }
        if (signal.aborted) { result.status = 'UNKNOWN'; result.message = 'Prazo da consulta encerrado. Confira o estado no banco antes de outra operação.'; }
        await publish();
      }));
      if (outcomes.some(result => result.status === 'rejected')) throw Error('EXECUTION_PERSISTENCE_FAILED');
    });
    snapshot.running = false;
    record.phase = Object.values(snapshot.results).some(r => r.status === 'UNKNOWN') ? 'UNKNOWN' : 'DONE';
    record.deadline = Date.now();
    await publish();
    if(provider)await this.syncRoot(db,tenant,actor,snapshot,provider);
    await CltAuthorizationFollowup.schedule(db,tenant,actor,snapshot);
  }
}

function projectRow(row: ProductSimulationRow,providerId?:string,executionId?:string): ProductSimulationRow {
  if(providerId&&row.origin?.providerId&&row.origin.providerId!==providerId)return {provider:providerId,institution:providerId,state:'ERROR',outcome:'TECHNICAL_ERROR',origin:{providerId,executionId},message:'A origem da resposta não corresponde à instituição desta execução. Os dados não foram utilizados.'};
  const data = row.data as any;
  return { origin:{...row.origin,providerId:providerId||row.origin?.providerId||'unknown',connectionId:row.origin?.connectionId||data?.v8?.promoterId,consultationId:row.origin?.consultationId||data?.v8?.consultId||data?.vctex?.preOperationId,executionId:executionId||row.origin?.executionId},provider: row.provider, institution: row.institution, table: row.table, state: row.state, outcome: row.outcome, message: cltPublicMessage(row.message), amount: row.amount, contractAmount: row.contractAmount, installment: row.installment, term: row.term, rate: row.rate, cetMonthly: row.cetMonthly, cetAnnual: row.cetAnnual, simulationId: row.simulationId,
    link: typeof row.link === 'string' && /^https:\/\//i.test(row.link) ? row.link : undefined,
    data: data ? { observedAt:data.observedAt, financial:data.financial?Object.fromEntries(['isInsured','insuranceAmount','iofAmount','issueAmount','operationAmount','firstInstallmentDate'].filter(k=>data.financial[k]!==undefined).map(k=>[k,data.financial[k]])):undefined,vctex:data.vctex?Object.fromEntries(['preOperationId','employmentId','offerId','rawFee','rawMonthlyRate','iof','insuranceAmount','withInsurance','issueAmount','disbursedIssueAmount','finalDisbursedAmount','totalAmount','firstDueDate','lastDueDate','disbursementDate','uncertain'].filter(k=>data.vctex[k]!==undefined).map(k=>[k,data.vctex[k]])):undefined, operationCache:data.operationCache?.cached===true||data.operationCached===true?{cached:true,calculatedAt:data.operationCache?.calculatedAt||data.operationCalculatedAt}:undefined, writeUncertain: data.writeUncertain === true, authorization: data.authorization ? {status: data.authorization.status,mechanism: data.authorization.mechanism,ready:data.authorization.ready,source:data.authorization.source,observedAt:data.authorization.observedAt,previousStatus:data.authorization.previousStatus,authorizationId:data.authorization.authorizationId} : undefined, trackingUnsupported: data.trackingUnsupported === true, workflow: data.workflow ? {consents:Array.isArray(data.workflow.consents)?data.workflow.consents.map((c:any)=>({link:c.link,receipt:c.receipt})):undefined}:undefined, employment: data.employment ? { employer_cnpj: data.employment.employer_cnpj, work_registration: data.employment.work_registration } : undefined,
      eligible: typeof data.eligible === 'boolean' ? data.eligible : undefined,
      restrictions: safeReasons(data.restrictions),
      borrower: data.borrower ? { name: data.borrower.name } : undefined,
      items: Array.isArray(data.items) ? data.items.slice(0, 500).map((item: any) => ({ employerDocument: item.employerDocument, employerName: item.employerName, registrationNumber: item.registrationNumber, term: item.term, rate: item.rate, netValue: item.netValue, installmentValue: item.installmentValue, maxInstallmentValue: item.maxInstallmentValue })) : undefined,
      margin: data.margin ? { name: data.margin.name, available_balance: data.margin.available_balance, used_balance:data.margin.used_balance,residual_balance:data.margin.residual_balance, utilizable_balance: data.margin.utilizable_balance, can_continue: typeof data.margin.can_continue === 'boolean' ? data.margin.can_continue : undefined, restrictions: safeReasons(data.margin.restrictions), employer: data.margin.employer ? { name: data.margin.employer.name, document: data.margin.employer.document } : undefined } : undefined,
      v8: data.v8 ? { nextAction:data.v8.nextAction==='CREATE_CONSULT'?'CREATE_CONSULT':undefined, consultId: data.v8.consultId, promoterId: data.v8.promoterId, status: data.v8.status, consentRecorded: data.v8.consentRecorded, monthlyInterestRate: data.v8.monthlyInterestRate, operationAmount: data.v8.operationAmount, issueAmount: data.v8.issueAmount, disbursedIssueAmount: data.v8.disbursedIssueAmount, requestedProvider: data.v8.requestedProvider, returnedProvider: data.v8.returnedProvider, simulationConfigId: data.v8.simulationConfigId, isInsured: data.v8.isInsured, insuranceAmount: data.v8.insuranceAmount, rawCet: data.v8.rawCet, firstInstallmentDate: data.v8.firstInstallmentDate, iofAmount: data.v8.iofAmount, cached: data.v8.cached === true, calculatedAt: data.v8.calculatedAt, simulationReady: data.v8.simulationReady, consentReady: data.v8.consentReady, ownershipConfirmed: data.v8.ownershipConfirmed, contractReasons: safeReasons(data.v8.contractReasons), rawMonthlyRate: data.v8.rawMonthlyRate, configurations: Array.isArray(data.v8.configurations) ? data.v8.configurations.map((c: any) => ({ id: c.id, name: c.name, terms: c.terms, rawMonthlyRate: c.rawMonthlyRate })) : undefined } : undefined } : undefined };
}

export function mayCalculate(bank: JourneyProvider, rows: ProductSimulationRow[]) {
  if(bank==='finanto')return false;
  if(bank==='v8'&&v8References(rows).length>1)return false;
  const eligible = rows.filter(row => {
    const d = row.data as any;
    if(bank === 'bmg')return row.state === 'DATA' && d?.authorization?.ready === true;
    return row.state === 'DATA' && d && (bank !== 'v8' || d.v8?.simulationReady === true) && !d.restrictions?.length && !d.margin?.restrictions?.length && d.margin?.can_continue === true && !!cltPaymentLimit(d.margin.available_balance, d.margin.utilizable_balance);
  });
  // Multiple FACTA registrations require an explicit selection, never the first row.
  return ['nossa', 'facta', 'v8', 'bmg'].includes(bank) && eligible.length > 0 && (bank !== 'facta' || eligible.length === 1 && rows.filter(r => r.state === 'DATA').length === 1);
}

function bindV8(snapshot:JourneySnapshot){const ref=uniqueV8Reference(snapshot.results.v8?.rows);if(ref&&snapshot.customer){snapshot.customer.v8ConsultId=ref.consultId;snapshot.customer.v8PromoterId=ref.promoterId;}}

function safeReasons(value: unknown) { return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 30).map(v => cltPublicMessage(v)).filter(Boolean) : undefined; }

function calculationKey(rows:ProductSimulationRow[]){return journeyFingerprint(rows.filter(r=>r.state==='DATA').map(r=>{const d=r.data as any;return {institution:r.institution,employment:d?.employment,margin:d?.margin?{available:d.margin.available_balance,utilizable:d.margin.utilizable_balance,eligible:d.margin.can_continue}:undefined,items:d?.items,v8:d?.v8?{consultId:d.v8.consultId,configurations:d.v8.configurations,simulationReady:d.v8.simulationReady}:undefined,authorization:d?.authorization?{status:d.authorization.status,ready:d.authorization.ready}:undefined};}));}
