import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dns from 'node:dns';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
let installed=false;
const ownedPorts=new Set();
const violations=[];
export function consumeIsolationViolations(){return violations.splice(0);}
function deny(kind){violations.push(kind);throw new Error('ISOLATED_TEST_'+kind+'_DENIED');}
const loopback=host=>['127.0.0.1','::1','[::1]','localhost'].includes(String(host||'localhost').toLowerCase());
function target(value){
 if(value instanceof URL||typeof value==='string'){try{const url=new URL(value);return {host:url.hostname,port:Number(url.port||(url.protocol==='https:'?443:80))};}catch{return {host:'',port:0};}}
 return {host:value?.hostname||value?.host||'localhost',port:Number(value?.port||0)};
}
function assertTarget(value){const {host,port}=target(value);if(!loopback(host)||!ownedPorts.has(port))deny('NETWORK');}
export function installIsolation({blockProcesses=true}={}){
 if(installed)return;installed=true;
 const listen=net.Server.prototype.listen;
 net.Server.prototype.listen=function(...args){
  const first=args[0],options=typeof first==='number'?{port:first}:first;
  if(!options||Number(options.port)!==0||options.path)deny('LISTENER');
  this.prependOnceListener('listening',()=>{const address=this.address();if(address&&typeof address!=='string'){ownedPorts.add(address.port);this.once('close',()=>ownedPorts.delete(address.port));}});
  const callback=args.find(arg=>typeof arg==='function');
  // Node 24 resolves even numeric listen hosts asynchronously. Supertest needs
  // address() immediately, so resolve only this numeric loopback synchronously.
  const lookup=dns.lookup;
  dns.lookup=function(host,opts,cb){if(host==='127.0.0.1'){const done=typeof opts==='function'?opts:cb;return opts?.all?done(null,[{address:'127.0.0.1',family:4}]):done(null,'127.0.0.1',4);}return lookup.call(this,host,opts,cb);};
  try{const server=listen.call(this,{...options,host:'127.0.0.1',port:0},...(callback?[callback]:[]));const address=this.address();if(address&&typeof address!=='string'){ownedPorts.add(address.port);this.once('close',()=>ownedPorts.delete(address.port));}return server;}finally{dns.lookup=lookup;}
 };
 const connect=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){
  const normalized=Array.isArray(args[0])?args[0]:args;
  const value=typeof normalized[0]==='object'?normalized[0]:{port:normalized[0],host:typeof normalized[1]==='string'?normalized[1]:'localhost'};
  assertTarget(value);return connect.apply(this,args);
 };
 for(const module of [http,https])for(const method of ['request','get']){const original=module[method];module[method]=function(...args){assertTarget(args[0]);return original.apply(this,args);};}
 const tlsConnect=tls.connect;tls.connect=function(...args){assertTarget(typeof args[0]==='object'?args[0]:{port:args[0],host:args[1]});return tlsConnect.apply(this,args);};
 http2.connect=()=>deny('HTTP2');
 for(const method of ['lookup','resolve','resolve4','resolve6','resolveAny'])if(typeof dns[method]==='function'){const original=dns[method];dns[method]=function(host,...args){if(!loopback(host))deny('DNS');return original.call(this,host,...args);};}
 for(const method of ['lookup','resolve','resolve4','resolve6','resolveAny'])if(typeof dns.promises[method]==='function'){const original=dns.promises[method];dns.promises[method]=async function(host,...args){if(!loopback(host))deny('DNS');return original.call(this,host,...args);};}
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async function(input,init){assertTarget(typeof Request!=='undefined'&&input instanceof Request?input.url:input);return originalFetch(input,init);};
 const sensitive=value=>{let name;try{name=value instanceof URL?fileURLToPath(value):String(value);}catch{return false;}return /(?:^|[\\/])\.env(?:[.\\/]|$)|[\\/]\.(?:azure|aws|vercel)[\\/]|[\\/]gcloud[\\/]/i.test(name);};
 for(const [module,methods] of [[fs,['readFileSync','readFile','openSync','open']],[fsp,['readFile','open']]])for(const method of methods){const original=module[method];module[method]=function(file,...args){if(sensitive(file))deny('CREDENTIAL_FILE');return original.call(this,file,...args);};}
 if(blockProcesses)for(const method of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])child[method]=()=>deny('SUBPROCESS');
 syncBuiltinESMExports();
}
