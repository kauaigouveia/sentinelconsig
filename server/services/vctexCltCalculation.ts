import {calculationDiagnostic,type CltCalculationDiagnostic} from '../../src/lib/cltCalculationDiagnostic.js';
import {currentVctexEmployments,vctexConsultationRows} from '../../src/lib/vctexCurrentState.js';
import {validateVctexInstallments} from './vctexContract.js';
import {VctexBankService,VctexError} from './vctexBankService.js';
import type {ProductSimulationInput,ProductSimulationRow} from './productSimulationService.js';
export async function observeVctexConditions(db:any,tenant:string,input:ProductSimulationInput):Promise<ProductSimulationRow[]>{
  if(!input.bmgActorId||!input.v8Email)return [];
  const rows:ProductSimulationRow[]=[];
  for(const p of await db.promoter.findMany({where:{tenantId:tenant,status:'ATIVO'},select:{id:true}})){
    const c=await VctexBankService.config(db,tenant,p.id);if(!c.enabled||!c.cpf||!c.password)continue;
    const value=await VctexBankService.refresh(db,tenant,input.bmgActorId,p.id,{cpf:input.cpf,name:input.name,phone:input.phone,email:input.v8Email},false,true);
    rows.push(...vctexConsultationRows(value,p.id));
  }return rows;
}
export async function calculateVctexConditions(db:any,tenant:string,input:ProductSimulationInput):Promise<ProductSimulationRow[]>{
  const rejected:any[]=[],diagnostics:CltCalculationDiagnostic[]=[];const rows:ProductSimulationRow[]=[],row=(message:string,outcome:ProductSimulationRow['outcome']='MISSING_DATA'):ProductSimulationRow=>({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'PENDING',outcome,message});
  const finish=()=>{if(diagnostics.length&&rows.length){const last=rows[rows.length-1];last.data={...(last.data as Record<string,unknown>||{}),calculationDiagnostics:diagnostics};}if(rejected.length)rows.push({...row(rows.some(r=>r.state==='OFFER')?'Algumas condições não estão disponíveis para este vínculo':'Nenhuma oferta disponível para os parâmetros informados','PENDING'),data:{vctex:{conditionRejections:rejected}}});return rows;};
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
        if(!rates.length)diagnostics.push(calculationDiagnostic('vctex',input,input.term||0,'NO_ACTIVE_RATES'));
        for(const rate of rates){
          const terms=rate.allowedInstallments.filter(term=>!input.term||term===input.term);
          if(!terms.length)diagnostics.push(calculationDiagnostic('vctex',input,input.term||0,'TERM_UNAVAILABLE'));
          if(!terms.length)rows.push(row('VCTEX: o prazo solicitado não está disponível nesta tabela.'));
          for(const term of terms)try{
            // The same contract validator used by the bank service, before any simulation call.
            // Unknown limits in legacy adapters are still checked by the service itself.
            if(Number.isFinite(rate.minInstallmentAmount)&&Number.isFinite(rate.maxInstallmentAmount))try{validateVctexInstallments(rate,employment.availableMarginValue,term,input.value);}catch{diagnostics.push({...calculationDiagnostic('vctex',input,term,'OUTSIDE_LIMITS'),limits:{margin:employment.availableMarginValue,minimum:rate.minInstallmentAmount,maximum:rate.maxInstallmentAmount}});rejected.push({connectionId:promoter.id,consultationId:current.preOperationId,employmentId:employment.employmentId,offerId:rate.id,term,installment:input.value,code:'OUTSIDE_LIMITS'});continue;}

            const quote=await VctexBankService.simulate(db,tenant,input.bmgActorId,promoter.id,identity,{employmentId:employment.employmentId,offerId:rate.id,term,installment:input.value});
            if(quote.installment>input.value+0.005||quote.term!==term)throw Error('Oferta VCTEX fora dos parâmetros solicitados.');
            diagnostics.push(calculationDiagnostic('vctex',input,term,(quote.data as any)?.operationCache?.cached?'CACHED':'OFFER',(quote.data as any)?.transportStatus,1,1));
            rows.push({...quote,origin:{providerId:'vctex',connectionId:promoter.id,consultationId:current.preOperationId}});
          }catch(e){
            if(e instanceof Error&&/^Prazo ou parcela fora dos limites/.test(e.message)){rejected.push({connectionId:promoter.id,consultationId:current.preOperationId,employmentId:employment.employmentId,offerId:rate.id,term,installment:input.value,code:'OUTSIDE_LIMITS'});continue;}
            diagnostics.push(calculationDiagnostic('vctex',input,term,e instanceof VctexError&&[400,422].includes(e.status)?'BANK_REJECTED':'API_ERROR',e instanceof VctexError?e.status:undefined));
            const uncertain=(e as any)?.writeUncertain===true||e instanceof Error&&/UNKNOWN|incerto/i.test(e.message);
            rows.push({...row(e instanceof VctexError&&[400,422].includes(e.status)?'A VCTEX rejeitou esta condição. Outras tabelas elegíveis continuam sendo verificadas.':e instanceof Error&&/^(Prazo ou parcela|Vínculo VCTEX|Oferta VCTEX)/.test(e.message)?e.message:'VCTEX: não foi possível calcular esta condição. Confira o acompanhamento antes de repetir.',e instanceof VctexError&&[400,422].includes(e.status)?'PENDING':'TECHNICAL_ERROR'),data:{writeUncertain:uncertain}});
            if(uncertain)return finish();
          }
        }
      }
    }catch{rows.push(row('VCTEX: consulta existente indisponível ou resultado incerto. Nenhuma autorização foi reenviada.','TECHNICAL_ERROR'));}
  }return finish();
}
