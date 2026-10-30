import {CltJourneyStore,journeyFingerprint,type JourneyRecord} from './cltJourneyStore.js';
import {resolveBankPromoter,currentIntegrationPromoter} from './bankPromoterConfig.js';
type AttemptRecord=JourneyRecord&{attempts?:number};
async function context(db:any,tenant:string,actor:string,cpf:string,expires:number){
 const promoter=await resolveBankPromoter(db,tenant,currentIntegrationPromoter(),'DG');
 return {store:new CltJourneyStore(db,tenant,'bank:bmg-otp-attempts:'+promoter.id+':'+actor),id:'bmg-otp-attempts:'+journeyFingerprint([cpf,expires])};
}
export async function otpAttempts(db:any,tenant:string,actor:string,cpf:string,expires:number){const {store,id}=await context(db,tenant,actor,cpf,expires);return ((await store.read(id))?.record as AttemptRecord|undefined)?.attempts||0;}
export async function consumeOtpAttempt(db:any,tenant:string,actor:string,cpf:string,expires:number){
 const {store,id}=await context(db,tenant,actor,cpf,expires);await store.create(id,{fingerprint:id,phase:'DONE',deadline:expires,snapshot:{executionId:id,running:false,banks:[],results:{}}});
 for(let attempt=0;attempt<5;attempt++){const saved=await store.read(id);if(!saved)throw Error('Não foi possível reservar a validação BMG.');const record=saved.record as AttemptRecord;if((record.attempts||0)>=3)throw Object.assign(Error('Limite de três tentativas atingido. Solicite um novo SMS.'),{code:'BMG_OTP_ATTEMPTS_EXCEEDED'});record.attempts=(record.attempts||0)+1;try{await store.compareAndSet(id,saved.raw,record);return;}catch{}}
 throw Error('Validações BMG concorrentes. Aguarde antes de tentar novamente.');
}
