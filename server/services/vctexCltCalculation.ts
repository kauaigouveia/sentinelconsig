import {currentVctexEmployments} from '../../src/lib/vctexCurrentState.js';
import {validateVctexInstallments} from './vctexContract.js';
import {VctexBankService} from './vctexBankService.js';
import type {ProductSimulationInput,ProductSimulationRow} from './productSimulationService.js';
export async function observeVctexConditions(db:any,tenant:string,input:ProductSimulationInput):Promise<ProductSimulationRow[]>{
  if(!input.bmgActorId||!input.v8Email)return [];
  const rows:ProductSimulationRow[]=[];
  for(const p of await db.promoter.findMany({where:{tenantId:tenant,status:'ATIVO'},select:{id:true}})){
    const c=await VctexBankService.config(db,tenant,p.id);if(!c.enabled||!c.cpf||!c.password)continue;
    const value=await VctexBankService.refresh(db,tenant,input.bmgActorId,p.id,{cpf:input.cpf,name:input.name,phone:input.phone,email:input.v8Email},false);
    rows.push({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'PENDING',outcome:value.authorizationValid?'PENDING':'AUTHORIZATION_REQUIRED',message:value.label,data:{vctex:{connectionId:p.id,preOperationId:value.preOperationId},authorization:{status:value.authorizationValid?'AUTHORIZED':undefined},observedAt:new Date().toISOString()}});
    for(const e of currentVctexEmployments<any>(value.employments))rows.push({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'DATA',data:{margin:{available_balance:e.availableMarginValue,can_continue:e.eligible},vctex:{connectionId:p.id,preOperationId:value.preOperationId,employmentId:e.employmentId,employerName:e.employer?.name,registrationNumber:e.registrationNumber},authorization:{status:value.authorizationValid?'AUTHORIZED':undefined},observedAt:new Date().toISOString()}});
  }return rows;
}
export async function calculateVctexConditions(db:any,tenant:string,input:ProductSimulationInput):Promise<ProductSimulationRow[]>{
  const rejected:any[]=[];const rows:ProductSimulationRow[]=[],row=(message:string,outcome:ProductSimulationRow['outcome']='MISSING_DATA'):ProductSimulationRow=>({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'PENDING',outcome,message});
  const finish=()=>{if(rejected.length)rows.push({...row(rows.some(r=>r.state==='OFFER')?'Algumas condições não estão disponíveis para este vínculo':'Nenhuma oferta disponível para os parâmetros informados','PENDING'),data:{vctex:{conditionRejections:rejected}}});return rows;};
  if(!input.bmgActorId||!input.v8Email)return [row('Recupere os dados da execução antes de calcular VCTEX.')];
  if(input.mode!=='Payment')return [row('VCTEX: o contrato disponível calcula por parcela. Não há conversão documentada de valor liberado para parcela.','UNSUPPORTED')];
  if(!(input.value>0))return [row('Informe uma parcela positiva para calcular condições VCTEX.')];
  const promoters=await db.promoter.findMany({where:{tenantId:tenant,status:'ATIVO'},select:{id:true}});
  for(const promoter of promoters){
    const config=await VctexBankService.config(db,tenant,promoter.id);if(!config.enabled||!config.cpf||!config.password)continue;
    const identity={cpf:input.cpf,name:input.name,phone:input.phone,email:input.v8Email};
    try{
      // Read the persisted ID only. Never create/renew a term or pre-operation for pricing.
      const current=await VctexBankService.refresh(db,tenant,input.bmgActorId,promoter.id,identity,false);
      if(current.status!=='finished'||current.authorizationValid!==true){rows.push(row('Aguarde a autorização oficial VCTEX e a consulta concluída. Nenhum termo foi criado.','AUTHORIZATION_REQUIRED'));continue;}
      for(const employment of currentVctexEmployments<any>(current.employments)){
        rows.push({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'DATA',data:{vctex:{connectionId:promoter.id,preOperationId:current.preOperationId,employmentId:employment.employmentId,employerName:employment.employer?.name,registrationNumber:employment.registrationNumber},authorization:{status:'AUTHORIZED'},margin:{available_balance:employment.availableMarginValue,can_continue:employment.eligible},observedAt:new Date().toISOString()}});
        if(!employment.eligible||!(employment.availableMarginValue>0))continue;
        if(input.value>employment.availableMarginValue){rows.push(row('VCTEX: a parcela solicitada supera a margem oficial deste vínculo.','INELIGIBLE'));continue;}
        const rates=await VctexBankService.rates(db,tenant,input.bmgActorId,promoter.id,identity,employment.employmentId);
        for(const rate of rates){
          const terms=rate.allowedInstallments.filter(term=>!input.term||term===input.term);
          if(!terms.length)rows.push(row('VCTEX: o prazo solicitado não está disponível nesta tabela.'));
          for(const term of terms)try{
            // The same contract validator used by the bank service, before any simulation call.
            // Unknown limits in legacy adapters are still checked by the service itself.
            if(Number.isFinite(rate.minInstallmentAmount)&&Number.isFinite(rate.maxInstallmentAmount))try{validateVctexInstallments(rate,employment.availableMarginValue,term,input.value);}catch{rejected.push({connectionId:promoter.id,consultationId:current.preOperationId,employmentId:employment.employmentId,offerId:rate.id,term,installment:input.value,code:'OUTSIDE_LIMITS'});continue;}

            const quote=await VctexBankService.simulate(db,tenant,input.bmgActorId,promoter.id,identity,{employmentId:employment.employmentId,offerId:rate.id,term,installment:input.value});
            if(quote.installment>input.value+0.005||quote.term!==term)throw Error('Oferta VCTEX fora dos parâmetros solicitados.');
            rows.push(quote);
          }catch(e){
            if(e instanceof Error&&/^Prazo ou parcela fora dos limites/.test(e.message)){rejected.push({connectionId:promoter.id,consultationId:current.preOperationId,employmentId:employment.employmentId,offerId:rate.id,term,installment:input.value,code:'OUTSIDE_LIMITS'});continue;}
            const uncertain=(e as any)?.writeUncertain===true||e instanceof Error&&/UNKNOWN|incerto/i.test(e.message);
            rows.push({...row(e instanceof Error&&/^(Prazo ou parcela|Vínculo VCTEX|Oferta VCTEX)/.test(e.message)?e.message:'VCTEX: não foi possível calcular esta condição. Confira o acompanhamento antes de repetir.','TECHNICAL_ERROR'),data:{writeUncertain:uncertain}});
            if(uncertain)return finish();
          }
        }
      }
    }catch{rows.push(row('VCTEX: consulta existente indisponível ou resultado incerto. Nenhuma autorização foi reenviada.','TECHNICAL_ERROR'));}
  }return finish();
}
