
const recentByIP = new Map();
const clean=(value,max)=>typeof value==="string"?value.trim().slice(0,max):"";
const escapeHTML=(s)=>s.replace(/[&<>"']/g,(x)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const calendarSlots=new Set(["09:00","10:00","11:00","14:00","15:00","16:00"]);
const serviceConfigured=(env)=>Boolean(env.GCAL_CLIENT_ID&&env.GCAL_CLIENT_SECRET&&env.GCAL_REFRESH_TOKEN&&env.GCAL_CALENDAR_ID);
function json(message,status=200,extra={}){return Response.json({ok:status<300,message,...extra},{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
const contactEmail="comercial@sentinelconsig.com.br";
const timeToDate=(day,time)=>new Date(day+"T"+time+":00-03:00");
function validateLocalBooking(day,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!calendarSlots.has(time))return "Escolha uma data e horário válidos.";
 const d=timeToDate(day,time);
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)return "Data inválida.";
 const wd=new Date(day+"T12:00:00-03:00").getUTCDay();
 if(wd===0||wd===6)return "Escolha um dia útil para a demonstração.";
 if(d.getTime()<Date.now()+5*60*1000)return "Escolha um horário futuro para a demonstração.";
 if(d.getTime()>Date.now()+120*86400000)return "A demonstração pode ser solicitada com até 120 dias de antecedência.";
 return null;
}
async function oauthAccessToken(env){
 const req=new URLSearchParams({client_id:env.GCAL_CLIENT_ID,client_secret:env.GCAL_CLIENT_SECRET,refresh_token:env.GCAL_REFRESH_TOKEN,grant_type:"refresh_token"});
 const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:req.toString(),signal:AbortSignal.timeout(4300)});
 const obj=await res.json().catch(()=>({}));
 if(!res.ok||!obj.access_token)throw new Error("oauth_"+res.status);
 return obj.access_token;
}
async function createGoogleEvent(env,details,id){
 const token=await oauthAccessToken(env);
 const calendarId=env.GCAL_CALENDAR_ID;
 const start=timeToDate(details.date,details.time);
 const end=new Date(start.getTime()+30*60*1000);
 const base="https://www.googleapis.com/calendar/v3";
 const headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"};
 const availability=await fetch(base+"/freeBusy",{method:"POST",headers,
 body:JSON.stringify({timeMin:start.toISOString(),timeMax:end.toISOString(),timeZone:"America/Maceio",items:[{id:calendarId}]}),signal:AbortSignal.timeout(4000)});
 const busy=await availability.json().catch(()=>({}));
 if(!availability.ok)throw new Error("freebusy_"+availability.status);
 if(busy.calendars?.[calendarId]?.errors?.length)throw new Error("freebusy_permission");
 if(!busy.calendars?.[calendarId])throw new Error("freebusy_calendar_missing");
 if(busy.calendars[calendarId].busy?.length)return {busy:true};
 const body={
   summary:"Demonstração Sentinel Consig • "+details.company,
   description:["Apresentação comercial Sentinel Consig","Empresa: "+details.company,"Responsável: "+details.name,
    "E-mail: "+details.email,"Telefone: "+details.phone,"Plano de interesse: "+details.plan,
    "Observações: "+(details.notes||"Não informadas"),"Protocolo: "+id].join("\n"),
   start:{dateTime:start.toISOString(),timeZone:"America/Maceio"},
   end:{dateTime:end.toISOString(),timeZone:"America/Maceio"},
   attendees:[{email:details.email}],
   reminders:{useDefault:true}
 };
 const response=await fetch(base+"/calendars/"+encodeURIComponent(calendarId)+"/events?sendUpdates=all",{
   method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(6500)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.id)throw new Error("events_insert_"+response.status);
 return {eventId:String(result.id),eventUrl:typeof result.htmlLink==="string"?result.htmlLink:null,busy:false};
}
async function notifyCommercial(env,details,id,confirmed){
 const info=[["Tipo",details.type==="demo"?"Demonstração":"Solicitação de contratação"],
 ["Situação",confirmed?"Confirmada no Google Calendar":"Aguardando confirmação"],
 ["Nome",details.name],["Empresa",details.company],["E-mail",details.email],["Telefone",details.phone],
 ["Plano",details.plan],["Data",details.type==="demo"?details.date:"—"],
 ["Horário",details.type==="demo"?details.time+" (Maceió, UTC−3)":"—"],
 ["Observações",details.notes||"—"],["Protocolo",id]];
 const text=info.map(([k,v])=>k+": "+v).join("\n");
 const subject=(details.type==="demo"?"Demonstração":"Contratação")+" • Sentinel Consig • "+details.company;
 const report=async(ok,error)=>env.LEADS_DB.prepare("UPDATE leads SET notified=?, notification_error=? WHERE id=?").bind(ok?1:0,error||null,id).run().catch(()=>{});
 if(env.RESEND_API_KEY){
   const html="<div style='font-family:Arial,sans-serif;max-width:630px'><h2>Novo contato comercial • Sentinel Consig</h2><table style='border-collapse:collapse;width:100%'>"+info.map(([k,v])=>"<tr><th style='text-align:left;border-bottom:1px solid #ddd;padding:9px'>"+escapeHTML(k)+"</th><td style='border-bottom:1px solid #ddd;padding:9px'>"+escapeHTML(v)+"</td></tr>").join("")+"</table></div>";
   try{
    const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({from:"Sentinel Consig <notificacoes@sentinelconsig.com.br>",to:[contactEmail],reply_to:details.email,subject,html,text}),signal:AbortSignal.timeout(7200)});
    await report(res.ok,res.ok?null:"resend_http_"+res.status);
   }catch(e){console.error("lead email delivery unavailable",e?.name||"error");await report(false,"resend_transport");}
 }else if(env.COMMERCIAL_EMAIL){
   try{
    await env.COMMERCIAL_EMAIL.send({from:"notificacoes@sentinelconsig.com.br",to:"kauaigouveia@gmail.com",subject,text});
    await report(true);
   }catch(e){console.error("lead email delivery unavailable",e?.name||"error");await report(false,"cloudflare_email");}
 }
}
async function lead(request,env,ctx){
 if(request.method!=="POST")return json("Método não permitido.",405);
 const url=new URL(request.url),origin=request.headers.get("Origin");
 if(!origin||(()=>{try{return new URL(origin).host!==url.host;}catch{return true;}})())return json("Origem não autorizada.",403);
 if(Number(request.headers.get("Content-Length")||"0")>12000)return json("Solicitação muito grande.",413);
 const ip=request.headers.get("CF-Connecting-IP")||"unknown",now=Date.now();
 if(recentByIP.size>900)recentByIP.clear();
 const recent=(recentByIP.get(ip)||[]).filter(t=>now-t<600000);
 if(recent.length>=4)return json("Muitas tentativas. Tente novamente mais tarde.",429);
 recentByIP.set(ip,[...recent,now]);
 let v;try{const raw=await request.text();if(raw.length>12000)return json("Solicitação muito grande.",413);v=JSON.parse(raw);}
 catch{return json("Dados inválidos.",400);}
 if(!v||typeof v!=="object"||Array.isArray(v))return json("Dados inválidos.",400);
 if(clean(v.website,200))return json("Solicitação recebida.",200);
 const details={
   type:clean(v.kind,12),name:clean(v.name,100),company:clean(v.company,140),
   email:clean(v.email,254).toLowerCase(),phone:clean(v.phone,35),plan:clean(v.plan,30)||"A definir",
   date:clean(v.date,10),time:clean(v.time,5),period:clean(v.period,25),notes:clean(v.notes,1200)
 };
 if(!["demo","contract"].includes(details.type)||!["Essencial","Pro","Enterprise","A definir"].includes(details.plan)
   ||v.consent!==true||details.name.length<3||details.company.length<2
   ||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)||details.phone.replace(/\D/g,"").length<10)
   return json("Revise os dados obrigatórios antes de enviar.",400);
 if(details.type==="demo"){
   const validation=validateLocalBooking(details.date,details.time);
   if(validation)return json(validation,400);
   details.period=Number(details.time.slice(0,2))<12?"Manhã":"Tarde";
 }else{details.date="";details.time="";details.period="";}
 if(!env.LEADS_DB)return json("O canal comercial está temporariamente indisponível. Entre em contato pelo e-mail.",503);
 const id=crypto.randomUUID(),createdAt=new Date().toISOString(),hasCalendar=details.type==="demo"&&serviceConfigured(env);
 try{
   await env.LEADS_DB.prepare("INSERT INTO leads(id,created_at,kind,name,company,email,phone,plan,preferred_date,preferred_period,notes,status,notified,preferred_time,duration_minutes,calendar_sync_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)")
   .bind(id,createdAt,details.type,details.name,details.company,details.email,details.phone,details.plan,
    details.date||null,details.period||null,details.notes||null,details.type==="demo"?"pendente":"novo",
    details.time||null,details.type==="demo"?30:null,details.type==="demo"?"pending":"not_applicable").run();
 }catch(e){
   console.error("D1 insert failed",e?.name||"error");
   return json("Não foi possível registrar a solicitação. Tente novamente ou escreva para comercial@sentinelconsig.com.br.",503);
 }
 let calendarConfirmed=false;
 let calendarConflict=false;
 if(hasCalendar){
   let slotClaimed=false;
   try{
     const held=await env.LEADS_DB.prepare("INSERT OR IGNORE INTO demo_slots(date,time,lead_id,created_at) VALUES(?,?,?,?)").bind(details.date,details.time,id,createdAt).run();
     slotClaimed=Boolean(held.meta?.changes);
     if(!slotClaimed){calendarConflict=true;await env.LEADS_DB.prepare("UPDATE leads SET status=?, calendar_sync_status=?, calendar_error=? WHERE id=?").bind("conflito","conflict","local_slot",id).run();}
     else{
       const result=await createGoogleEvent(env,details,id);
       if(result.busy){
          calendarConflict=true;
          await env.LEADS_DB.prepare("UPDATE leads SET status=?, calendar_sync_status=?, calendar_error=? WHERE id=?").bind("conflito","conflict","google_busy",id).run();
       }else{
          calendarConfirmed=true;
          await env.LEADS_DB.prepare("UPDATE leads SET status=?, calendar_sync_status=?,google_calendar_event_id=?,calendar_error=NULL WHERE id=?").bind("confirmado","confirmed",result.eventId,id).run();
       }
     }
   }catch(e){
     console.error("Google Calendar booking failed",e?.message?.replace(/[^a-z0-9_]/gi,"_")||"error");
     await env.LEADS_DB.prepare("UPDATE leads SET calendar_sync_status=?,calendar_error=? WHERE id=?").bind("pending","calendar_sync_failed",id).run().catch(()=>{});
   }finally{
     if(slotClaimed&&!calendarConfirmed)await env.LEADS_DB.prepare("DELETE FROM demo_slots WHERE lead_id=?").bind(id).run().catch(()=>{});
   }
 }
 if(ctx?.waitUntil)ctx.waitUntil(notifyCommercial(env,details,id,calendarConfirmed));
 else await notifyCommercial(env,details,id,calendarConfirmed);
 if(calendarConflict)return json("O horário indicado não está disponível. Escolha outro horário para a demonstração.",409,{calendarConfirmed:false});
 if(calendarConfirmed)return json("Sua demonstração foi confirmada no Google Calendar. O convite será enviado para o e-mail informado.",200,{calendarConfirmed:true});
 if(details.type==="demo")return json("Recebemos seu pedido de demonstração para "+details.date+" às "+details.time+" (horário de Maceió). O horário ainda não está confirmado; nossa equipe entrará em contato.",200,{calendarConfirmed:false});
 return json("Recebemos sua solicitação comercial! Nossa equipe entrará em contato para apresentar os próximos passos.",200,{calendarConfirmed:false});
}
