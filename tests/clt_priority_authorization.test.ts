import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {journeyDatabase} from './helpers/cltJourneyDatabase';
import {withinJourneyDeadline} from '../server/services/cltJourneyDeadline';
import {ProductSimulationService as Sim} from '../server/services/productSimulationService';
import {NossaFintechService as Nossa} from '../server/services/nossaFintechService';
import {FinantoService as Finanto} from '../server/services/finantoService';
import {FactaSimulationService as Facta} from '../server/services/factaSimulationService';
import {FactaBankService as FactaBank} from '../server/services/factaBankService';
import {BmgBankService as Bmg} from '../server/services/bmgBankService';
import {V8CltSimulationService as V8} from '../server/services/v8CltSimulationService';
import {CltJourneyService} from '../server/services/cltJourneyService';
import {cltBankOnce,reserveCltSms} from '../server/services/cltBankOperation';
const customer={cpf:'52998224725',name:'Pessoa sintética',phone:'11999999999',v8BirthDate:'1990-02-28',v8Gender:'male' as const,v8Email:'synthetic@example.invalid',value:0,term:0,mode:'Payment' as const,eligibility:true,autoConditions:true,automaticAuthorization:true,journeyId:'synthetic-root',bmgActorId:'user:a'};
const run=(fn:()=>Promise<any>)=>withinJourneyDeadline(AbortSignal.timeout(10000),fn);
beforeEach(()=>{vi.stubEnv('JWT_SECRET','synthetic-priority-encryption-secret');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('UNEXPECTED_EXTERNAL_CALL')));});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('renews only a successful authorization for an explicit new case with current missing-status evidence; never releases UNKNOWN',async()=>{
  vi.useFakeTimers();const db=journeyDatabase(),send=vi.fn().mockResolvedValue({status:'PENDING'}),start=Date.now();
  await cltBankOnce(db,'tenant-a','nossa',['AUTHORIZE','synthetic'],send,{root:'case-a',confirmedMissing:true});
  vi.setSystemTime(start+31000);
  await cltBankOnce(db,'tenant-a','nossa',['AUTHORIZE','synthetic'],send,{root:'case-a',confirmedMissing:true});
  await cltBankOnce(db,'tenant-a','nossa',['AUTHORIZE','synthetic'],send,{root:'case-b',confirmedMissing:false});expect(send).toHaveBeenCalledOnce();
  await cltBankOnce(db,'tenant-a','nossa',['AUTHORIZE','synthetic'],send,{root:'case-b',confirmedMissing:true});expect(send).toHaveBeenCalledTimes(2);
  const fail=vi.fn().mockRejectedValue(Error('timeout'));await expect(cltBankOnce(db,'tenant-a','facta',['AUTHORIZE','other'],fail,{root:'a',confirmedMissing:true})).rejects.toThrow();
  vi.setSystemTime(start+120000);await expect(cltBankOnce(db,'tenant-a','facta',['AUTHORIZE','other'],fail,{root:'b',confirmedMissing:true})).rejects.toMatchObject({writeUncertain:true});expect(fail).toHaveBeenCalledOnce();
});
it('refreshes Nossa OAuth once for a documented read-only POST, but never replays an authorization write',async()=>{
  const db:any=journeyDatabase();vi.spyOn(Nossa,'getConfig').mockResolvedValue({enabled:true,isConfigured:true} as any);const tokens=vi.spyOn(Nossa,'token').mockResolvedValueOnce('synthetic-old').mockResolvedValue('synthetic-new');
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({error:'expired'},{status:401})).mockResolvedValueOnce(Response.json({status:'AUTHORIZED'}));vi.stubGlobal('fetch',fetcher);
  expect((await run(()=>Nossa.request(db,'tenant-a','POST','/clt-loan/v1/check-authorization',{document_number:customer.cpf,service_type:'qi'}))).success).toBe(true);expect(tokens).toHaveBeenLastCalledWith(db,'tenant-a',true);expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockReset().mockResolvedValue(Response.json({error:'expired'},{status:401}));await run(()=>Nossa.request(db,'tenant-a','POST','/clt-loan/v1/request-authorization',{}));expect(fetcher).toHaveBeenCalledTimes(1);
});
it('requests Nossa QI and UY3 independently once, exposes real returned links and only reads while pending',async()=>{
  const db:any=journeyDatabase();vi.spyOn(Nossa,'getConfig').mockResolvedValue({enabled:true,isConfigured:true} as any);
  let approved=false;
  const calls=vi.spyOn(Nossa,'request').mockImplementation(async(_db,_tenant,_method,path,body:any)=>{
    const data=path.endsWith('banking-institutions')?['qi','uy3']:path.endsWith('request-authorization')?{status:'PENDING',authorization_link:'https://signature.example.invalid/'+body.service_type}:path.endsWith('check-authorization')?{status:approved&&body.service_type==='qi'?'AUTHORIZED':approved?'PENDING':'NOT_FOUND'}:path.endsWith('check-employee-enrollment')?[{employer_cnpj:'00000000000191'}]:{margin_key:'synthetic-margin',can_continue:true,available_balance:300};
    return {success:true,status:200,data} as any;
  });
  const initial=await run(()=>Sim.run(db,'tenant-a','CLT','REFRESH',customer,undefined,['nossa']));
  expect(initial.rows).toHaveLength(2);expect(initial.rows.every((r:any)=>r.outcome==='AUTHORIZATION_REQUIRED'&&r.link?.startsWith('https://signature.example.invalid/'))).toBe(true);
  await run(()=>Sim.run(db,'tenant-a','CLT','REFRESH',customer,undefined,['nossa']));
  expect(calls.mock.calls.filter(c=>c[3].endsWith('request-authorization'))).toHaveLength(2);
  const sent=calls.mock.calls.find(c=>c[3].endsWith('request-authorization'))![4];expect(sent).toEqual({document_number:customer.cpf,service_type:'qi',person_name:customer.name,country_code:'55',area_code:'11',phone_number:'999999999',notification_method:'sms'});
  approved=true;
  const update=await run(()=>Sim.run(db,'tenant-a','CLT','REFRESH',{...customer,observeOnly:true,automaticAuthorization:false},undefined,['nossa']));
  expect(update.rows.find((r:any)=>r.institution==='qi')?.state).toBe('DATA');expect(update.rows.find((r:any)=>r.institution==='uy3')?.outcome).toBe('AUTHORIZATION_REQUIRED');
  expect(calls.mock.calls.filter(c=>c[3].endsWith('request-authorization'))).toHaveLength(2);expect(fetch).not.toHaveBeenCalled();
});
it('distinguishes FACTA customer token expiration from OAuth and sends one controlled SMS through Oracle',async()=>{
  const db:any=journeyDatabase();vi.stubEnv('FACTA_GATEWAY_URL','https://oracle.example.invalid/facta');vi.stubEnv('FACTA_GATEWAY_SECRET','synthetic-gateway-secret');
  vi.spyOn(FactaBank,'getTenantConfig').mockResolvedValue({isConfigured:true,simulationEnabled:true,baseUrl:FactaBank.PRODUCTION_BASE_URL} as any);vi.spyOn(FactaBank,'getToken').mockResolvedValue('synthetic-api-token');const invalidate=vi.spyOn(FactaBank,'invalidateTokenCache').mockImplementation(()=>{});
  const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url,init:any)=>{expect(String(url)).toBe('https://oracle.example.invalid/facta');const input=JSON.parse(init.body);calls.push(input);return input.method==='POST'?Response.json({erro:false,mensagem:'Solicitação enviada'}):Response.json({erro:true,mensagem:'Token expirado; necessário /solicita-autorizacao-consulta'});}));
  const result=await run(()=>Facta.product(db,'tenant-a','CLT','REFRESH',customer));expect(result[0].outcome).toBe('AUTHORIZATION_REQUIRED');expect((result[0].data as any).authorization.status).toBe('REQUESTED');
  await run(()=>Facta.product(db,'tenant-a','CLT','REFRESH',{...customer,observeOnly:true}));
  expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);const sms=calls.find(c=>c.method==='POST');expect(new URL(sms.url).pathname).toBe('/solicita-autorizacao-consulta');expect(new URLSearchParams(sms.body).get('tipo_envio')).toBe('SMS');expect(invalidate).not.toHaveBeenCalled();
});
it('renews an actual FACTA API 401 once on GET and never reuses that token',async()=>{
  const db:any=journeyDatabase();vi.stubEnv('FACTA_GATEWAY_URL','https://oracle.example.invalid/facta');vi.stubEnv('FACTA_GATEWAY_SECRET','synthetic-gateway-secret');vi.spyOn(FactaBank,'getTenantConfig').mockResolvedValue({isConfigured:true,simulationEnabled:true,baseUrl:FactaBank.PRODUCTION_BASE_URL} as any);
  vi.spyOn(FactaBank,'getToken').mockResolvedValueOnce('synthetic-old-token').mockResolvedValueOnce('synthetic-new-token');const invalidate=vi.spyOn(FactaBank,'invalidateTokenCache').mockImplementation(()=>{});
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({error:'expired'},{status:401})).mockResolvedValueOnce(Response.json({dados_trabalhador:{dados:[]}}));vi.stubGlobal('fetch',fetcher);
  await run(()=>Facta.product(db,'tenant-a','CLT','REFRESH',customer));expect(invalidate).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledTimes(2);expect(JSON.parse(fetcher.mock.calls[1][1].body).headers.authorization).toBe('Bearer synthetic-new-token');
});
it('creates a complete owned V8 consultation when only unowned external consultations exist, without auto-authorizing',async()=>{
  const db:any=journeyDatabase(),seen:any[]=[];vi.spyOn(V8,'run').mockImplementation(async(_db,_tenant,action,input)=>{seen.push({action,input});return action==='REFRESH'?[{provider:'V8 DIGITAL',institution:'V8',state:'PENDING',outcome:'MISSING_DATA',data:{v8:{promoterId:'p-a',nextAction:'CREATE_CONSULT'}}}]:[{provider:'V8 DIGITAL',institution:'V8',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',data:{v8:{consultId:'synthetic-consult',status:'WAITING_CONSENT'}}}];});
  const response=await run(()=>Sim.run(db,'tenant-a','CLT','REFRESH',customer,undefined,['v8']));expect(seen.map(s=>s.action)).toEqual(['REFRESH','CREATE_CONSULT']);expect(seen[1].input).toMatchObject({v8BirthDate:'1990-02-28',v8Email:'synthetic@example.invalid',v8Gender:'male',name:customer.name,cpf:customer.cpf,phone:customer.phone});expect(response.rows[0].outcome).toBe('AUTHORIZATION_REQUIRED');expect(fetch).not.toHaveBeenCalled();
});
it('never creates a V8 consultation during a read-only refresh or from a raw untrusted automation flag',async()=>{
  const db:any=journeyDatabase(),spy=vi.spyOn(V8,'run').mockResolvedValue([{provider:'V8',institution:'V8',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED'}]);
  await run(()=>Sim.run(db,'tenant-a','CLT','REFRESH',{...customer,observeOnly:true},undefined,['v8']));await Sim.run(db,'tenant-a','CLT','REFRESH',customer,undefined,['v8']);expect(spy.mock.calls.map(c=>c[2])).toEqual(['REFRESH','REFRESH']);
});
it('preserves confirmed FINANTO ineligibility and its reason without requesting a term or financial calculation',async()=>{
  const db:any=journeyDatabase();vi.spyOn(Finanto,'getConfig').mockResolvedValue({enabled:true,isConfigured:true} as any);const spy=vi.spyOn(Finanto,'request').mockResolvedValue({success:true,data:{id:'synthetic-simulation',eligible:false,messages:['Vínculo inelegível por política bancária']}} as any);
  const response=await run(()=>Sim.run(db,'tenant-a','CLT','REFRESH',customer,undefined,['finanto']));expect(response.rows).toHaveLength(2);expect(response.rows.every((r:any)=>r.outcome==='INELIGIBLE'&&r.message.includes('política'))).toBe(true);expect(spy.mock.calls.every(c=>c[3].includes('/providers/'))).toBe(true);
});
it('sends BMG SMS once with the initial phone and waits for the actual OTP before eligibility',async()=>{
  const db:any=journeyDatabase();db.promoter={findMany:async()=>[{id:'dg',name:'DG'}]};vi.spyOn(Bmg,'config').mockResolvedValue({enabled:true} as any);
  const calls=vi.spyOn(Bmg,'request').mockImplementation(async(_db,_tenant,_method,path)=>path==='/v1/sms/otp'?{verificationToken:'synthetic-verification'}:path==='/v1/sms/validar'?{session_token:'synthetic-session'}:{elegivel:true});
  expect(await Bmg.cltAuthorization(db,'tenant-a','user:a',customer,true)).toMatchObject({status:'WAITING_OTP'});await Bmg.cltAuthorization(db,'tenant-a','user:a',customer,true);expect(calls).toHaveBeenCalledTimes(1);expect(calls.mock.calls[0][4]).toEqual({cpf:customer.cpf,celular:customer.phone});
  expect(await Bmg.cltAuthorization(db,'tenant-a','user:b',customer,false)).toMatchObject({status:'MISSING'});
  await Bmg.verifyOtp(db,'tenant-a','user:a',customer.cpf,'123456');expect(await Bmg.cltAuthorization(db,'tenant-a','user:a',customer,false)).toMatchObject({status:'APPROVED',ready:true});expect(calls.mock.calls.filter(c=>c[3]==='/v1/sms/otp')).toHaveLength(1);
});
it('holds a durable concurrent/uncertain bank reservation without another POST and isolates tenants',async()=>{
  const db=journeyDatabase();let release!:()=>void;const wait=new Promise<void>(r=>release=r),send=vi.fn(async()=>{await wait;return {accepted:true};});
  const first=cltBankOnce(db,'tenant-a','facta',['AUTHORIZE',customer.cpf],send);await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());await expect(cltBankOnce(db,'tenant-a','facta',['AUTHORIZE',customer.cpf],send)).rejects.toMatchObject({writeUncertain:true});release();await first;await cltBankOnce(db,'tenant-a','facta',['AUTHORIZE',customer.cpf],send);expect(send).toHaveBeenCalledOnce();
  const fail=vi.fn().mockRejectedValue(Error('synthetic timeout'));await expect(cltBankOnce(db,'tenant-a','facta',['OTHER'],fail)).rejects.toMatchObject({writeUncertain:true});await expect(cltBankOnce(db,'tenant-a','facta',['OTHER'],fail)).rejects.toMatchObject({writeUncertain:true});expect(fail).toHaveBeenCalledOnce();await cltBankOnce(db,'tenant-b','facta',['OTHER'],async()=>({ok:true}));
});
it('enforces the BMG SMS quota with persistent CAS',async()=>{const db=journeyDatabase();for(let i=0;i<5;i++)await reserveCltSms(db,'tenant-a','user:a');await expect(reserveCltSms(db,'tenant-a','user:a')).rejects.toThrow('Limite');await expect(reserveCltSms(db,'tenant-a','user:b')).resolves.toBeUndefined();});
it('prices Nossa institutions independently and never recalculates QI when UY3 becomes authorized',async()=>{
  const db:any=journeyDatabase();let uy3=false;vi.spyOn(Nossa,'getConfig').mockResolvedValue({enabled:true,isConfigured:true} as any);
  const api=vi.spyOn(Nossa,'request').mockImplementation(async(_db,_tenant,_method,path,body:any)=>{
    const service=body?.service_type||new URLSearchParams(path.split('?')[1]).get('service_type');
    const data=path.endsWith('banking-institutions')?['qi','uy3']:path.endsWith('check-authorization')?{status:service==='qi'||uy3?'AUTHORIZED':'PENDING'}:path.endsWith('check-employee-enrollment')?[{employer_cnpj:'00000000000191'}]:path.endsWith('get-margin')?{margin_key:'margin-'+service,can_continue:true,available_balance:300}:path.includes('list-rebates')?[{cod_tabela:'table-'+service,name:'Tabela sintética',number_of_installments:12}]:{simulation_key:'synthetic-'+service,disbursement_amount:1000,num_periods:12,schedule:[{payment:300}],interest_rate:0.04};
    return {success:true,status:200,data} as any;
  });
  const first=await run(()=>Sim.run(db,'tenant-a','CLT','SIMULATE',customer,undefined,['nossa']));expect(first.rows.filter(r=>r.state==='OFFER')).toHaveLength(1);uy3=true;
  const second=await run(()=>Sim.run(db,'tenant-a','CLT','SIMULATE',customer,undefined,['nossa']));expect(second.rows.filter(r=>r.state==='OFFER')).toHaveLength(2);const calculations=api.mock.calls.filter(c=>c[3].endsWith('simulate-loan'));expect(calculations).toHaveLength(2);expect(calculations.map(c=>(c[4] as any).service_type).sort()).toEqual(['qi','uy3']);
});
it('allows another bank to progress when a different bank has an uncertain write, without retrying that uncertain bank',async()=>{
  const db=journeyDatabase(),service=new CltJourneyService(),id='00000000-0000-4000-8000-000000000041';vi.spyOn(service,'available').mockResolvedValue([{id:'facta',name:'FACTA'},{id:'bmg',name:'BMG'}]);vi.spyOn(Sim,'run').mockImplementation(async(_db,_tenant,_p,_a,_input,_cb,providers)=>({message:undefined,rows:providers?.[0]==='facta'?[{provider:'FACTA',institution:'FACTA',state:'ERROR',data:{writeUncertain:true}}]:[{provider:'BMG',institution:'BMG',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED'}]}));
  const entry=await service.start(db,'tenant-a','user:a',id,customer);await service.execute(db,'tenant-a','user:a',entry,customer);expect(entry.record.phase).toBe('UNKNOWN');
  await expect(service.start(db,'tenant-a','user:a','00000000-0000-4000-8000-000000000042',customer,'bmg','SIMULATE',id)).resolves.toBeDefined();
  await expect(service.start(db,'tenant-a','user:a','00000000-0000-4000-8000-000000000043',customer,'facta','SIMULATE',id)).rejects.toThrow('CONFLICT');
});
it('does not reuse another user BMG quote even when a caller deliberately reuses the same root UUID and customer',async()=>{
  const db=journeyDatabase(),service=new CltJourneyService(),id='00000000-0000-4000-8000-000000000071';vi.spyOn(service,'available').mockResolvedValue([{id:'bmg',name:'BMG'}]);
  const api=vi.spyOn(Sim,'run').mockImplementation(async(_db,_tenant,_product,action,input)=>({message:undefined,rows:input.bmgActorId==='user:a'?(action==='REFRESH'?[{provider:'BMG',institution:'BMG',state:'DATA',data:{authorization:{ready:true}}}]:[{provider:'BMG',institution:'BMG',state:'OFFER',amount:2000}]):[{provider:'BMG',institution:'BMG',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED'}]}));
  const a=await service.start(db,'tenant-a','user:a',id,customer);await service.execute(db,'tenant-a','user:a',a,customer);expect(a.snapshot.results.bmg.rows.some(r=>r.state==='OFFER')).toBe(true);
  const b=await service.start(db,'tenant-a','user:b',id,customer);await service.execute(db,'tenant-a','user:b',b,customer);
  const manual=await service.start(db,'tenant-a','user:b','00000000-0000-4000-8000-000000000072',customer,'bmg','SIMULATE',id);await service.execute(db,'tenant-a','user:b',manual,customer,'SIMULATE','bmg');
  expect(api.mock.calls.some(c=>c[3]==='SIMULATE'&&c[4].bmgActorId==='user:b')).toBe(true);expect(manual.snapshot.results.bmg.rows.some(r=>r.state==='OFFER')).toBe(false);
});
it('observes live bank state without authorization POSTs and exposes only owned non-personal history metadata',async()=>{
  const db=journeyDatabase(),service=new CltJourneyService(),id='00000000-0000-4000-8000-000000000021';vi.spyOn(service,'available').mockResolvedValue([{id:'facta',name:'FACTA'}]);const api=vi.spyOn(Sim,'run').mockResolvedValue({rows:[{provider:'FACTA',institution:'FACTA',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED'}],message:undefined});
  const entry=await service.start(db,'tenant-a','user:a',id,customer);await service.execute(db,'tenant-a','user:a',entry,customer);
  api.mockResolvedValue({rows:[{provider:'FACTA',institution:'FACTA',state:'DATA',data:{margin:{available_balance:300,can_continue:true}}}],message:undefined});
  const result=await service.observe(db,'tenant-a','user:a',id,'facta',true);expect(result?.results.facta.readyToSimulate).toBe(true);expect(api.mock.calls.at(-1)?.[4]).toMatchObject({observeOnly:true,automaticAuthorization:false});expect(api.mock.calls.every(c=>c[3]==='REFRESH')).toBe(true);
  expect(await service.history(db,'tenant-a','user:b')).toEqual([]);expect(await service.history(db,'tenant-b','user:a')).toEqual([]);const history=await service.history(db,'tenant-a','user:a');expect(history).toHaveLength(1);expect(JSON.stringify(history)).not.toContain(customer.cpf);expect(JSON.stringify(db.rows)).not.toContain(customer.v8Email);
});
it.each(['qi','uy3'])('reuses %s official authorization even on an explicit AUTHORIZE action and retrieves margin',async institution=>{
 const db:any=journeyDatabase();vi.spyOn(Nossa,'getConfig').mockResolvedValue({enabled:true,isConfigured:true} as any);
 const api=vi.spyOn(Nossa,'request').mockImplementation(async(_db,_tenant,_method,path)=>({success:true,status:200,data:path.endsWith('banking-institutions')?[institution]:path.endsWith('check-authorization')?{data:{status:' authorized '}}:path.endsWith('check-employee-enrollment')?[{employer_cnpj:'00000000000191'}]:{margin_key:'synthetic-margin',can_continue:true,available_balance:300}} as any));
 const result=await run(()=>Sim.run(db,'tenant-a','CLT','AUTHORIZE',customer,undefined,['nossa']));
 expect(result.rows.some(r=>r.state==='DATA')).toBe(true);expect(api.mock.calls.some(c=>c[3].endsWith('get-margin'))).toBe(true);expect(api.mock.calls.some(c=>c[3].endsWith('request-authorization'))).toBe(false);
});
it('does not create another link when official status is unavailable',async()=>{
 const db:any=journeyDatabase();vi.spyOn(Nossa,'getConfig').mockResolvedValue({enabled:true,isConfigured:true} as any);
 const api=vi.spyOn(Nossa,'request').mockImplementation(async(_db,_tenant,_method,path)=>path.endsWith('banking-institutions')?{success:true,status:200,data:['qi','uy3']}:{success:false,status:404,error:'Unavailable'} as any);
 const result=await run(()=>Sim.run(db,'tenant-a','CLT','AUTHORIZE',customer,undefined,['nossa']));expect(result.rows).toHaveLength(2);expect(result.rows.every(r=>(r.data as any).authorization.status==='UNCONFIRMED')).toBe(true);expect(api.mock.calls.some(c=>c[3].endsWith('request-authorization'))).toBe(false);
});
it('preserves historical Nossa UNKNOWN reservations across this release and does not resend',async()=>{
 const db:any=journeyDatabase();await expect(cltBankOnce(db,'tenant-a','nossa',['AUTHORIZE',customer.cpf,'qi'],async()=>{throw Error('old timeout');})).rejects.toThrow();
 vi.spyOn(Nossa,'getConfig').mockResolvedValue({enabled:true,isConfigured:true} as any);const api=vi.spyOn(Nossa,'request').mockImplementation(async(_db,_tenant,_method,path)=>({success:true,status:200,data:path.endsWith('banking-institutions')?['qi']:{status:'NOT_FOUND'}} as any));
 await run(()=>Sim.run(db,'tenant-a','CLT','AUTHORIZE',customer,undefined,['nossa']));expect(api.mock.calls.some(c=>c[3].endsWith('request-authorization'))).toBe(false);
});
