// @vitest-environment node
import fs from 'node:fs';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
import {
 telegramMainMenu,telegramSectionMenu,telegramMenuAction,telegramSimulationTarget,
 telegramPortalLink,
} from '../server/services/telegramProductMenu';

/** Exercise the real Telegram message handler with in-memory transactional doubles; no bot token, DB or HTTP. */
const source=ts.createSourceFile('telegramNotificationService.ts',fs.readFileSync(new URL('../server/services/telegramNotificationService.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function makeHandler(deps:Record<string,any>){
 let body='';
 const walk=(node:ts.Node)=>{
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='handleProposalQuery')body=node.getText(source);
  ts.forEachChild(node,walk);
 };
 walk(source);
 if(!body)throw Error('Telegram handler source not found');
 const code=ts.transpileModule('('+body+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...Object.keys(deps),'return '+code)(...Object.values(deps)) as (db:any,config:any,msg:any)=>Promise<void>;
}
function scenario(authorized=true){
 const records=new Map<string,any>();
 const sends:any[]=[];
 const config={token:'123456:sample-token',registered:true,secret:'mock'};
 const candidate={tenantId:'tenant-evolve',configKey:'TELEGRAM_BINDING_V1_partner-a',
  configValue:{chatId:'1001',linkedAt:'2026-11-10T12:00:00Z'}};
 const tx={
  systemConfig:{
   findUnique:vi.fn(async({where:{id}}:any)=>records.get(id)||null),
   findMany:vi.fn(async()=>[candidate]),
   upsert:vi.fn(async({where,create,update}:any)=>{
    const old=records.get(where.id);
    records.set(where.id,old?{...old,...update}:{...create});return records.get(where.id);
   }),
   create:vi.fn(async({data}:any)=>{records.set(data.id,data);return data;}),
  },
  partner:{findFirst:vi.fn(async({where}:any)=>authorized&&where.id==='partner-a'&&where.tenantId==='tenant-evolve'
   ?{id:'partner-a',name:'Parceiro de teste',code:'010',
      tenant:{whiteLabel:{companyName:'Evolve'},tradeName:'Evolve',name:'Evolve'}}:null)},
  proposal:{findMany:vi.fn(async(_query:any)=>[])},
 };
 const db={$transaction:async(callback:any)=>callback(tx)};
 const binding=async(_tx:any,_tenant:string,_partner:string)=>{
  return authorized?{chatId:'1001',linkedAt:'2026-11-10T12:00:00Z'}:null;
 };
 const deps={
  BINDING:'TELEGRAM_BINDING_V1_',hash:(value:string)=>value,botId:(value:any)=>value.token.split(':')[0],
  decrypt:(value:any)=>value,encrypt:(value:any)=>value,
  activeBot:async()=>config,company:async()=>({enabled:true}),binding,
  telegram:vi.fn(async(_config:any,_method:string,payload:any)=>{sends.push(payload);return{};}),
  telegramMainMenu,telegramSectionMenu,telegramMenuAction,telegramSimulationTarget,telegramPortalLink,
  process:{env:{APP_URL:'https://sentinelconsig.com.br'}},
 };
 const handle=makeHandler(deps);
 let id=0;
 const send=async(text:string,extra:any={})=>{
  await handle(db,config,{chat:{id:1001},message_id:++id,text,...extra});
  return sends.at(-1);
 };
 return {send,sends,tx,records,handle,db,config};
}
describe('Menu Telegram real com vínculo de parceiro e proteção multiempresa',()=>{
 it('permite INSS Novo, Refin e Portabilidade+Refin com portal autenticado e consulta de propostas',async()=>{
  const s=scenario();
  const root=await s.send('/start');
  expect(root.text).toContain('Consignado CLT');
  expect(root.text).toContain('Portabilidade INSS');
  expect(root.reply_markup.keyboard.flat().map((x:any)=>x.text)).toContain('🏛️ INSS');
  const inss=await s.send('🏛️ INSS');
  expect(inss.text).toContain('Novo e Refinanciamento');
  const novo=await s.send('💰 Novo INSS');
  expect(novo.text).toContain('product=INSS');
  expect(novo.text).toContain('operation=NEW');
  expect(novo.text).not.toMatch(/CPF\s*:/i);
  const menu=await s.send('🏠 Menu principal');
  expect(menu.text).toContain('Menu principal');
  const port=await s.send('🔄 Portabilidade INSS');
  expect(port.text).toContain('Portabilidade pura');
  const refin=await s.send('🔁 Portabilidade + refinanciamento');
  expect(refin.text).toContain('operation=PORT_REFIN');
  expect(refin.text).toContain('/parceiro?');
  const query=await s.send('🔍 Consultar proposta');
  expect(query.text).toContain('Como deseja pesquisar?');
  const byNumber=await s.send('Número da proposta');
  expect(byNumber.text).toContain('número completo');
  const empty=await s.send('TEST-404');
  expect(empty.text).toContain('Nenhuma proposta');
  expect(s.tx.proposal.findMany).toHaveBeenCalledTimes(1);
  expect(s.tx.proposal.findMany.mock.calls[0][0].where).toMatchObject({tenantId:'tenant-evolve',partnerId:'partner-a'});
 });
 it('não acessa ofertas sem vínculo confirmado e parceiro ativo',async()=>{
  const s=scenario(false);
  const text=(await s.send('/start')).text;
  expect(text).toContain('vincule seu Telegram');
  expect(text).not.toContain('/parceiro?tab=simulacoes');
  expect(s.tx.partner.findFirst).not.toHaveReturnedWith(expect.objectContaining({id:'partner-a'}));
 });
 it('envia a consulta de dados CLT ao fluxo de vínculos do cliente, sem confundir com o perfil do parceiro',async()=>{
  const s=scenario();
  await s.send('/start');
  await s.send('💼 CLT');
  const client=await s.send('🪪 Dados do cliente');
  expect(client.text).toContain('product=CLT');
  expect(client.text).toContain('Consultar vínculos e margem');
  expect(client.text).not.toContain('tab=perfil');
  expect(client.text).toContain('Não envie CPF');
 });
 it('não recebe PDFs, não baixa extratos e mantém a navegação para empresas',async()=>{
  const s=scenario();
  await s.send('/start');
  await s.send('🔄 Portabilidade INSS');
  const extract=await s.send('📄 Simular pelo extrato');
  expect(extract.text).toContain('em implantação');
  const document=await s.send('',{document:{file_id:'unused',mime_type:'application/pdf',file_size:1200}});
  expect(document.text).toContain('não processa extratos');
  const change=await s.send('👤 Trocar parceiro');
  expect(change.text).toContain('Menu principal');
 });
 it('ignora replay de message_id e não responde duas vezes',async()=>{
  const s=scenario();
  await s.send('/start');
  const count=s.sends.length;
  await s.handle(s.db,s.config,{chat:{id:1001},message_id:1,text:'/start'});
  expect(s.sends).toHaveLength(count);
 });
});
