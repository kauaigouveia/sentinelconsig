import type {PrismaClient} from '@prisma/client';
import {PartnerSimulationService} from './partnerSimulationService.js';
import {PartnerSimulationTracking} from './partnerSimulationTracking.js';
import {formatTelegramNativeResults,toTelegramNativeInput,type TelegramNativeDraft} from './telegramNativeSimulation.js';

type Engine=typeof PartnerSimulationService.run;
type Save=typeof PartnerSimulationTracking.record;
/**
 * Execute the same provider routing used by the Partner Portal. No new
 * financial formulas, no direct bank credentials, no creation of a proposal.
 * The Telegram account must be revalidated immediately before and after
 * calling this function by the webhook handler.
 */
export async function executeTelegramNativeSimulation(
  prisma:PrismaClient,
  tenantId:string,
  partner:{id:string;code:string;name:string},
  draft:TelegramNativeDraft,
  attemptKey:string,
  dependencies?:{run?:Engine;record?:Save},
):Promise<{messages:string[];saved:boolean;offerCount:number}>{
  if(!tenantId||!partner?.id||!partner.code||!/^[a-zA-Z0-9-]{16,80}$/.test(attemptKey))
    throw Error('Vínculo de parceiro ou identificador inválido.');
  if(draft.index!==((await import('./telegramNativeSimulation.js')).telegramNativeSteps(draft).length)||
     draft.expires<Date.now())throw Error('Os dados desta simulação expiraram ou estão incompletos.');
  const input=toTelegramNativeInput(draft,partner.id);
  const runner=dependencies?.run||PartnerSimulationService.run;
  const recorder=dependencies?.record||PartnerSimulationTracking.record;
  const result=await runner(prisma,tenantId,input,'SIMULATE');
  const rows=Array.isArray(result?.rows)?result.rows:[];
  const valid=rows.filter((row:any)=>row?.state==='OFFER'&&Number.isFinite(Number(row.amount))&&Number(row.amount)>0);
  let saved=false;
  if(valid.length){
    const history=await recorder(prisma,{
      tenantId,partnerId:partner.id,partnerCode:partner.code,accessName:'Telegram · '+partner.name.slice(0,60),
    },attemptKey,input,valid);
    saved=!!history;
  }
  return {
    messages:formatTelegramNativeResults(rows,draft.product,draft.operation,saved),
    saved,offerCount:valid.length,
  };
}
