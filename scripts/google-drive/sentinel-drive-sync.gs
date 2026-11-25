// Google Apps Script independente do EVOLVE BI. Ative o serviço avançado Drive API (v3).
// Propriedades: SENTINEL_DRIVE_SYNC_TOKEN (mesmo segredo do Sentinel), SENTINEL_DRIVE_MODE=preview.
// Após conferência completa, habilite apply também na Vercel e mude a propriedade para apply.
const SENTINEL_DRIVE_FOLDER_ID='1Ee1lA31ykwFvDTV-TgETFR8ug6CePZsA';
const SENTINEL_DRIVE_URL='https://evolve.sentinelconsig.com.br/api/drive/extractor-inbound';
function hexDrive_(bytes){return bytes.map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function syncSentinelDrive(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {ok:false,code:'busy'};
 let temporary=null;
 try{
  const p=PropertiesService.getScriptProperties(),token=(p.getProperty('SENTINEL_DRIVE_SYNC_TOKEN')||'').trim(),mode=p.getProperty('SENTINEL_DRIVE_MODE')||'preview';
  if(token.length<48||!['preview','apply'].includes(mode))throw Error('Configure as propriedades do Sentinel.');
  const files=DriveApp.getFolderById(SENTINEL_DRIVE_FOLDER_ID).getFiles();let latest=null;
  while(files.hasNext()){const f=files.next();if(/\.xlsx$/i.test(f.getName())&&(!latest||f.getLastUpdated().getTime()>latest.getLastUpdated().getTime()))latest=f;}
  if(!latest)return {ok:false,code:'empty'};
  if(latest.getSize()>4*1024*1024)throw Error('Extrator acima de 4 MB.');
  const blob=latest.getBlob(),hash=hexDrive_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,blob.getBytes()));
  const key='SENTINEL_DRIVE_'+mode.toUpperCase(),prior=JSON.parse(p.getProperty(key)||'{}');
  const preview=JSON.parse(p.getProperty('SENTINEL_DRIVE_PREVIEW')||'{}');
  if(mode==='apply'&&(preview.hash!==hash||preview.offset!==null))return {ok:false,code:'preview_required'};
  if(prior.hash===hash&&prior.offset===null)return {ok:true,skipped:true};
  let state=prior.hash===hash?prior:{hash,offset:0,total:0,eligible:0,created:0,existing:0,conflicts:0,invalid:0,reasons:{}};
  // Convert locally in the user's Google account; temporary spreadsheet is never shared.
  temporary=Drive.Files.create({name:'Sentinel temporário '+Date.now(),mimeType:'application/vnd.google-apps.spreadsheet'},blob,{fields:'id'}).id;
  const book=SpreadsheetApp.openById(temporary),required=['NUM_PROPOSTA','COD_CPF_CLIENTE','NOM_CLIENTE','COD_PRODUTOR_VENDA','NOM_PRODUTOR_VENDA','NOM_BANCO','DSC_TIPO_PROPOSTA_EMPRESTIMO','DSC_CONVENIO','DSC_SITUACAO_EMPRESTIMO','DAT_CTR_INCLUSAO','VAL_BRUTO','VAL_LIQUIDO','VAL_PRESTACAO','QTD_PARCELA'];
  let sheet=null,headers=null;
  for(const s of book.getSheets()){if(s.getLastColumn()>256)continue;const h=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].map(x=>x.trim().toUpperCase().replace(/^\uFEFF/,''));if(required.every(k=>h.includes(k))){sheet=s;headers=h;break;}}
  if(!sheet)throw Error('Cabeçalho incompatível.');
  if(sheet.getLastRow()>50001)throw Error('Extrator acima de 50 mil linhas.');
  const vals=sheet.getDataRange().getValues(),display=sheet.getDataRange().getDisplayValues(),seen=new Set(),rows=[];
  const col=k=>headers.indexOf(k);
  for(let i=1;i<vals.length;i++){
   const text=k=>{const j=col(k);if(j<0)return '';const v=vals[i][j];return typeof v==='number'?String(v):String(display[i][j]||'').trim();};
   const num=k=>{const j=col(k);if(j<0)return null;const v=vals[i][j];if(v===''||v==null)return null;if(typeof v==='number')return Number.isFinite(v)?v:null;const s=String(v).trim().replace(/R\$\s*/,'');const n=Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);return Number.isFinite(n)?n:null;};
   const id=text('NUM_PROPOSTA');if(!id&&!text('COD_CPF_CLIENTE')&&!text('NOM_BANCO'))continue;
   if(id&&seen.has(id.toUpperCase()))throw Error('Número de proposta duplicado na linha '+(i+1));seen.add(id.toUpperCase());
   const cpf=text('COD_CPF_CLIENTE').replace(/[.\-\s]/g,''),rawDate=vals[i][col('DAT_CTR_INCLUSAO')],dateText=text('DAT_CTR_INCLUSAO');
   let created=rawDate instanceof Date?Utilities.formatDate(rawDate,book.getSpreadsheetTimeZone(),'yyyy-MM-dd'):dateText;
   const br=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(created);if(br)created=br[3]+'-'+br[2]+'-'+br[1];else if(/^\d{4}-\d{2}-\d{2}/.test(created))created=created.slice(0,10);
   rows.push({line:i+1,id,cpf:/^\d{1,11}$/.test(cpf)?cpf.padStart(11,'0'):cpf,clientName:text('NOM_CLIENTE'),partner:text('COD_PRODUTOR_VENDA'),producer:text('NOM_PRODUTOR_VENDA'),bank:text('NOM_BANCO'),modality:text('DSC_TIPO_PROPOSTA_EMPRESTIMO'),convenio:text('DSC_CONVENIO'),status:text('DSC_SITUACAO_EMPRESTIMO'),created,gross:num('VAL_BRUTO'),net:num('VAL_LIQUIDO'),installment:num('VAL_PRESTACAO'),term:num('QTD_PARCELA'),debt:num('VAL_SALDO_REFINANCIAMENTO'),commissionRate:num('PCL_COMISSAO')});
  }
  if(!rows.length)throw Error('Extrator vazio.');
  state.total=rows.length;
  for(let i=0;i<2&&state.offset!==null;i++){
   const batch=rows.slice(state.offset,state.offset+250);
   if(!batch.length)throw Error('Posição de importação inválida.');
   const response=UrlFetchApp.fetch(SENTINEL_DRIVE_URL,{method:'post',contentType:'application/json',payload:JSON.stringify({version:1,mode,hash,offset:state.offset,rows:batch}),headers:{Authorization:'Bearer '+token},muteHttpExceptions:true,followRedirects:false});
   if(response.getResponseCode()!==200)throw Error('Sentinel recusou lote: HTTP '+response.getResponseCode());
   const x=JSON.parse(response.getContentText()),keys=['eligible','created','existing','conflicts','invalid'];
   if(!keys.every(k=>Number.isSafeInteger(x[k])&&x[k]>=0)||keys.reduce((n,k)=>n+x[k],0)!==batch.length)throw Error('Resposta inválida do Sentinel.');
   for(const k of keys)state[k]+=x[k];for(const k of Object.keys(x.reasons||{}))state.reasons[k]=(state.reasons[k]||0)+x.reasons[k];
   state.offset=state.offset+batch.length<rows.length?state.offset+batch.length:null;p.setProperty(key,JSON.stringify(state));
  }
  console.log(JSON.stringify({mode,total:state.total,nextOffset:state.offset,eligible:state.eligible,created:state.created,existing:state.existing,conflicts:state.conflicts,invalid:state.invalid,reasons:state.reasons}));
  return {ok:true,...state};
 }finally{
  try{if(temporary)DriveApp.getFileById(temporary).setTrashed(true);}finally{lock.releaseLock();}
 }
}
function installSentinelDriveTrigger(){
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='syncSentinelDrive'))ScriptApp.newTrigger('syncSentinelDrive').timeBased().everyMinutes(15).create();
}
