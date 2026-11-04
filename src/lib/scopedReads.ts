/** Read-only, process-local optimization. Keys always include user, tenant and permissions. */
export class ScopedReads {
 private scope=''; private epoch=0; private active=0;
 private waiting:(()=>void)[]=[];
 private cache=new Map<string,{until:number;value:unknown}>();
 private pending=new Map<string,Promise<unknown>>();
 private controllers=new Set<AbortController>();
 get version(){return this.epoch;}
 activate(scope:string){if(scope!==this.scope){this.reset();this.scope=scope;}}
 reset(){this.epoch++;for(const controller of this.controllers)controller.abort();this.cache.clear();this.pending.clear();}
 async read(scope:string,url:string,force=false):Promise<any>{
  this.activate(scope);const epoch=this.epoch,key=scope+'|'+url;
  if(!force){const hit=this.cache.get(key);if(hit&&hit.until>Date.now())return hit.value;}
  const previous=this.pending.get(key);if(previous)return previous;
  const controller=new AbortController();this.controllers.add(controller);
  const current=()=>this.epoch===epoch&&!controller.signal.aborted;
  const promise=(async()=>{
   if(this.active>=4)await new Promise<void>(resolve=>this.waiting.push(resolve));
   if(!current()){this.waiting.shift()?.();throw new DOMException('Context changed','AbortError');}
   this.active++;
   try{const response=await fetch(url,{credentials:'include',signal:controller.signal});if(!response.ok)return null;
    const value=await response.json();if(!current())throw new DOMException('Context changed','AbortError');
    this.cache.set(key,{value,until:Date.now()+30000});return value;
   }finally{this.active--;this.waiting.shift()?.();}
  })().finally(()=>{this.controllers.delete(controller);if(this.pending.get(key)===promise)this.pending.delete(key);});
  this.pending.set(key,promise);return promise;
 }
}
export const scopedReads=new ScopedReads();
export const LEGACY_SYNC_ENDPOINTS=['/api/clients','/api/proposals','/api/tasks','/api/notifications','/api/banks','/api/promoters','/api/partners','/api/products','/api/convenios?includeInactive=true','/api/operational-rules','/api/bank-promoters','/api/whitelabel','/api/documents','/api/financial','/api/audit-logs','/api/users','/api/tenants'];
/** Unknown routes retain the complete legacy data set until their consumers are migrated. */
export function syncEndpoints(path:string):string[]{
 if(/^\/(login|parceiro)(\/|$)/.test(path))return [];
 if(/^\/(integracoes|saude-apis|bancos-promotoras|empresas-assinaturas|meu-plano|crm-parceiros)(\/|$)/.test(path))return ['/api/promoters','/api/users','/api/whitelabel'];
 return LEGACY_SYNC_ENDPOINTS;
}
