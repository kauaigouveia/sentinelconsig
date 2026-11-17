import type { PrismaClient } from '@prisma/client';
import { parseInssStatement } from '../../src/lib/inssStatement.js';
import { validateSimulationContracts, type PortabilityContractDraft } from '../../src/lib/multiContractSimulation.js';
import { parseCurrency } from '../../src/lib/utils.js';
import { money as moneyBR, portabilityInstallmentStatus } from '../../src/lib/portRefinBreakdown.js';
import { decodeDaycoval } from './daycovalWorkbook.js';
import { previewPortRefin } from './portRefinPreview.js';
import { SPREADSHEET_MODELS, type SpreadsheetBank } from './portRefinWorkbooks.js';

export const TELEGRAM_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const TELEGRAM_PDF_TTL_MS = 10 * 60 * 1000;
export const TELEGRAM_MAX_CHOSEN_CONTRACTS = 3;

export type TelegramPdfContract = {
  bank: string;
  numberSuffix: string;
  originalTerm: number;
  remaining: number;
  balance: number;
  installment: number;
};
export type TelegramPdfReview = {
  birthDate: string;
  benefitType: number;
  benefitStartDate: string;
  uf: string;
  benefitContractCount: number;
  loanMargin: number | null;
  contracts: TelegramPdfContract[];
};
type TelegramFile = { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
const money=(value:number|null|undefined)=>value != null && Number.isFinite(value)&&value>=0
  ?value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado';
const parsedMoney=(value:string):number|null=> {
  const n=parseCurrency(value);
  return n!=null&&Number.isFinite(n)&&n>=0?n:null;
};
const boundMessage=(text:string)=>text.slice(0,3850);

/** Safe, diagnostic-only statuses. Never include raw PDF text, CPF, NB, file_id or bank response. */
export type TelegramPdfFailureCode='TELEGRAM_DOWNLOAD'|'PDF_READER'|'PDF_CONTENT'|'PDF_TIMEOUT';
export class TelegramPdfProcessingError extends Error {
  constructor(public readonly code:TelegramPdfFailureCode,message:string){super(message);this.name='TelegramPdfProcessingError';}
}
export function telegramPdfErrorCode(error:unknown):TelegramPdfFailureCode{
  return error instanceof TelegramPdfProcessingError?error.code:'PDF_READER';
}
export function telegramPdfErrorMessage(error:unknown):string{
  switch(telegramPdfErrorCode(error)){
    case 'TELEGRAM_DOWNLOAD':return '⚠️ O Telegram recebeu o documento, mas não consegui baixar o arquivo para análise. Isso não significa que o PDF esteja incorreto. Envie o mesmo PDF novamente em alguns instantes. Nenhuma simulação foi salva.';
    case 'PDF_TIMEOUT':return '⚠️ O leitor do PDF excedeu o tempo disponível para processar o documento. O arquivo não foi considerado inválido. Você pode tentar novamente; se persistir, utilize o extrato no Portal do Parceiro. Nenhuma simulação foi salva.';
    case 'PDF_CONTENT':return '⚠️ O PDF foi recebido e aberto, mas o leitor não conseguiu confirmar todos os dados e contratos do extrato com segurança. Confira o arquivo no Portal do Parceiro ou solicite revisão à mesa. Nenhuma simulação foi salva.';
    default:return '⚠️ O arquivo foi recebido, mas houve uma falha técnica no leitor de PDF do servidor. O documento não foi declarado inválido. Tente novamente; se persistir, informe à mesa que houve falha de leitura no Telegram. Nenhuma simulação foi salva.';
  }
}

export function validateTelegramPdfDocument(document:TelegramFile):void{
  if(!document||!String(document.file_name||'').toLowerCase().endsWith('.pdf')||
      (document.mime_type!=null && document.mime_type!=='application/pdf'))
    throw Error('Envie um arquivo PDF textual válido, pelo botão de documento.');
  if(document.file_size!=null && (!Number.isSafeInteger(document.file_size)||document.file_size<200||
      document.file_size>TELEGRAM_PDF_MAX_BYTES))
    throw Error('O PDF deve ter entre 200 bytes e 5 MB.');
  if(!/^[A-Za-z0-9_-]{12,256}$/.test(document.file_id))
    throw Error('Identificador de documento inválido.');
}

/** Download only from Telegram's own fixed Bot API hostname; never follow a user supplied URL. */
export async function downloadTelegramPdf(token:string,document:TelegramFile,fetcher:typeof fetch=fetch):Promise<Uint8Array>{
  validateTelegramPdfDocument(document);
  try{
  const response=await fetcher('https://api.telegram.org/bot'+token+'/getFile',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({file_id:document.file_id}),signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw Error('O Telegram não disponibilizou o arquivo para leitura.');
  const result=await response.json().catch(()=>null) as any;
  if(result?.ok!==true||typeof result.result?.file_path!=='string')
    throw Error('O Telegram não retornou um arquivo válido.');
  const filePath=result.result.file_path as string;
  if(!/^documents\/[A-Za-z0-9_.-]+$/.test(filePath)||filePath.includes('..'))
    throw Error('Caminho do documento inválido no Telegram.');
  const length=Number(result.result.file_size);
  if(Number.isFinite(length)&&length>TELEGRAM_PDF_MAX_BYTES)
    throw Error('O PDF excede o limite de 5 MB.');
  const pdfResponse=await fetcher('https://api.telegram.org/file/bot'+token+'/'+filePath,{
    method:'GET',signal:AbortSignal.timeout(12000),redirect:'error',
  });
  if(!pdfResponse.ok)throw Error('Falha ao baixar o PDF do Telegram.');
  const contentLength=Number(pdfResponse.headers.get('content-length'));
  if(Number.isFinite(contentLength)&&contentLength>TELEGRAM_PDF_MAX_BYTES)
    throw Error('O arquivo excede 5 MB.');
  if(pdfResponse.body){
    const reader=pdfResponse.body.getReader();
    const chunks:Uint8Array[]=[];
    let size=0;
    try{
      while(true){
        const next=await reader.read();
        if(next.done)break;
        size+=next.value.byteLength;
        if(size>TELEGRAM_PDF_MAX_BYTES)throw Error('O PDF excede o limite de 5 MB.');
        chunks.push(next.value);
      }
    }finally{await reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);
    let position=0;
    for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
    if(bytes.length<200||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')
      throw Error('O documento recebido não é um PDF íntegro.');
    return bytes;
  }
  throw Error('O arquivo do Telegram não pode ser transferido.');
  }catch(error){
    if(error instanceof TelegramPdfProcessingError)throw error;
    throw new TelegramPdfProcessingError('TELEGRAM_DOWNLOAD','Falha ao obter o PDF do Telegram.');
  }
}

/** Same row-order extraction as the authorized browser parser, without saving the original PDF. */
export async function readTelegramInssPdf(bytes:Uint8Array):Promise<TelegramPdfReview>{
  if(bytes.byteLength<200||bytes.byteLength>TELEGRAM_PDF_MAX_BYTES||
      String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')
    throw Error('Selecione um PDF textual válido de até 5 MB.');
  // PDF.js on Node uses an in-process worker. Importing it explicitly also
  // makes Vercel's function file tracer include pdf.worker.mjs, which is a
  // dynamic dependency not guaranteed to be traced from pdf.mjs alone.
  let getDocument:typeof import('pdfjs-dist/legacy/build/pdf.mjs').getDocument;
  try{
    await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    ({getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'));
  }catch{
    throw new TelegramPdfProcessingError('PDF_READER','Leitor de PDF indisponível no servidor.');
  }
  let task:ReturnType<typeof getDocument>;
  try{task=getDocument({
    data:bytes,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,
    stopAtErrors:true,verbosity:0,
  });}catch{
    throw new TelegramPdfProcessingError('PDF_READER','Falha na inicialização do leitor de PDF.');
  }
  let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;void task.destroy();},28000);
  try{
    const pdf=await task.promise;
    if(pdf.numPages<1||pdf.numPages>20)throw Error('O extrato deve ter até 20 páginas.');
    const lines:string[]=[];
    for(let number=1;number<=pdf.numPages;number++){
      const page=await pdf.getPage(number);
      const {items}=await page.getTextContent();
      if(items.length>10000)throw Error('O extrato excede o limite de texto por página.');
      const parts=items.flatMap(item=>'str'in item&&item.str.trim()
        ?[{x:item.transform[4],y:item.transform[5],text:item.str}]:[]);
      parts.sort((a,b)=>b.y-a.y);
      let row:typeof parts=[];
      const finish=()=>{
        if(row.length)lines.push(row.sort((a,b)=>a.x-b.x).map(part=>part.text).join(' '));
        row=[];
      };
      for(const part of parts){if(row.length&&Math.abs(part.y-row[0].y)>2)finish();row.push(part);}
      finish();page.cleanup();
    }
    if(lines.length>1800)throw new TelegramPdfProcessingError('PDF_CONTENT','O extrato excede os limites de linhas.');
    let statement:ReturnType<typeof parseInssStatement>;
    try{statement=parseInssStatement(lines);}
    catch{throw new TelegramPdfProcessingError('PDF_CONTENT','Dados do extrato não reconhecidos pelo leitor.');}
    if(statement.issues.length)throw new TelegramPdfProcessingError('PDF_CONTENT','Há linhas de contrato incompletas ou divergentes.');
    if(!statement.contracts.length||statement.contracts.length>13)
      throw new TelegramPdfProcessingError('PDF_CONTENT','O extrato não possui quantidade válida de contratos.');
    try{validateSimulationContracts(statement.contracts);}catch{throw new TelegramPdfProcessingError('PDF_CONTENT','Dados financeiros dos contratos não passaram na validação.');}
    const contracts=statement.contracts.map((c:PortabilityContractDraft):TelegramPdfContract=>{
      const balance=parsedMoney(c.lastDueBalance),installment=parsedMoney(c.installmentFaceValue);
      if(balance==null||installment==null||balance<=0||installment<=0)throw Error('Contrato com valores inválidos no PDF.');
      return {
        bank:c.originLenderCode.replace(/[^0-9]/g,'').slice(0,4),
        numberSuffix:c.originContractNumber.replace(/[^A-Za-z0-9]/g,'').slice(-4),
        originalTerm:Number(c.originalTerm),
        remaining:Number(c.openedInstallmentNumber),balance,installment,
      };
    });
    // Deliberately omit CPF, full benefit number, customer name and complete contract identifiers.
    return {
      birthDate:statement.customer.birthDate,
      benefitType:Number(statement.customer.benefitType),
      benefitStartDate:statement.benefitStart,
      uf:statement.uf,
      benefitContractCount:statement.contracts.length,
      loanMargin:parsedMoney(statement.loanMargin),
      contracts,
    };
  }catch(error){
    if(timedOut)throw new TelegramPdfProcessingError('PDF_TIMEOUT','Tempo limite excedido ao ler o PDF.');
    if(error instanceof TelegramPdfProcessingError)throw error;
    throw new TelegramPdfProcessingError('PDF_READER','Falha ao extrair os dados do documento PDF.');
  }finally{clearTimeout(timeout);await task.destroy().catch(()=>{});}
}

export function telegramPdfReviewText(review:TelegramPdfReview):string{
  const lines=[
    '📄 Extrato INSS lido para conferência',
    'Espécie: '+review.benefitType+' · contratos: '+review.contracts.length,
    'Margem para novo empréstimo: '+money(review.loanMargin),
    '',
    'Contratos identificados (número completo oculto):',
    ...review.contracts.map((contract,index)=>String(index+1)+'. Banco '+contract.bank+
      ' · final '+contract.numberSuffix+' · parcela '+money(contract.installment)+
      ' · saldo '+money(contract.balance)+' · '+contract.remaining+' restantes'),
    '',
    review.contracts.length>3
      ?'Digite até 3 números separados por vírgula (ex.: 1,2,4) para comparar. Para os demais, repita a seleção depois.'
      :'Responda 1'+(review.contracts.length>1
        ?','+review.contracts.map((_,index)=>String(index+1)).slice(1).join(','):'')+
        ' para comparar os contratos ou escolha apenas o número desejado.',
    'A seguir você confirmará a autorização do cliente e a condição de alfabetização.',
  ];
  return boundMessage(lines.join('\n'));
}

export function parseTelegramSelectedContracts(value:string,count:number):number[]|null{
  if(!/^\s*\d{1,2}(?:\s*,\s*\d{1,2}){0,2}\s*$/.test(value))return null;
  const selected=value.split(',').map(item=>Number(item.trim())-1);
  if(new Set(selected).size!==selected.length||selected.length>TELEGRAM_MAX_CHOSEN_CONTRACTS||
      selected.some(index=>index<0||index>=count))return null;
  return selected;
}

export type TelegramQuoteResult={texts:string[];calculatedBanks:string[];unavailableBanks:string[]};
/** Read only; use exactly the tenant-bound stored workbooks and the approved calculation engine. */
export async function calculateTelegramInssQuotes(
  db:Pick<PrismaClient,'systemConfig'>,
  tenantId:string,
  review:TelegramPdfReview,
  selectedIndices:number[],
  illiterate:'YES'|'NO',
  calculate:typeof previewPortRefin=previewPortRefin,
):Promise<TelegramQuoteResult>{
  if(!tenantId||!['YES','NO'].includes(illiterate)||selectedIndices.length<1||
      selectedIndices.length>TELEGRAM_MAX_CHOSEN_CONTRACTS||
      new Set(selectedIndices).size!==selectedIndices.length||
      selectedIndices.some(i=>!Number.isInteger(i)||i<0||i>=review.contracts.length))
    throw Error('Seleção inválida para os contratos do extrato.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const chosen=selectedIndices.map(i=>review.contracts[i]);
  const rawContracts=chosen.map(c=>({
    originBank:c.bank,originalTerm:c.originalTerm,remaining:c.remaining,
    balance:c.balance,installment:c.installment,
  }));
  const raw={
    birthDate:review.birthDate,benefitType:review.benefitType,
    benefitStartDate:review.benefitStartDate,state:review.uf,illiterate,
    benefitContractCount:review.benefitContractCount,term:108,
  };
  const banks:SpreadsheetBank[]=['DAYCOVAL','C6','PARANA'];
  const texts:string[]=[];
  const calculatedBanks:string[]=[];
  const unavailableBanks:string[]=[];
  for(const bank of banks){
    const config=await db.systemConfig.findUnique({
      where:{tenantId_configKey:{tenantId,configKey:SPREADSHEET_MODELS[bank].key}},
    });
    if(!config){unavailableBanks.push(bank+' (planilha não cadastrada)');continue;}
    let book;
    try{book=decodeDaycoval(config.configValue);}catch{unavailableBanks.push(bank+' (arquivo inválido)');continue;}
    if(book.enabled===false){unavailableBanks.push(bank+' (desabilitado)');continue;}
    let successes=0;
    for(const [position,contract]of rawContracts.entries()){
      try{
        const r=calculate(bank,book,{...raw,contracts:[contract]},today);
        const offer=[...r.offers].filter(o=>Number.isFinite(o.amount)&&o.amount>0)
          .sort((a,b)=>b.amount-a.amount)[0];
        if(!offer)continue;
        successes++;
        const original=chosen[position].installment;
        const adjusted=r.offers.find(o=>o===offer)?.installmentChanges?.[0]?.newInstallment;
        const originalLine='Parcela portada: '+money(original)+' → '+
          (adjusted!=null?money(adjusted):'recalculo não informado');
        texts.push('🏦 '+bank+' · Contrato '+String(selectedIndices[position]+1)+' (final '+
          chosen[position].numberSuffix+')\n'+
          'Tabela: '+String(offer.name||offer.code||'Condição calculada').slice(0,70)+'\n'+
          originalLine+'\n'+
          'Parcela do refin: '+money(Number(offer.installment))+'\n'+
          'Troco estimado: '+money(offer.amount)+' · '+offer.term+' meses · '+
          (Number.isFinite(Number(offer.rate))&&Number(offer.rate)>0 ? Number(offer.rate).toLocaleString('pt-BR',{maximumFractionDigits:3})+'% a.m.' : 'taxa não informada'));
      }catch{ /* Missing policy data or a calculation error is not an approved quote. */ }
    }
    if(bank==='DAYCOVAL'&&chosen.length>=2){
      const combinations=chosen.length===2?[[0,1]]:[[0,1],[0,2],[1,2],[0,1,2]];
      for(const group of combinations){
        try{
          const r=calculate(bank,book,{...raw,contracts:group.map(i=>rawContracts[i])},today);
          const offer=[...r.offers].filter(o=>Number.isFinite(o.amount)&&o.amount>0)
            .sort((a,b)=>b.amount-a.amount)[0];
          if(!offer)continue;
          successes++;
          const breakdown=group.map((i,n)=>{
            const original=chosen[i].installment;
            const adjusted=offer.installmentChanges?.[n]?.newInstallment;
            const status=portabilityInstallmentStatus({
              label:'Contrato '+(selectedIndices[i]+1),originalInstallment:original,
              newInstallment:adjusted==null?null:Number(adjusted),
            });
            return '  Contrato '+(selectedIndices[i]+1)+': '+money(original)+' → '+
              (adjusted!=null?money(adjusted):'não informado')+' ('+status.label+')';
          });
          texts.push('🔄 DAYCOVAL · Unificação '+group.map(i=>selectedIndices[i]+1).join('+')+'\n'+
            breakdown.join('\n')+'\nParcela do refin: '+money(Number(offer.installment))+
            '\nTroco estimado: '+money(offer.amount)+' · '+offer.term+' meses · '+
            (Number.isFinite(Number(offer.rate))&&Number(offer.rate)>0 ? Number(offer.rate).toLocaleString('pt-BR',{maximumFractionDigits:3})+'% a.m.' : 'taxa não informada'));
        }catch{ /* Do not claim an unavailable group as approved. */ }
      }
    }
    if(successes)calculatedBanks.push(bank);
    else unavailableBanks.push(bank+' (sem condição calculável para os dados informados)');
  }
  if(!texts.length)return {
    texts:['Não foi possível calcular cotações pelas planilhas ativas com os dados extraídos. Revise os dados e os roteiros no Portal do Parceiro. Nenhuma oferta bancária foi aprovada.'],
    calculatedBanks,unavailableBanks,
  };
  const disclaimer='\n\n⚠️ Estimativas de planilhas para conferência documental, vigência e política bancária. Não equivalem a aprovação, autorização nem contratação.';
  const headers='📊 Resultado das simulações INSS · Portabilidade + Refinanciamento\n\n';
  const messages:string[]=[];
  let current=headers;
  for(const quote of texts){
    if(current.length+quote.length+disclaimer.length>3450){
      messages.push(boundMessage(current+disclaimer));
      current='';
    }
    current+=quote+'\n\n';
  }
  if(current)messages.push(boundMessage(current+disclaimer));
  return {texts:messages,calculatedBanks,unavailableBanks};
}
