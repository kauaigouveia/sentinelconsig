import {currentVctexEmployments} from '../../lib/vctexCurrentState';
import type {JourneySnapshot} from '../../lib/cltJourney';
import React,{useEffect,useRef,useState} from 'react';
import {CurrencyInput} from '../common/CurrencyInput';
import type {ProductSimulationRow} from '../../../server/services/productSimulationService';
type Props={visible?:boolean;managedPricing?:boolean;pricingLocked?:boolean;executionId:string;scope:string;active:boolean;onRows:(rows:ProductSimulationRow[],bankResult?:JourneySnapshot['results'][string])=>void};
const control='rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900';
export function VctexCltActions({executionId,scope,active,onRows,visible=true,managedPricing=false,pricingLocked=false}:Props){
  const [connections,setConnections]=useState<{id:string;name:string}[]>([]),[promoter,setPromoter]=useState(''),[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [employment,setEmployment]=useState(''),[rate,setRate]=useState(''),[term,setTerm]=useState(''),[amount,setAmount]=useState(''),[copied,setCopied]=useState(false);
  const lifecycle=useRef(0),controller=useRef<AbortController|null>(null),lock=useRef(false),auto=useRef(new Set<string>()),rowsCallback=useRef(onRows);
  rowsCallback.current=onRows;
  useEffect(()=>{
    const version=++lifecycle.current;controller.current?.abort();lock.current=false;setBusy(false);setData(null);setError('');setPromoter('');setConnections([]);setEmployment('');setRate('');setTerm('');setAmount('');setCopied(false);auto.current.clear();
    if(!active)return;
    const abort=new AbortController();controller.current=abort;
    void fetch('/api/integrations/vctex/connections',{credentials:'include',cache:'no-store',signal:abort.signal}).then(async r=>{const list=await r.json();if(!r.ok||!Array.isArray(list))throw Error(list.error||'Conexões VCTEX indisponíveis.');if(version!==lifecycle.current||abort.signal.aborted)return;setConnections(list);if(list.length===1)setPromoter(list[0].id);}).catch(e=>{if(!abort.signal.aborted&&version===lifecycle.current)setError(e.message);});
    return()=>{lifecycle.current++;abort.abort();controller.current?.abort();};
  },[executionId,scope,active]);
  async function request(action:'start'|'observe'|'simulate',body?:any){
    if(lock.current||!promoter||!active)return;
    const version=lifecycle.current;lock.current=true;setBusy(true);setError('');
    const abort=new AbortController();controller.current=abort;
    try{
      const query=new URLSearchParams({promoterId:promoter,...(action==='observe'?{executionId}:{})});
      const r=await fetch('/api/integrations/vctex/'+action+'?'+query,{method:action==='observe'?'GET':'POST',credentials:'include',cache:'no-store',signal:abort.signal,headers:{'Content-Type':'application/json'},body:action==='observe'?undefined:JSON.stringify({executionId,...body})});
      const result=await r.json();if(version!==lifecycle.current||abort.signal.aborted)return;
      if(!r.ok)throw Error(result.error||'Falha no acompanhamento VCTEX.');
      if(action==='simulate')setData((old:any)=>({...old,journeyResult:undefined,offers:[...(old?.offers||[]).filter((r:any)=>r.simulationId!==result.quote.simulationId),{...result.quote,data:{...result.quote.data,vctex:{...result.quote.data?.vctex,preOperationId:old?.preOperationId}},origin:{providerId:'vctex',connectionId:promoter,consultationId:old?.preOperationId,executionId}}]}));
      else{setData({...result,employments:currentVctexEmployments<any>(result.employments||[])});if(!employment&&result.employments?.length)setEmployment(result.employments[0].employmentId);}
      return result;
    }catch(e){if(version===lifecycle.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:'Falha VCTEX.');}
    finally{if(version===lifecycle.current){lock.current=false;setBusy(false);}}
  }
  useEffect(()=>{if(!promoter||!active)return;void request(managedPricing?'observe':'start');return()=>{controller.current?.abort();};},[promoter,executionId,scope,active,managedPricing]);
  useEffect(()=>{
    if(!active||!data||data.terminal||busy||error)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>,delay=10000;
    const poll=async()=>{const next=await request('observe');if(stopped||!next||next.terminal)return;delay=Math.min(delay*2,60000);timer=setTimeout(poll,delay);};
    timer=setTimeout(poll,delay);return()=>{stopped=true;clearTimeout(timer);};
  },[data?.status,data?.preOperationId,active,promoter,error]);
  useEffect(()=>{
    if(!data)return;
    if(managedPricing&&data.journeyResult)rowsCallback.current(data.journeyResult.rows,data.journeyResult);else rowsCallback.current([...(data.offers||[]).filter((q:any)=>q.origin?.executionId===executionId&&q.data?.vctex?.preOperationId===data.preOperationId),...currentVctexEmployments<any>(data.employments||[]).map((e:any)=>({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'DATA' as const,data:{margin:{available_balance:e.availableMarginValue,can_continue:e.eligible},vctex:{preOperationId:data.preOperationId,employmentId:e.employmentId,employerName:e.employer?.name,registrationNumber:e.registrationNumber},authorization:{status:data.authorizationValid?'AUTHORIZED':undefined},observedAt:new Date().toISOString()}})),{provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:error?'ERROR':'PENDING',message:error||data.label,link:data.link,outcome:error?'TECHNICAL_ERROR':data.status==='awaiting_signature'?'AUTHORIZATION_REQUIRED':['eligibility_denied_by_provider','ineligible_by_internal_policy'].includes(data.status)?'INELIGIBLE':'PENDING',data:{vctex:{preOperationId:data.preOperationId,authorizationValid:data.authorizationValid,uncertain:/incerto/i.test(error)},authorization:{status:data.authorizationValid?'AUTHORIZED':data.status==='awaiting_signature'?'PENDING':undefined},observedAt:new Date().toISOString()}}].map(row=>({...row,origin:{providerId:'vctex',connectionId:promoter,consultationId:data.preOperationId,executionId}})));
    const eligible=data.employments?.find((e:any)=>e.eligible&&e.rates?.length),first=eligible?.rates[0];
    if(managedPricing||pricingLocked||!eligible||!first||data.status!=='finished'||busy||error)return;
    const key=[data.preOperationId,eligible.employmentId,first.id].join(':');
    if(auto.current.has(key)||(data.offers||[]).some((q:any)=>q.data?.vctex?.employmentId===eligible.employmentId&&q.data?.vctex?.offerId===first.id))return;
    auto.current.add(key);void request('simulate',{employmentId:eligible.employmentId,offerId:first.id});
  },[data,busy,error,pricingLocked,managedPricing]);
  useEffect(()=>{
    const selected=data?.employments?.find((e:any)=>e.employmentId===employment);
    if(!active||!promoter||!selected?.eligible||selected.rates?.length||data.status!=='finished')return;
    const abort=new AbortController(),version=lifecycle.current;
    const query=new URLSearchParams({promoterId:promoter,executionId,employmentId:employment});
    void fetch('/api/integrations/vctex/rates?'+query,{credentials:'include',cache:'no-store',signal:abort.signal}).then(async r=>{const rates=await r.json();if(!r.ok)throw Error(rates.error);if(abort.signal.aborted||version!==lifecycle.current)return;setData((old:any)=>({...old,employments:old.employments.map((e:any)=>e.employmentId===employment?{...e,rates}:e)}));}).catch(e=>{if(!abort.signal.aborted&&version===lifecycle.current)setError(e.message);});
    return()=>abort.abort();
  },[employment,promoter,executionId,active,data?.status]);
  const selected=data?.employments?.find((e:any)=>e.employmentId===employment),selectedRate=selected?.rates?.find((r:any)=>r.id===rate);
  if(!visible)return null;
  return <section aria-label="Acompanhamento VCTEX" className="mb-4 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <p className="text-xs text-slate-500">VCTEX DIGITAL · A assinatura do termo cabe ao trabalhador. Nenhuma proposta será criada.</p>
    {connections.length>1&&<label className="block text-xs">Conexão autorizada<select aria-label="Conexão VCTEX" className={control} disabled={busy} value={promoter} onChange={e=>{lifecycle.current++;controller.current?.abort();lock.current=false;setData(null);setPromoter(e.target.value);}}><option value="">Selecione</option>{connections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    <p role="status" className="text-sm font-semibold">{busy?'Consultando VCTEX…':data?.label||'Verificando autorização'}</p>
    {error&&<p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{error}</p>}
    {(error||data?.status==='authorization_failure')&&<button type="button" className={control} disabled={busy} onClick={()=>void request('start')}>Verificar autorização existente</button>}
    {data?.link&&<div className="flex flex-wrap gap-3"><a href={data.link} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-700 underline">Abrir termo oficial</a><button className={control} type="button" onClick={()=>void navigator.clipboard.writeText(data.link).then(()=>setCopied(true)).catch(()=>setError('Não foi possível copiar. Abra o termo oficial.'))}>{copied?'Link copiado':'Copiar link de autorização'}</button></div>}
    {managedPricing&&data?.status==='not_found'&&<button type="button" className={control} disabled={busy} onClick={()=>void request('start')}>Solicitar consulta VCTEX</button>}
    {data?.preOperationId&&<details><summary className="cursor-pointer text-xs">Recuperação manual</summary><button type="button" className={control} disabled={busy} onClick={()=>void request('observe')}>Atualizar consulta pelo ID</button></details>}
    {!managedPricing&&currentVctexEmployments<any>(data?.employments||[]).map((e:any)=><article key={e.employmentId} className="rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700"><strong>{e.employer?.name||'Empregador'}</strong><p>{e.eligible?'Elegível':'Inelegível'} · Margem {Number(e.availableMarginValue).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>{e.ineligibilityReason&&<p>{e.ineligibilityReason}</p>}</article>)}

    {!managedPricing&&data?.status==='finished'&&<details><summary className="cursor-pointer text-xs">Calcular outra condição VCTEX</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Vínculo<select className={control} value={employment} onChange={e=>{setEmployment(e.target.value);setRate('');}}>{data.employments?.filter((e:any)=>e.eligible).map((e:any)=><option key={e.employmentId} value={e.employmentId}>{e.employer?.name||e.employmentId}</option>)}</select></label>
      <label className="text-xs">Oferta<select className={control} value={rate} onChange={e=>setRate(e.target.value)}><option value="">Selecione</option>{selected?.rates?.map((r:any)=><option key={r.id} value={r.id}>{r.name} · {(r.fee*100).toLocaleString('pt-BR')}% a.m. · {r.withInsurance?'com seguro':'sem seguro'}</option>)}</select></label>
      <label className="text-xs">Prazo opcional<select className={control} value={term} onChange={e=>setTerm(e.target.value)}><option value="">Simulação full</option>{selectedRate?.allowedInstallments?.map((n:number)=><option key={n} value={n}>{n}</option>)}</select></label>
      {term&&<label className="text-xs">Parcela para cálculo personalizado<CurrencyInput className={control} value={amount} onValueChange={setAmount} /></label>}
      <button className={control} type="button" disabled={busy||!selectedRate} onClick={()=>void request('simulate',{employmentId:employment,offerId:rate,...(term?{term:Number(term),installment:Number(amount)}:{})})}>Calcular oferta selecionada</button>
    </div></details>}
  </section>;
}
