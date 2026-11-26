import {existsSync} from 'node:fs';
import {join} from 'node:path';
import type {TelegramPdfReview,TelegramSpreadsheetQuote} from './telegramInssPdfService.js';
import {daycovalShareSvg,type DaycovalShareData} from '../../src/lib/daycovalShareImage.js';
const n=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const sum=(v:(number|null)[])=>v.length&&v.every(x=>x!==null)?Math.round(v.reduce<number>((a,b)=>a+(b??0),0)*100)/100:null;
export function telegramDaycovalPrints(review:TelegramPdfReview,quotes:readonly TelegramSpreadsheetQuote[]):DaycovalShareData[]{
 return quotes.filter(q=>q.bank==='DAYCOVAL').map(q=>{
  const contracts=q.changes.map(c=>{
   const origin=review.contracts[c.index];if(!origin)throw Error('Contrato não encontrado.');
   return {bank:origin.bank.replace(/[^0-9]/g,'').slice(0,4),suffix:origin.numberSuffix.replace(/[^a-zA-Z0-9]/g,'').slice(-4),
    balance:n(origin.balance),remaining:n(origin.remaining),original:n(c.original),adjusted:n(c.adjusted),returnRate:n(c.returnRate)};
  });
  if(!contracts.length||contracts.length>3)throw Error('Composição inválida.');
  return {contracts,original:sum(contracts.map(c=>c.original)),adjusted:sum(contracts.map(c=>c.adjusted)),balance:sum(contracts.map(c=>c.balance)),refin:n(q.installment),rate:n(q.rate),term:n(q.term),table:q.table.slice(0,120),amount:n(q.contractAmount),cash:n(q.amount),version:q.version||''};
 });
}
export async function telegramDaycovalPng(data:DaycovalShareData):Promise<Uint8Array>{
 const {Resvg}=await import('@resvg/resvg-js');
 const root=join(process.cwd(),'node_modules','pdfjs-dist','standard_fonts');
 const fontFiles=['LiberationSans-Regular.ttf','LiberationSans-Bold.ttf'].map(name=>join(root,name)).filter(path=>existsSync(path));
 const renderer=new Resvg(daycovalShareSvg(data,'Cliente INSS'),{font:{loadSystemFonts:true,fontFiles,defaultFontFamily:fontFiles.length?'Liberation Sans':'DejaVu Sans'}});
 return renderer.render().asPng();
}
export async function sendTelegramDaycovalPrint(token:string,chatId:string,data:DaycovalShareData,fetcher:typeof fetch=fetch){
 const png=await telegramDaycovalPng(data);
 const body=new FormData();body.set('chat_id',chatId);body.set('caption','Daycoval · Reprodução da simulação. Valores sujeitos à conferência e aprovação bancária.');
 body.set('photo',new Blob([new Uint8Array(png)],{type:'image/png'}),'simulacao-daycoval.png');
 const response=await fetcher('https://api.telegram.org/bot'+token+'/sendPhoto',{method:'POST',body,signal:AbortSignal.timeout(12000),redirect:'error'});
 const result=await response.json().catch(()=>null);
 if(!response.ok||result?.ok!==true)throw Error('Não foi possível enviar a imagem.');
}
