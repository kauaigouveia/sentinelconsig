
const ADMIN_EMAIL="kauaigouveia@gmail.com";
const sessionCookie="sentinel_admin_session";
const utf8=new TextEncoder();
async function digest(value){const hash=await crypto.subtle.digest("SHA-256",utf8.encode(value));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,"0")).join("");}
function randId(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b,n=>n.toString(16).padStart(2,"0")).join("");}
function otp(){const a=new Uint32Array(1);crypto.getRandomValues(a);return String(a[0]%100000000).padStart(8,"0");}
function adminJSON(msg,status,extra={}){return Response.json({ok:status<300,message:msg,...extra},{status,headers:{"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});}
function originOk(req){try{const origin=req.headers.get("Origin");return origin&&new URL(origin).host===new URL(req.url).host}catch{return false}}
async function payload(req){if(Number(req.headers.get("Content-Length")||0)>4000)throw Error("large");const raw=await req.text();if(raw.length>4000)throw Error("large");return JSON.parse(raw);}
function getCookie(request){const cookie=request.headers.get("Cookie")||"";const matched=cookie.match(/(?:^|;\s*)sentinel_admin_session=([a-f0-9]{64})(?:;|$)/);return matched?.[1]||null;}
function sessionCookieHeader(value,maxAge){return sessionCookie+"="+value+"; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age="+maxAge;}
async function getAdminSession(req,db){
 const token=getCookie(req);if(!token)return null;
 const hash=await digest(token);
 const session=await db.prepare("SELECT email,expires_at FROM admin_sessions WHERE session_hash=? LIMIT 1").bind(hash).first();
 if(!session||session.email!==ADMIN_EMAIL||Number(session.expires_at)<Date.now())return null;
 return session;
}
async function rate(db,key,max,windowMs){
 const now=Date.now();const row=await db.prepare("SELECT window_start, attempts FROM admin_auth_rate WHERE id=?").bind(key).first();
 if(!row||now-Number(row.window_start)>windowMs){
  await db.prepare("INSERT INTO admin_auth_rate(id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET window_start=excluded.window_start,attempts=1").bind(key,now).run();
  return false;
 }
 if(Number(row.attempts)>=max)return true;
 await db.prepare("UPDATE admin_auth_rate SET attempts=attempts+1 WHERE id=?").bind(key).run();
 return false;
}
async function adminApi(req,env,path){
 const db=env.LEADS_DB;
 if(!db)return adminJSON("Serviço administrativo indisponível.",503);
 const method=req.method;
 if(method==="GET"&&path==="/api/admin/bookings"){
  const session=await getAdminSession(req,db);
  if(!session)return adminJSON("Sessão não autorizada. Entre novamente.",401);
  const u=new URL(req.url);const page=Math.max(1,Math.min(5000,parseInt(u.searchParams.get("page")||"1",10)||1));
  const limit=Math.max(1,Math.min(50,parseInt(u.searchParams.get("limit")||"25",10)||25));
  const q=(u.searchParams.get("q")||"").trim().slice(0,110);
  const status=u.searchParams.get("status")||"";
  if(status&&!["confirmed","pending","conflict"].includes(status))return adminJSON("Filtro inválido.",400);
  const query="%"+q.replace(/[%_\\]/g,"\\$&")+"%";
  const where="kind='demo'"+(q?" AND (name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')":"")+(status?" AND calendar_sync_status=?":"");
  const bind=[...(q?[query,query,query]:[]),...(status?[status]:[])];
  const [stats,filtered,rows]=await Promise.all([
   db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN calendar_sync_status='confirmed' THEN 1 ELSE 0 END) AS confirmed,SUM(CASE WHEN calendar_sync_status='pending' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN calendar_sync_status='conflict' THEN 1 ELSE 0 END) AS conflicts FROM leads WHERE kind='demo'").first(),
   db.prepare("SELECT COUNT(*) AS amount FROM leads WHERE "+where).bind(...bind).first(),
   db.prepare("SELECT id,created_at,name,company,email,phone,plan,preferred_date,preferred_time,status,calendar_sync_status,google_calendar_event_id FROM leads WHERE "+where+" ORDER BY preferred_date DESC,preferred_time DESC,created_at DESC LIMIT ? OFFSET ?").bind(...bind,limit,(page-1)*limit).all()
  ]);
  return adminJSON("Agendamentos consultados.",200,{
    stats:{total:stats?.total||0,confirmed:stats?.confirmed||0,pending:stats?.pending||0,conflicts:stats?.conflicts||0},
    filtered:filtered?.amount||0,items:rows?.results||[],page,limit
  });
 }
 if(method!=="POST"||!originOk(req))return adminJSON("Solicitação não permitida.",403);
 if(!["/api/admin/request-code","/api/admin/verify-code","/api/admin/logout"].includes(path))return adminJSON("Rota não encontrada.",404);
 if(path==="/api/admin/logout"){
  const token=getCookie(req);if(token)await db.prepare("DELETE FROM admin_sessions WHERE session_hash=?").bind(await digest(token)).run().catch(()=>{});
  const response=adminJSON("Sessão encerrada.",200);response.headers.append("Set-Cookie",sessionCookieHeader("",0));return response;
 }
 let data;try{data=await payload(req)}catch{return adminJSON("Dados inválidos.",400)}
 const email=typeof data.email==="string"?data.email.trim().toLowerCase():"";
 const ip=req.headers.get("CF-Connecting-IP")||"unknown";
 if(path==="/api/admin/request-code"){
  if(email.length>254||!email.includes("@"))return adminJSON("Informe um e-mail válido.",400);
  const rateKey="request:"+await digest(ip);
  if(await rate(db,rateKey,3,15*60*1000))return adminJSON("Muitas solicitações de acesso. Tente novamente mais tarde.",429);
  if(email!==ADMIN_EMAIL)return adminJSON("Se o e-mail estiver autorizado, você receberá um código de acesso.",200);
  if(!env.COMMERCIAL_EMAIL)return adminJSON("Serviço de envio indisponível. Contate o suporte.",503);
  const id=randId(),oneTime=otp(),hash=await digest(id+":"+oneTime),now=Date.now();
  await db.prepare("INSERT INTO admin_login_codes(id,code_hash,expires_at,attempts,consumed,created_at) VALUES(?,?,?,0,0,?)").bind(id,hash,now+10*60*1000,now).run();
  try{
   await env.COMMERCIAL_EMAIL.send({
    from:"notificacoes@sentinelconsig.com.br",to:ADMIN_EMAIL,
    subject:"Código de acesso • Agendamentos Sentinel Consig",
    text:"Código para acessar a central de agendamentos do Sentinel Consig: "+oneTime+"\n\nVálido por 10 minutos. Se não solicitou, ignore esta mensagem."
   });
  }catch(e){console.error("admin otp email delivery unavailable",e?.name||"error");await db.prepare("UPDATE admin_login_codes SET consumed=1 WHERE id=?").bind(id).run().catch(()=>{});return adminJSON("Não foi possível enviar o código agora.",503);}
  const resp=adminJSON("Código de acesso enviado para o e-mail cadastrado.",200,{challenge:id});
  return resp;
 }
 if(path==="/api/admin/verify-code"){
  const code=typeof data.code==="string"?data.code.trim():"";
  const id=typeof data.challenge==="string"?data.challenge.trim():"";
  if(email!==ADMIN_EMAIL||!/^[0-9]{8}$/.test(code)||!/^[0-9a-f]{64}$/.test(id))return adminJSON("Código inválido ou expirado.",401);
  const rateKey="verify:"+await digest(ip);
  if(await rate(db,rateKey,12,15*60*1000))return adminJSON("Muitas tentativas. Tente novamente mais tarde.",429);
  const row=await db.prepare("SELECT code_hash,expires_at,attempts,consumed FROM admin_login_codes WHERE id=?").bind(id).first();
  if(!row||row.consumed||row.attempts>=5||Number(row.expires_at)<Date.now())return adminJSON("Código inválido ou expirado.",401);
  const compare=await digest(id+":"+code);
  if(compare!==row.code_hash){
    await db.prepare("UPDATE admin_login_codes SET attempts=attempts+1 WHERE id=?").bind(id).run();
    return adminJSON("Código inválido ou expirado.",401);
  }
  const result=await db.prepare("UPDATE admin_login_codes SET consumed=1 WHERE id=? AND consumed=0 AND attempts<5").bind(id).run();
  if(!result.meta?.changes)return adminJSON("Código já utilizado.",401);
  const token=randId(),hash=await digest(token),now=Date.now();
  await db.prepare("INSERT INTO admin_sessions(session_hash,email,created_at,expires_at) VALUES(?,?,?,?)").bind(hash,ADMIN_EMAIL,now,now+12*60*60*1000).run();
  const resp=adminJSON("Autenticação concluída.",200);resp.headers.append("Set-Cookie",sessionCookieHeader(token,12*60*60));return resp;
 }
 return adminJSON("Rota não encontrada.",404);
}
