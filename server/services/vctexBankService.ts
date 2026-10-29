import {currentVctexEmployments} from '../../src/lib/vctexCurrentState.js';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {resolveBankPromoter,bankPromoterConfigKey} from './bankPromoterConfig.js';
import {CltJourneyStore,journeyFingerprint,type JourneyRecord} from './cltJourneyStore.js';
import {vctexFetch,VCTEX_ORIGIN,vctexGateway} from './vctexTransport.js';
import {parseVctexToken,parseVctexRates,vctexFieldNames,vctexStates,vctexTerminal,normalizeVctexQuote,validateVctexInstallments,type VctexRate} from './vctexContract.js';
import {isValidCpf} from '../../src/lib/utils.js';
import {isCltEmail} from '../../src/lib/cltCustomerData.js';
import {vctexPermissions,vctexConnectionStatus,type VctexDiagnostic} from './vctexDiagnostic.js';

type Config={enabled:boolean;environment:'production';cpf:string;password:string};
export type VctexIdentity={cpf:string;name:string;phone:string;email:string};
type Case={cpf:string;preOperationId?:string;status:string;label:string;link?:string;expiresAt?:string;authorizationValid?:boolean;authorizationTerm?:{signedDate?:string;validUntil?:string;isValid:boolean};employments:any[];offers:any[];uncertain?:boolean};
type Stored=JourneyRecord & {value?:any;failure?:{status:number;code:string}};
const tokens=new Map<string,{token:string;until:number}>();
function cryptoKey(){const s=process.env.JWT_SECRET||process.env.AUTH_SECRET;if(!s)throw Error('Criptografia VCTEX indisponível.');return createHash('sha256').update('sentinel:vctex:'+s).digest();}
function seal(v:unknown,aad:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',cryptoKey(),iv);c.setAAD(Buffer.from(aad));const data=Buffer.concat([c.update(JSON.stringify(v)),c.final()]);return [iv,c.getAuthTag(),data].map(b=>b.toString('base64url')).join('.');}
function open(v:string,aad:string){const [iv,tag,data]=v.split('.').map(b=>Buffer.from(b,'base64url')),c=createDecipheriv('aes-256-gcm',cryptoKey(),iv);c.setAAD(Buffer.from(aad));c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(data),c.final()]).toString());}
const idPath=(id:string)=>{if(typeof id!=='string'||! /^[A-Za-z0-9-]{1,100}$/.test(id))throw Error('Referência VCTEX inválida.');return id;};
export class VctexError extends Error{constructor(public status:number,public code:string){super(`VCTEX não concluiu a operação (HTTP ${status}; ${code}).`);}}
export class VctexBankService{
  static async config(db:any,tenant:string,promoter:string):Promise<Config>{
    await resolveBankPromoter(db,tenant,promoter);
    const key=bankPromoterConfigKey('vctex',promoter,'config'),row=await db.systemConfig.findUnique({where:{tenantId_configKey:{tenantId:tenant,configKey:key}}});
    return row?open(row.configValue,JSON.stringify([tenant,promoter,key])):{enabled:false,environment:'production',cpf:'',password:''};
  }
  static metadata(c:Config){let gatewayReady=false;try{vctexGateway();gatewayReady=true;}catch{}return {enabled:c.enabled,environment:c.environment,hasCredentials:!!(c.cpf&&c.password),gatewayReady,transport:'Oracle · IP fixo',authenticationHost:'www.appvctex.com.br',apiBase:VCTEX_ORIGIN+'/api/consignado/',permissionsVerified:false};}
  static async save(db:any,tenant:string,promoter:string,raw:any){
    const old=await this.config(db,tenant,promoter);
    if(raw.environment!=='production')throw Error('O PDF documenta somente o host de produção. Não existe sandbox confirmado.');
    const cpf=raw.cpf?String(raw.cpf).replace(/\D/g,''):old.cpf,password=typeof raw.password==='string'&&raw.password?raw.password:old.password;
    if(!isValidCpf(cpf)||!password||password.length>1024)throw Error('Informe as credenciais VCTEX autorizadas.');
    const c:Config={enabled:raw.enabled===true,environment:'production',cpf,password},configKey=bankPromoterConfigKey('vctex',promoter,'config');
    const data={tenantId:tenant,configKey,configValue:seal(c,JSON.stringify([tenant,promoter,configKey])),isSecret:true};
    await db.systemConfig.upsert({where:{tenantId_configKey:{tenantId:tenant,configKey}},create:data,update:{configValue:data.configValue,isSecret:true}});return this.metadata(c);
  }
  private static async login(c:Config){
    const r=await vctexFetch(VCTEX_ORIGIN+'/api/authentication/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cpf:c.cpf,password:c.password})});
    return {status:r.status,ok:r.ok,body:await r.json().catch(()=>null)};
  }
  static async diagnostic(db:any,tenant:string,promoter:string){
    const c=await this.config(db,tenant,promoter);if(!c.cpf||!c.password)throw Error('Cadastre credenciais autorizadas antes do diagnóstico.');
    const started=Date.now();
    const result:VctexDiagnostic={timestamp:new Date().toISOString(),latencyMs:0,httpStatus:null,fields:[],authenticationSucceeded:false,tokenRecognized:false,authenticationRecognized:false,permissionsClt:'UNPROVEN',permissionsVerified:false,transportAvailable:false,transport:'Oracle',error:null};
    try {
      const r=await this.login(c);
      result.httpStatus=r.status;result.fields=vctexFieldNames(r.body);
      result.transportAvailable=!!r.body&&typeof r.body==='object'&&r.status!==404&&r.status<500;
      result.authenticationSucceeded=r.ok;
      try{parseVctexToken(r.body);result.tokenRecognized=true;}catch{}
      result.authenticationRecognized=r.ok&&result.tokenRecognized;
      if(result.authenticationRecognized)result.permissionsClt=vctexPermissions(r.body);
      result.permissionsVerified=result.permissionsClt==='CONFIRMED';
      result.error=!r.ok?'Autenticação não validada. Confira as credenciais e o transporte Oracle.':!result.tokenRecognized?'Formato do token ausente, inválido ou ambíguo.':null;
    } catch {
      result.error='Transporte Oracle indisponível ou resposta inválida. Verifique o gateway; nenhuma consulta de trabalhador foi realizada.';
    }
    // Append-only encrypted records prevent concurrent diagnostics overwriting one another.
    // Bind evidence to credentials/transport without returning their fingerprint or values.
    result.latencyMs=Date.now()-started;
    const configKey=bankPromoterConfigKey('vctex',promoter,`diagnostic:${Date.now()}:${randomBytes(12).toString('hex')}`);
    const value={fingerprint:this.diagnosticFingerprint(c),result};
    await db.systemConfig.create({data:{tenantId:tenant,configKey,configValue:seal(value,JSON.stringify([tenant,promoter,configKey])),isSecret:true}});
    return result;
  }
  private static diagnosticFingerprint(c:Config){return journeyFingerprint([c,process.env.VCTEX_GATEWAY_URL,process.env.VCTEX_GATEWAY_SECRET]);}
  static async status(db:any,tenant:string,promoter:string){
    const c=await this.config(db,tenant,promoter),meta=this.metadata(c),fingerprint=this.diagnosticFingerprint(c);
    const rows=await db.systemConfig.findMany({where:{tenantId:tenant,configKey:{startsWith:bankPromoterConfigKey('vctex',promoter,'diagnostic:')}},orderBy:{createdAt:'desc'},take:101});
    const history:VctexDiagnostic[]=[];
    for(const row of rows.slice(0,100)){
      try{const saved=open(row.configValue,JSON.stringify([tenant,promoter,row.configKey]));if(saved.fingerprint===fingerprint)history.push(saved.result);}catch{}
    }
    history.sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
    const lastDiagnostic=history[0]||null,recent=history.filter(r=>Date.parse(r.timestamp)>=Date.now()-86400000);
    return {...meta,status:vctexConnectionStatus(meta,lastDiagnostic),lastDiagnostic,history:history.slice(0,30),
      metrics:{requests24h:recent.length,errors24h:recent.filter(r=>!r.authenticationRecognized||!r.transportAvailable).length,complete:rows.length<=100},
      permissionsVerified:lastDiagnostic?.permissionsVerified===true};
  }
  private static async call(db:any,tenant:string,promoter:string,method:string,path:string,body?:unknown){
    const c=await this.config(db,tenant,promoter);if(!c.enabled||!c.cpf||!c.password)throw Error('Conexão VCTEX inativa ou sem credenciais.');
    const cacheKey=journeyFingerprint([tenant,promoter,c.cpf,c.password,process.env.VCTEX_GATEWAY_URL]);
    const authenticate=async()=>{const login=await this.login(c);if(!login.ok)throw new VctexError(login.status,'AUTHENTICATION_FAILED');const token=parseVctexToken(login.body);tokens.set(cacheKey,{token,until:Date.now()+60000});return token;};
    let token=tokens.get(cacheKey);if(!token||token.until<=Date.now())token={token:await authenticate(),until:Date.now()+60000};
    const send=(t:string)=>vctexFetch(VCTEX_ORIGIN+'/api/consignado'+path,{method,headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    let r=await send(token.token);
    // No automatic POST replay. GET-by-CPF can create a pre-operation, so it is excluded too.
    if(r.status===401&&method==='GET'&&!path.startsWith('/pre-operation/document-number/'))r=await send(await authenticate());
    const data=await r.json().catch(()=>null);
    if(!r.ok){const code=typeof data?.code==='string'&&/^[A-Za-z_]{1,90}$/.test(data.code)?data.code:'UPSTREAM_ERROR';throw new VctexError(r.status,code);}
    if(!data||typeof data!=='object')throw Error('Resposta VCTEX incompatível.');return data;
  }
  /** Shared encrypted DB reservation survives process restarts and concurrent serverless instances. */
  static async once(db:any,tenant:string,scope:string,intent:unknown,run:()=>Promise<any>){
    const id='vctex-op:'+journeyFingerprint([scope,intent]),store=new CltJourneyStore(db,tenant,'vctex-bank:'+scope);
    const old=await store.read(id);if(old?.record.phase==='DONE'){const record=old.record as Stored;if(record.failure)throw new VctexError(record.failure.status,record.failure.code);return structuredClone(record.value);}
    if(old)throw Error('VCTEX_RESULT_UNKNOWN');
    const record:Stored={fingerprint:id,phase:'READY',deadline:Date.now()+25000,snapshot:{executionId:id,running:true,banks:[],results:{}}};
    await store.create(id,record);const saved=await store.read(id);if(saved?.record.phase!=='READY')throw Error('VCTEX_RESULT_UNKNOWN');
    record.phase='RUNNING';const raw=await store.compareAndSet(id,saved.raw,record);
    try{record.value=await run();record.phase='DONE';record.snapshot.running=false;await store.compareAndSet(id,raw,record);return record.value;}
    catch(e){const definitive=e instanceof VctexError&&[400,401,403,404,409,422].includes(e.status);record.phase=definitive?'DONE':'UNKNOWN';if(definitive)record.failure={status:e.status,code:e.code};record.snapshot.running=false;await store.compareAndSet(id,raw,record).catch(()=>{});throw e;}
  }
  private static async caseContext(db:any,tenant:string,actor:string,promoter:string,identity:VctexIdentity){
    const cpf=identity.cpf.replace(/\D/g,''),phone=identity.phone.replace(/\D/g,'');
    if(!actor||!isValidCpf(cpf)||!identity.name.trim()||identity.name.length>200||!/^\d{10,11}$/.test(phone)||!isCltEmail(identity.email))throw Error('Revise os dados únicos do trabalhador.');
    const c=await this.config(db,tenant,promoter);
    if(!c.enabled||!c.cpf||!c.password)throw Error('Conexão VCTEX inativa ou sem credenciais.');
    // Fail before reserving a bank intent when no authenticated transport exists.
    vctexGateway();
    const scope=journeyFingerprint([promoter,c.cpf,c.password]);
    const id='vctex-case:'+journeyFingerprint([actor,scope,cpf]),store=new CltJourneyStore(db,tenant,actor);
    return {cpf,phone,scope,id,store};
  }
  static async refresh(db:any,tenant:string,actor:string,promoter:string,identity:VctexIdentity,create=false){
    const {cpf,phone,scope,id,store}=await this.caseContext(db,tenant,actor,promoter,identity);
    let saved=await store.read(id),value:Case=(saved?.record as Stored)?.value||{cpf,status:'not_found',label:'Autorização necessária',employments:[],offers:[]};
    const previousId=value.preOperationId;
    const renew=create&&previousId&&typeof value.expiresAt==='string'&&Date.parse(value.expiresAt)<=Date.now();
    if(!value.preOperationId||renew){
      // Called only on an explicit initial/recovery action; periodic observation never looks up CPF.
      if(!create)return {...value,caseId:id,promoterId:promoter};
      let found:any;
      try{found=await this.once(db,tenant,scope,['LOOKUP',cpf,renew?previousId:null],async()=>{try{return await this.call(db,tenant,promoter,'GET','/pre-operation/document-number/'+cpf);}catch(e){if(e instanceof VctexError&&e.status===404)return {condition:'not_found'};throw e;}});}
      catch(e){if(e instanceof VctexError&&e.status===404)found={condition:'not_found'};else throw e;}
      if(found.preOperationId)value.preOperationId=idPath(found.preOperationId);
      else if(found.condition==='not_found'){
        // A 409 or uncertain POST is reconciled by exact CPF lookup, never by another POST.
        value.preOperationId=undefined;
        try{const created=await this.once(db,tenant,scope,['CREATE',cpf,previousId||null],()=>this.call(db,tenant,promoter,'POST','/pre-operation',{worker:{name:identity.name,documentNumber:cpf,email:identity.email,phoneNumber:'+55'+phone}}));value.preOperationId=idPath(created.preOperationId);}
        catch(e){try{const found=await this.call(db,tenant,promoter,'GET','/pre-operation/document-number/'+cpf);if(found.preOperationId)value.preOperationId=idPath(found.preOperationId);}catch{}if(!value.preOperationId)throw Error('VCTEX_RESULT_UNKNOWN');}
      }else throw Error('Condição VCTEX desconhecida; criação interrompida.');
      value.status='started';
      const record:Stored={fingerprint:id,phase:'DONE',deadline:Date.now(),snapshot:{executionId:id,running:false,banks:[],results:{}},value};
      if(saved)await store.compareAndSet(id,saved.raw,record);else await store.create(id,record);saved=await store.read(id);
      if((saved?.record as Stored)?.value?.preOperationId!==value.preOperationId)throw Error('Referência VCTEX concorrente. Recupere o acompanhamento.');
    }
    let detail:any;
    try{detail=await this.call(db,tenant,promoter,'GET','/pre-operation/'+idPath(value.preOperationId!));}
    catch(e){if(e instanceof VctexError&&e.status===422&&e.code==='pre_operation_expired_employment'){
      const latest=await store.read(id);value={...value,status:'authorization_failure',label:'Dados da pré-operação expirados. Verifique a autorização para uma nova consulta.',expiresAt:new Date(0).toISOString(),authorizationValid:false,employments:[]};
      if(latest)await store.compareAndSet(id,latest.raw,{...latest.record,value} as Stored);return {...value,cpf:undefined,caseId:id,promoterId:promoter,terminal:true};
    }throw e;}
    if(String(detail.worker?.documentNumber||'').replace(/\D/g,'')!==cpf)throw Error('A pré-operação VCTEX não corresponde ao trabalhador desta execução.');
    value={...value,status:String(detail.status),label:vctexStates[detail.status as keyof typeof vctexStates]||'Estado bancário não reconhecido',expiresAt:detail.expiresAt,authorizationValid:detail.authorizationTerm?.isValid===true&&Date.parse(detail.authorizationTerm?.validUntil||'')>Date.now(),authorizationTerm:{signedDate:detail.authorizationTerm?.signedDate,validUntil:detail.authorizationTerm?.validUntil,isValid:detail.authorizationTerm?.isValid===true},employments:[]};
    if(['started','creating_authorization_term','awaiting_signature'].includes(value.status)){
      const list=await this.call(db,tenant,promoter,'GET','/pre-operation?'+new URLSearchParams({documentNumber:cpf,page:'0',perPage:'10',preOperationList:'1'}));
      const row=list.preOperations?.find((r:any)=>r.preOperationId===value.preOperationId&&r.worker?.documentNumber===cpf);
      try{const link=new URL(row?.onboardingURL);if(link.protocol==='https:'&&!link.username&&!link.password)value.link=link.href;}catch{}
    }else value.link=undefined;
    if(value.status==='finished'&&value.authorizationValid&&Date.parse(detail.authorizationTerm?.validUntil||'')>Date.now()&&Date.parse(value.expiresAt||'')>Date.now()){
      for(const e of currentVctexEmployments<any>(Array.isArray(detail.employments)?detail.employments:[])){
        const employment={employmentId:idPath(e.employmentId),employer:e.employer?{name:e.employer.name,documentNumber:e.employer.documentNumber}:undefined,registrationNumber:typeof e.registrationNumber==='string'?e.registrationNumber:undefined,admissionDate:e.admissionDate,terminationDate:e.terminationDate,eligible:e.eligible===true,ineligibilityReason:e.ineligibilityReason?.description,ineligibilitySource:e.ineligibilityReason?.source,expiresAt:value.expiresAt,availableMarginValue:e.availableMarginValue,rates:[] as VctexRate[]};
        // At most one employment's rates per observation; additional links are selected explicitly.
        if(employment.eligible&&typeof e.availableMarginValue==='number'&&e.availableMarginValue>0&&value.employments.every(x=>!x.rates.length)){
          const rates=await this.call(db,tenant,promoter,'GET',`/pre-operation/${idPath(value.preOperationId!)}/employment/${employment.employmentId}/available-rates`);
          employment.rates=parseVctexRates(rates);
        }value.employments.push(employment);
      }
    }
    if(!saved)throw Error('Estado VCTEX não persistido.');
    const latest=await store.read(id);if(!latest)throw Error('Estado VCTEX indisponível.');
    // Preserve concurrent quote additions instead of overwriting them with stale observation.
    value.offers=(latest.record as Stored).value?.offers||[];
    await store.compareAndSet(id,latest.raw,{...latest.record,value} as Stored);
    return {...value,cpf:undefined,caseId:id,promoterId:promoter,terminal:vctexTerminal.has(value.status)};
  }
  static async simulate(db:any,tenant:string,actor:string,promoter:string,identity:VctexIdentity,selection:{employmentId:string;offerId:string;term?:number;installment?:number}){
    const current=await this.refresh(db,tenant,actor,promoter,identity,false);
    if(current.status!=='finished'||!current.authorizationValid||Date.parse(current.expiresAt||'')<=Date.now())throw Error('Aguarde autorização válida e vínculos concluídos na VCTEX.');
    const e=current.employments.find((e:any)=>e.employmentId===selection.employmentId);
    if(!e?.eligible||!(e.availableMarginValue>0))throw Error('Vínculo VCTEX inelegível.');
    const rates=await this.call(db,tenant,promoter,'GET',`/pre-operation/${idPath(current.preOperationId!)}/employment/${idPath(e.employmentId)}/available-rates`);
    const rate:VctexRate|undefined=parseVctexRates(rates).find(r=>r.id===selection.offerId);
    if(!rate||typeof rate.withInsurance!=='boolean')throw Error('Oferta VCTEX indisponível.');
    const custom=selection.term!==undefined||selection.installment!==undefined;
    if(custom)validateVctexInstallments(rate,e.availableMarginValue,selection.term,selection.installment);
    const {scope,store,id}=await this.caseContext(db,tenant,actor,promoter,identity);
    const payload={offerId:rate.id,withInsurance:rate.withInsurance,...(custom?{installments:selection.term,installmentAmount:selection.installment}:{})};
    const raw=await this.once(db,tenant,scope,['SIMULATE',current.preOperationId,e.employmentId,payload],()=>this.call(db,tenant,promoter,'POST',`/pre-operation/${idPath(current.preOperationId!)}/employment/${idPath(e.employmentId)}/simulate/${custom?'installments':'full'}`,payload));
    const quote=normalizeVctexQuote(raw,rate,e.employmentId,current.preOperationId!);
    for(let attempt=0;attempt<4;attempt++){const saved=await store.read(id);if(!saved)throw Error('Histórico VCTEX indisponível.');const record=saved.record as Stored;record.value.offers=[...(record.value.offers||[]).filter((q:any)=>q.simulationId!==quote.simulationId),quote];try{await store.compareAndSet(id,saved.raw,record);return quote;}catch{}}
    throw Error('Oferta preservada na reserva. Recupere o acompanhamento antes de reenviar.');
  }
  static async rates(db:any,tenant:string,actor:string,promoter:string,identity:VctexIdentity,employmentId:string){
    const current=await this.refresh(db,tenant,actor,promoter,identity,false);
    if(current.status!=='finished'||!current.authorizationValid||!current.employments.some((e:any)=>e.employmentId===employmentId&&e.eligible&&e.availableMarginValue>0))throw Error('Vínculo VCTEX inelegível.');
    const rates=await this.call(db,tenant,promoter,'GET',`/pre-operation/${idPath(current.preOperationId!)}/employment/${idPath(employmentId)}/available-rates`);
    return parseVctexRates(rates);
  }
}
