/** Read-only refresh lifecycle. No provider POSTs, no refresh while hidden, no overlapping reads. */
export function watchIntegrationCatalog(refresh:()=>Promise<unknown>, intervalMs=60000) {
 let stopped=false,busy=false,lastStart=0;
 const run=async(force=false)=>{
  if(stopped||busy||document.visibilityState==='hidden'||(!force&&Date.now()-lastStart<5000))return;
  busy=true;lastStart=Date.now();
  try{await refresh();}catch{/* The caller renders sanitized failures. */}finally{busy=false;}
 };
 const changed=()=>{void run();};
 void run(true);
 const timer=window.setInterval(()=>void run(true),intervalMs);
 window.addEventListener('focus',changed);window.addEventListener('online',changed);
 window.addEventListener('sentinel-integration-status-updated',changed);
 document.addEventListener('visibilitychange',changed);
 return ()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('focus',changed);window.removeEventListener('online',changed);window.removeEventListener('sentinel-integration-status-updated',changed);document.removeEventListener('visibilitychange',changed);};
}
