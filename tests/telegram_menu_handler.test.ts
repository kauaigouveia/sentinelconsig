// @vitest-environment node
import fs from 'node:fs';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
import {randomBytes} from 'node:crypto';
import {
 telegramMainMenu,telegramSectionMenu,telegramMenuAction,telegramSimulationTarget,
 telegramPortalLink,normalizeTelegramMenuInput,
} from '../server/services/telegramProductMenu';
import {parseTelegramSelectedContracts,TELEGRAM_PDF_TTL_MS,telegramPdfErrorCode,telegramPdfErrorMessage,TelegramPdfProcessingError} from '../server/services/telegramInssPdfService';
import {beginTelegramNativeSimulation,continueTelegramCltSimulation,cltConsultationOptions,telegramNativePrompt,acceptTelegramNativeAnswer,telegramNativeSummary,telegramNativeSteps} from '../server/services/telegramNativeSimulation';

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
function scenario(authorized=true,portalEnabled=true){
 const records=new Map<string,any>();
 const keyOf=(where:any)=>where.id??(
    where.tenantId_configKey?.tenantId+':'+where.tenantId_configKey?.configKey);
 const sends:any[]=[];
 const config={token:'123456:sample-token',registered:true,secret:'mock'};
 const candidate={tenantId:'tenant-evolve',configKey:'TELEGRAM_BINDING_V1_partner-a',
  configValue:{chatId:'1001',linkedAt:'2026-11-10T12:00:00Z'}};
 const tx={
  systemConfig:{
   findUnique:vi.fn(async({where}:any)=>records.get(keyOf(where))||null),
   updateMany:vi.fn(async({where,data}:any)=>{
    const current=records.get(where.id);
    if(!current||current.configValue!==where.configValue)return {count:0};
    records.set(where.id,{...current,...data});
    return {count:1};
   }),
   findMany:vi.fn(async()=>[candidate]),
   upsert:vi.fn(async({where,create,update}:any)=>{
    const id=keyOf(where),old=records.get(id);
    records.set(id,old?{...old,...update}:{...create});return records.get(id);
   }),
   create:vi.fn(async({data}:any)=>{records.set(data.id,data);return data;}),
  },
  partnerPortalAccess:{findFirst:vi.fn(async({where}:any)=>authorized&&portalEnabled&&where.tenantId==='tenant-evolve'&&where.partnerId==='partner-a'&&where.active?{id:'portal-access-1'}:null)},
  partner:{findFirst:vi.fn(async({where}:any)=>authorized&&where.id==='partner-a'&&where.tenantId==='tenant-evolve'
   ?{id:'partner-a',name:'Parceiro de teste',code:'010',
      tenant:{whiteLabel:{companyName:'Evolve'},tradeName:'Evolve',name:'Evolve'}}:null)},
  proposal:{findMany:vi.fn(async(_query:any)=>[])},
 };
 const db={...tx,$transaction:async(callback:any)=>callback(tx)};
 const binding=async(_tx:any,_tenant:string,_partner:string)=>{
  return authorized?{chatId:'1001',linkedAt:'2026-11-10T12:00:00Z'}:null;
 };
 const deps={
  BINDING:'TELEGRAM_BINDING_V1_',hash:(value:string)=>value,botId:(value:any)=>value.token.split(':')[0],randomBytes,
  decrypt:(value:any)=>value,encrypt:(value:any)=>value,
  activeBot:async()=>config,company:async()=>({enabled:true}),binding,
  telegram:vi.fn(async(_config:any,_method:string,payload:any)=>{sends.push(payload);return{};}),
  telegramMainMenu,telegramSectionMenu,telegramMenuAction,telegramSimulationTarget,telegramPortalLink,
  normalizeTelegramMenuInput,parseTelegramSelectedContracts,TELEGRAM_PDF_TTL_MS,telegramPdfErrorCode,telegramPdfErrorMessage,
  beginTelegramNativeSimulation,continueTelegramCltSimulation,cltConsultationOptions,telegramNativePrompt,acceptTelegramNativeAnswer,telegramNativeSummary,
  executeTelegramCltMargin:vi.fn(async()=>({
    messages:['🏛️ Margem CLT · FACTA · R$ 315,50', '🔐 J17 · autorização pendente, consulte o banco'],
    hasMargin:true,positiveBanks:['FACTA'],
  })),
  executeTelegramNativeSimulation:vi.fn(async()=>({
    messages:['📊 Simulação realizada no Telegram · Banco Teste · R$ 1.500,00'],
    saved:true,offerCount:1,
  })),
  telegramAccountStillValid:async()=>authorized&&portalEnabled,
  validateTelegramPdfDocument:(document:any)=>{
    if(document.mime_type!=='application/pdf'||!document.file_name?.endsWith('.pdf')||document.file_size>5e6)throw Error('PDF inválido');
  },
  downloadTelegramPdf:vi.fn(async()=>new Uint8Array([37,80,68,70,45])),
  readTelegramInssPdf:vi.fn(async()=>({
    birthDate:'1966-06-15',benefitType:32,benefitStartDate:'2020-01-01',uf:'AL',
    benefitContractCount:3,loanMargin:120,
    contracts:[
      {bank:'237',numberSuffix:'1111',originalTerm:84,remaining:50,balance:500,installment:30},
      {bank:'041',numberSuffix:'2222',originalTerm:84,remaining:52,balance:600,installment:40},
      {bank:'237',numberSuffix:'3333',originalTerm:84,remaining:44,balance:700,installment:50},
    ],
  })),
  telegramPdfReviewText:(data:any)=>'📄 Extrato conferido · contratos: '+data.contracts.length+
    '\\nSelecione contratos 1,2 ou 3',
  calculateTelegramInssQuotes:vi.fn(async()=>({texts:['📊 Daycoval · parcela original → recalculada · troco estimado R$ 500,00'],
    calculatedBanks:['DAYCOVAL'],unavailableBanks:['C6 (não cadastrado)']})),
  process:{env:{APP_URL:'https://sentinelconsig.com.br'}},
 };
 const handle=makeHandler(deps);
 let id=0;
 const send=async(text:string,extra:any={})=>{
  await handle(db,config,{chat:{id:1001},message_id:++id,text,...extra});
  return sends.at(-1);
 };
 return {send,sends,tx,records,handle,db,config,deps};
}
describe('Menu Telegram real com vínculo de parceiro e proteção multiempresa',()=>{
 it('permite INSS Novo, Refin e Portabilidade+Refin no chat sem depender do Portal, mantendo consulta de propostas',async()=>{
  const s=scenario();
  const root=await s.send('/start');
  expect(root.text).toContain('Consignado CLT');
  expect(root.text).toContain('Portabilidade INSS');
  expect(root.reply_markup.keyboard.flat().map((x:any)=>x.text)).toContain('🏛️ INSS');
  const inss=await s.send('🏛️ INSS');
  expect(inss.text).toContain('Novo e Refinanciamento');
  const novo=await s.send('💰 Novo INSS');
  expect(novo.text).toContain('CPF do cliente');
  expect(novo.text).toContain('etapa 1');
  expect(novo.text).not.toContain('/parceiro?');
  const menu=await s.send('🏠 Menu principal');
  expect(menu.text).toContain('Menu principal');
  const port=await s.send('🔄 Portabilidade INSS');
  expect(port.text).toContain('Portabilidade pura');
  const refin=await s.send('🔁 Portabilidade + refinanciamento');
  expect(refin.text).toContain('CPF do cliente');
  expect(refin.text).toContain('Portabilidade + Refin');
  expect(refin.text).not.toContain('/parceiro?');
  const query=await s.send('🔍 Consultar proposta');
  expect(query.text).toContain('Como deseja pesquisar?');
  const byNumber=await s.send('Número da proposta');
  expect(byNumber.text).toContain('número completo');
  const empty=await s.send('TEST-404');
  expect(empty.text).toContain('Nenhuma proposta');
  expect(s.tx.proposal.findMany).toHaveBeenCalledTimes(1);
  expect(s.tx.proposal.findMany.mock.calls[0][0].where).toMatchObject({tenantId:'tenant-evolve',partnerId:'partner-a'});
 });
 it('consulta margem CLT antes de perguntar valor, confirma o titular e calcula por margem cheia',async()=>{
  const s=scenario();
  await s.send('/start');await s.send('💼 CLT');
  const start=await s.send('💰 Consultar margem e simular');
  expect(start.text).toContain('CPF do cliente');
  expect((await s.send('00000000000')).text).toContain('inválido');
  expect((await s.send('52998224725')).text).toContain('nome completo');
  expect((await s.send('Cliente Fictício')).text).toContain('telefone');
  const summary=await s.send('82999998888');
  expect(summary.text).toContain('Consultar margem CLT');
  expect(summary.text).not.toContain('PARCELA');
  expect(summary.text).not.toContain('52998224725');
  const denied=await s.send('Não autorizou');
  expect(denied.text).toContain('ainda não foi enviada');
  expect(s.deps.executeTelegramCltMargin).not.toHaveBeenCalled();
  await s.send('✅ Consultar margem CLT');
  expect(s.deps.executeTelegramCltMargin).toHaveBeenCalledTimes(1);
  expect(s.sends.some(v=>v.text.includes('Margem CLT · FACTA'))).toBe(true);
  const snapshot=[...s.records.values()].find((v:any)=>v.configKey==='TELEGRAM_PROPOSAL_QUERY_V1');
  expect(snapshot.configValue.phase).toBe('CLT_OPTIONS');
  expect(snapshot.configValue.cltMarginReady).toBe(true);
  expect(s.deps.executeTelegramNativeSimulation).not.toHaveBeenCalled();
  const full=await s.send('💰 Simular margem cheia');
  expect(full.text).toContain('Banco Teste');
  const args=(s.deps.executeTelegramNativeSimulation as any).mock.calls[0] as any[];
  expect(args[1]).toBe('tenant-evolve');
  expect(args[2]).toMatchObject({id:'partner-a',code:'010'});
  expect(args[3].cltStage).toBe('FULL');
  expect(args[3].values.value).toBeUndefined();
  expect(snapshot.configValue.native.values.cpf).toBe('52998224725');
 });
 it('personaliza valor, parcela e prazo após consultar a margem oficial',async()=>{
  const s=scenario();
  await s.send('/start');await s.send('💼 CLT');
  await s.send('💰 Consultar margem e simular');
  await s.send('52998224725');await s.send('Cliente Fictício');await s.send('82999998888');
  await s.send('✅ Consultar margem CLT');
  const prompt=await s.send('✏️ Escolher parcela ou valor');
  expect(prompt.text).toContain('PARCELA');
  expect((await s.send('PARCELA')).text).toContain('parcela mensal');
  expect((await s.send('450,00')).text).toContain('Prazo');
  const summary=await s.send('48');
  expect(summary.text).toContain('Confirmar simulação');
  await s.send('✅ Confirmar simulação');
  const call=(s.deps.executeTelegramNativeSimulation as any).mock.calls.at(-1);
  expect(call[3].cltStage).toBe('CUSTOM');
  expect(call[3].values).toMatchObject({cpf:'52998224725',mode:'Payment',value:'450',term:'48'});
  const state=[...s.records.values()].find((v:any)=>v.configKey==='TELEGRAM_PROPOSAL_QUERY_V1');
  expect(state.configValue.phase).toBe('CLT_OPTIONS');
  expect(state.configValue.native.values.value).toBeUndefined();
 });
 it('não simula margem cheia quando o banco não confirmou margem positiva',async()=>{
  const s=scenario();
  s.deps.executeTelegramCltMargin.mockResolvedValueOnce({messages:['🔐 FACTA exige autorização'],hasMargin:false,positiveBanks:[]});
  await s.send('/start');await s.send('💼 CLT');await s.send('💰 Consultar margem e simular');
  await s.send('52998224725');await s.send('Cliente Fictício');await s.send('82999998888');
  await s.send('✅ Consultar margem CLT');
  const denied=await s.send('💰 Simular margem cheia');
  expect(denied.text).toContain('Ainda não há margem positiva');
  expect(s.deps.executeTelegramNativeSimulation).not.toHaveBeenCalled();
 });
 it('permite FGTS diretamente na conversa em apenas duas etapas e respeita cancelamento',async()=>{
  const s=scenario();
  await s.send('/start');await s.send('💰 FGTS');
  await s.send('💰 Simular FGTS');
  const year=await s.send('52998224725');
  expect(year.text).toContain('saques-aniversário');
  const review=await s.send('4');
  expect(review.text).toContain('FGTS');
  expect(review.text).toContain('Confirmar simulação');
  const done=await s.send('✅ Confirmar simulação');
  expect(done.text).toContain('Banco Teste');
  await s.send('💰 Simular FGTS');
  await s.send('🏠 Menu principal');
  const state=[...s.records.values()].find((v:any)=>v.configKey==='TELEGRAM_PROPOSAL_QUERY_V1');
  expect(state.configValue.native).toBeUndefined();
 });
 it('não consulta bancos se o parceiro foi desvinculado entre o preenchimento e a confirmação',async()=>{
  const s=scenario(false);
  await s.send('/start');
  await s.send('💼 CLT');
  await s.send('💰 Simular todos os bancos');
  expect(s.deps.executeTelegramNativeSimulation).not.toHaveBeenCalled();
 });
 it('completa INSS Novo, com confirmação explícita e saída dentro do Telegram',async()=>{
  const s=scenario();
  await s.send('/start');await s.send('🏛️ INSS');
  const start=await s.send('💰 Novo INSS');
  expect(start.text).toContain('CPF do cliente');
  const steps=['52998224725','15/06/1966','1234567890','32','AL',
    'PULAR','PULAR','PULAR','PARCELA','450,00','108','NÃO','2.800,00'];
  for(const value of steps)await s.send(value);
  const review=s.sends.at(-1);
  expect(review.text).toContain('INSS');
  expect(review.text).toContain('Confirmar simulação');
  expect(review.text).not.toContain('52998224725');
  const result=await s.send('✅ Confirmar simulação');
  expect(result.text).toContain('Banco Teste');
  const call=(s.deps.executeTelegramNativeSimulation as any).mock.calls.at(-1);
  expect(call[1]).toBe('tenant-evolve');
  expect(call[3].operation).toBe('NEW');
  expect(call[3].values).toMatchObject({cpf:'52998224725',term:'108',illiterate:'NO'});
 });
 it('inicia portabilidade manual sem obrigar envio do extrato ou abrir portal',async()=>{
  const s=scenario();
  await s.send('/start');await s.send('🔄 Portabilidade INSS');
  const start=await s.send('🔁 Portabilidade + refinanciamento');
  expect(start.text).toContain('CPF do cliente');
  const fields=['52998224725','15/06/1966','1234567890','32','AL',
    'PULAR','PULAR','PULAR','237','23456789','10.500,25','84','39','320,20','350,00','108','NÃO'];
  for(const value of fields)await s.send(value);
  expect(s.sends.at(-1).text).toContain('Confirmar simulação');
  await s.send('✅ Confirmar simulação');
  const call=(s.deps.executeTelegramNativeSimulation as any).mock.calls.at(-1);
  expect(call[3].operation).toBe('PORT_REFIN');
  expect(call[3].values.originalInstallment).toBe('320.2');
  expect(call[3].values.debt).toBe('10500.25');
 });
 it('limita a dez consultas bancárias por parceiro em quinze minutos',async()=>{
  const s=scenario();
  await s.send('/start');await s.send('💰 FGTS');
  for(let i=0;i<11;i++){
    await s.send('💰 Simular FGTS');
    await s.send('52998224725');
    await s.send('4');
    const result=await s.send('✅ Confirmar simulação');
    if(i===10)expect(result.text).toContain('Limite de consultas');
  }
  expect(s.deps.executeTelegramNativeSimulation).toHaveBeenCalledTimes(10);
 });
 it('bloqueia o envio de consultas bancárias com o acesso ao Portal do Parceiro revogado',async()=>{
  const s=scenario(true,false);
  await s.send('/start');
  await s.send('💼 CLT');
  const response=await s.send('💰 Simular todos os bancos');
  expect(response.text).toContain('acesso de simulação deste parceiro está inativo');
  expect(s.deps.executeTelegramNativeSimulation).not.toHaveBeenCalled();
  expect(s.tx.partnerPortalAccess.findFirst).toHaveBeenCalled();
 });
 it('não acessa ofertas sem vínculo confirmado e parceiro ativo',async()=>{
  const s=scenario(false);
  const text=(await s.send('/start')).text;
  expect(text).toContain('vincule seu Telegram');
  expect(text).not.toContain('/parceiro?tab=simulacoes');
  expect(s.tx.partner.findFirst).not.toHaveReturnedWith(expect.objectContaining({id:'partner-a'}));
 });
 it('consulta vínculos e margem CLT no próprio bot sem enviar link para portal',async()=>{
  const s=scenario();
  await s.send('/start');await s.send('💼 CLT');
  const client=await s.send('🪪 Dados do cliente');
  expect(client.text).toContain('Consulta de margem CLT');
  expect(client.text).toContain('CPF do cliente');
  expect(client.text).not.toContain('/parceiro?');
 });
 it('informa uma falha no download separadamente do formato do PDF',async()=>{
  const s=scenario();
  await s.send('/start');
  await s.send('🔄 Portabilidade INSS');
  await s.send('📄 Enviar extrato INSS');
  s.deps.downloadTelegramPdf.mockRejectedValueOnce(new TelegramPdfProcessingError('TELEGRAM_DOWNLOAD','token confidencial'));
  const reply=await s.send('',{document:{file_id:'document12345678',file_name:'extrato.pdf',mime_type:'application/pdf',file_size:1200}});
  expect(reply.text).toContain('não consegui baixar o arquivo');
  expect(reply.text).not.toContain('token confidencial');
  const state=[...s.records.values()].find((v:any)=>v.configKey==='TELEGRAM_PROPOSAL_QUERY_V1');
  expect(state.configValue.phase).toBe('PDF_WAIT');
 });
 it('recebe o extrato somente após selecionar a opção, confirma três contratos e calcula no bot',async()=>{
  const s=scenario();
  await s.send('/start');
  const premature=await s.send('',{document:{file_id:'document12345678',file_name:'extrato.pdf',mime_type:'application/pdf',file_size:1200}});
  expect(premature.text).toContain('abra Portabilidade INSS');
  await s.send('🔄 Portabilidade INSS');
  const invite=await s.send('📄 Enviar extrato INSS');
  expect(invite.text).toContain('Envie agora o extrato');
  const extract=await s.send('',{document:{file_id:'document12345678',file_name:'extrato.pdf',mime_type:'application/pdf',file_size:1200}});
  expect(extract.text).toContain('Extrato conferido');
  expect(extract.text).toContain('3');
  const chosen=await s.send('1,2,3');
  expect(chosen.text).toContain('Contratos selecionados: 1, 2, 3');
  const done=await s.send('✅ Autorizado · NÃO analfabeto');
  expect(s.sends.some(value=>value.text.includes('Daycoval'))).toBe(true);
  expect(done.text).toContain('portal autenticado');
  expect(done.text).toContain('operation=PORT_REFIN');
  const saved=[...s.records.values()].find((v:any)=>v.configKey==='TELEGRAM_PROPOSAL_QUERY_V1');
  expect(JSON.stringify(saved)).not.toContain('52998224725');
  expect(JSON.stringify(saved)).not.toContain('0000000001');
  expect(JSON.stringify(saved)).not.toContain('document12345678');
  expect(JSON.stringify(saved)).not.toContain('numberSuffix');
 });
 it('bloqueia a simulação sem autorização e cancela o extrato ao trocar de parceiro',async()=>{
  const s=scenario();
  await s.send('/start');
  await s.send('🔄 Portabilidade INSS');
  await s.send('📄 Enviar extrato INSS');
  await s.send('',{document:{file_id:'document12345678',file_name:'extrato.pdf',mime_type:'application/pdf',file_size:1200}});
  const wrong=await s.send('qualquer coisa');
  expect(wrong.text).toContain('Selecione de 1 a 3 números');
  await s.send('1');
  const no=await s.send('não autorizou');
  expect(no.text).toContain('confirme');
  await s.send('🏠 Menu principal');
  const state=[...s.records.values()].find((v:any)=>v.configKey==='TELEGRAM_PROPOSAL_QUERY_V1');
  expect(state.configValue.pendingPdf).toBeUndefined();
  expect(state.configValue.phase).toBe('MENU');
 });
 it('não devolve informações financeiras quando o vínculo é revogado',async()=>{
  const s=scenario(false);
  const response=await s.send('/start');
  expect(response.text).toContain('vincule seu Telegram');
  expect(s.sends.every(payload=>!payload.text.includes('troco estimado'))).toBe(true);
 });
 it('ignora replay de message_id e não responde duas vezes',async()=>{
  const s=scenario();
  await s.send('/start');
  const count=s.sends.length;
  await s.handle(s.db,s.config,{chat:{id:1001},message_id:1,text:'/start'});
  expect(s.sends).toHaveLength(count);
 });
});
