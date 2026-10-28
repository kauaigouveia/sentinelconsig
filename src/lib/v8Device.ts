export type V8Device = {operationalSystem:string;deviceModel:string;deviceName:string;deviceType:string};
/** Only values actually exposed by the browser. No invented PC/model/hostname. */
export async function readV8Device(browser: Pick<Navigator,'platform'|'userAgent'> & {userAgentData?:{platform?:string;mobile?:boolean;getHighEntropyValues?:(hints:string[])=>Promise<{platform?:string;model?:string;formFactors?:string[]}>}}):Promise<V8Device> {
  let hints:{platform?:string;model?:string;formFactors?:string[]}={};
  try{hints=await browser.userAgentData?.getHighEntropyValues?.(['platform','model','formFactors'])||{};}catch{}
  const factors=hints.formFactors||[];
  const deviceType=factors.includes('Tablet')?'tablet':factors.includes('Mobile')?'mobile':factors.includes('Desktop')?'desktop':browser.userAgentData?.mobile===true?'mobile':'';
  return {operationalSystem:hints.platform||browser.userAgentData?.platform||browser.platform||'',deviceModel:hints.model||'',deviceName:'',deviceType};
}
