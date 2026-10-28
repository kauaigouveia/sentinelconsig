import {CltJourneyStore,journeyFingerprint,type JourneyRecord} from './cltJourneyStore.js';
import {currentIntegrationPromoter} from './bankPromoterConfig.js';
export function nossaAuthorization(raw:any,identity:{document_number:string;service_type:string}) {
  const root=raw?.data&&typeof raw.data==='object'&&typeof raw.data.status==='string'?raw.data:raw;
  if(root!==raw&&typeof raw?.status==='string'&&raw.status.trim().toUpperCase()!==root.status.trim().toUpperCase())throw Error('Estado de autorização ambíguo. Atualize a consulta oficial.');
  if(root!==raw&&(raw?.document_number&&String(raw.document_number).replace(/\D/g,'')!==identity.document_number||raw?.service_type&&raw.service_type!==identity.service_type))throw Error('Autorização retornada para outra identidade ou instituição.');
  if(root?.document_number&&String(root.document_number).replace(/\D/g,'')!==identity.document_number||root?.service_type&&root.service_type!==identity.service_type)throw Error('Autorização retornada para outra identidade ou instituição.');
  const status=typeof root?.status==='string'?root.status.trim().toUpperCase():'UNCONFIRMED';
  const recognized=['AUTHORIZED','PENDING','REQUESTED','REJECTED','DENIED','EXPIRED','NOT_FOUND','NOT_REQUESTED','NONE'].includes(status)?status:'UNCONFIRMED';
  return {status:recognized,authorization_link:typeof root?.authorization_link==='string'&&/^https:\/\//i.test(root.authorization_link)?root.authorization_link:undefined,
    authorizationId:typeof root?.authorization_id==='string'?root.authorization_id.slice(0,120):undefined};
}
export async function rememberNossaAuthorization(db:any,tenant:string,actor:string|undefined,identity:{document_number:string;service_type:string},value:ReturnType<typeof nossaAuthorization>,source:'API'|'REQUEST'='API') {
  if(!actor)return {...value,source,previousStatus:undefined,observedAt:new Date().toISOString()};
  const promoter=currentIntegrationPromoter()||'legacy-dg',id=journeyFingerprint([identity,actor,promoter]),store=new CltJourneyStore(db,tenant,'nossa-authorization:'+actor);
  for(let attempt=0;attempt<3;attempt++){
    const old=await store.read(id),previous=(old?.record as any)?.authorization;
    const result={...value,authorization_link:value.status==='AUTHORIZED'||['REJECTED','DENIED','EXPIRED'].includes(value.status)?undefined:value.authorization_link||previous?.authorization_link,authorizationId:source==='REQUEST'?value.authorizationId:value.authorizationId||previous?.authorizationId,source,previousStatus:previous?.status,observedAt:new Date().toISOString()};
    const record:JourneyRecord & {authorization:typeof result}={fingerprint:id,phase:'DONE',deadline:Date.now(),snapshot:{executionId:id,running:false,banks:[],results:{}},authorization:result};
    if(!old){if(await store.create(id,record))return result;}
    else try{await store.compareAndSet(id,old.raw,record);return result;}catch{}
  }
  throw Error('Acompanhamento concorrente. Atualize a consulta; nenhuma autorização nova foi solicitada.');
}
