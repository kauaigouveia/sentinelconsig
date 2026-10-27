'use strict';
const http = require('node:http');
const https = require('node:https');
const {timingSafeEqual} = require('node:crypto');
function allowed(method, u) {
  if(u.origin!=='https://www.appvctex.com.br'||u.username||u.password||u.hash||/%|\\/.test(u.pathname))return false;
  if(u.pathname==='/api/authentication/login')return method==='POST'&&!u.search;
  if(!u.pathname.startsWith('/api/consignado/'))return false;
  const p=u.pathname.slice('/api/consignado'.length);
  if(method==='GET')return /^\/pre-operation(?:\/document-number\/\d{11}|\/[A-Za-z0-9-]+(?:\/employment\/[A-Za-z0-9-]+\/available-rates)?)?$/.test(p)&&[...u.searchParams.keys()].every(k=>['documentNumber','page','perPage','preOperationList'].includes(k));
  return method==='POST'&&!u.search&&(p==='/pre-operation'||p==='/pre-operation/external'||/^\/pre-operation\/[A-Za-z0-9-]+\/employment\/[A-Za-z0-9-]+\/simulate\/(full|installments)$/.test(p));
}
function createGateway(secret, request = https.request) {
  const key=Buffer.from(secret||'');if(key.length<32)throw Error('Gateway secret missing');
  const agent=new https.Agent({keepAlive:true,maxSockets:8,family:4});
  function fail(res,status){if(res.headersSent||res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Sentinel-Gateway-Error':'1'});res.end(JSON.stringify({error:'Gateway request failed',status}));}
  const server=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||req.url!=='/vctex')return fail(res,404);
    const supplied=Buffer.from(String(req.headers['x-gateway-key']||''));
    if(supplied.length!==key.length||!timingSafeEqual(supplied,key))return fail(res,403);
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>65536)return fail(res,413);chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8')),url=new URL(input.url);
      if(!allowed(input.method,url)||(input.body!=null&&typeof input.body!=='string')||(input.method==='GET'&&input.body!=null))return fail(res,400);
      const headers={accept:'application/json','content-type':'application/json'};
      const login=url.pathname==='/api/authentication/login';
      if(!login){const auth=input.headers?.authorization;if(typeof auth!=='string'||auth.length>8192||!/^Bearer [^\s]+$/.test(auth))return fail(res,400);headers.authorization=auth;}
      const body=input.body||'';if(body)headers['content-length']=Buffer.byteLength(body);
      const upstream=request(url,{method:input.method,headers,agent,family:4},response=>{
        if(response.statusCode>=300&&response.statusCode<400){response.resume();return fail(res,502);}
        let length=0;const returned=[];
        response.on('data',chunk=>{length+=chunk.length;if(length>2097152){response.destroy();upstream.destroy();fail(res,502);}else returned.push(chunk);});
        response.on('error',()=>fail(res,502));
        response.on('end',()=>{if(res.writableEnded||res.destroyed)return;res.writeHead(response.statusCode||502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(Buffer.concat(returned));});
      });
      const timeout=setTimeout(()=>{upstream.destroy();fail(res,504);},22000);
      upstream.on('close',()=>clearTimeout(timeout));upstream.on('error',()=>fail(res,502));
      res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});upstream.end(body);
    }catch{fail(res,400);}
  });
  server.on('close',()=>agent.destroy());server.requestTimeout=30000;server.headersTimeout=10000;return server;
}
module.exports={createGateway,allowed};
if(require.main===module)createGateway(process.env.GATEWAY_SECRET).listen(3101,'127.0.0.1');
