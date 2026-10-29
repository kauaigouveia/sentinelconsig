export type V8Device = {operationalSystem:string;deviceModel:string;deviceName:string;deviceType:string};
/** Descriptions identify the environment class, never a manufacturer, hostname or worker signature. */
export async function readV8Device(browser: Pick<Navigator,'platform'|'userAgent'> & {maxTouchPoints?:number;userAgentData?:{platform?:string;mobile?:boolean;getHighEntropyValues?:(hints:string[])=>Promise<{platform?:string;model?:string;formFactors?:string[]}>}}):Promise<V8Device> {
  let hints:{platform?:string;model?:string;formFactors?:string[]}={};
  try{hints=await browser.userAgentData?.getHighEntropyValues?.(['platform','model','formFactors'])||{};}catch{}
  const ua=browser.userAgent||'',platform=hints.platform||browser.userAgentData?.platform||browser.platform||'';
  const ipad=/iPad/i.test(ua)||/MacIntel/i.test(platform)&&(browser.maxTouchPoints||0)>1;
  const os=/Windows|Win32|Win64/i.test(platform+' '+ua)?'Windows':ipad||/iPhone|iPod/i.test(ua)?'iOS':/Android/i.test(platform+' '+ua)?'Android':/Mac/i.test(platform)?'macOS':/Linux|X11/i.test(platform)?'Linux':platform;
  const factors=hints.formFactors||[];
  const deviceType=factors.includes('Tablet')||ipad||/Tablet/i.test(ua)?'tablet':factors.includes('Mobile')||browser.userAgentData?.mobile===true||/Mobile|iPhone|iPod/i.test(ua)?'mobile':factors.includes('Desktop')?'desktop':os==='Android'?'tablet':['Windows','macOS','Linux'].includes(os)?'desktop':'';
  const label=deviceType==='desktop'?'Computador':deviceType==='tablet'?'Tablet':deviceType==='mobile'?'Dispositivo móvel':'';
  return {operationalSystem:os,deviceModel:hints.model||(deviceType==='desktop'?'PC':label),deviceName:label&&os?`${label} ${os}`:'',deviceType};
}
