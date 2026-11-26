import {originContractSuffix, type PortedInstallmentChange} from './portRefinBreakdown';
import type {PortabilityContractDraft} from './multiContractSimulation';
import {parseCurrency} from './utils';

type Quote={
 provider:string; troco?:number|null; term?:number; table?:{name?:string;cod_tabela?:string};
 installmentChanges?:PortedInstallmentChange[];sourceContracts?:PortabilityContractDraft[];
 sourceForm?:Partial<PortabilityContractDraft>;sourceVersionDate?:string|null;
 data?:{contractAmount?:number;installment?:number;rate?:number;policyStatus?:string};
};
type Condition={installment?:number|null;rate?:number|null};
const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const money=(v:unknown)=>numeric(v)==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const rate=(v:unknown)=>numeric(v)==null||v===0?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:3})+'%';
const sum=(values:(number|null)[])=>values.length&&values.every(v=>v!==null)?Math.round(values.reduce<number>((n,v)=>n+(v??0),0)*100)/100:null;
const masked=(v:unknown)=>originContractSuffix(v);
export function daycovalShareData(row:Quote,condition:Condition){
 if(row.provider.toUpperCase()!=='DAYCOVAL'||numeric(row.troco)==null||Number(row.troco)<=0)throw Error('Selecione uma condição Daycoval calculada.');
 const source=row.sourceContracts?.length?row.sourceContracts:row.sourceForm?[row.sourceForm]:[];
 const changes=row.installmentChanges||[];
 if(!changes.length||changes.length>3)throw Error('Composição dos contratos indisponível. Refaça a simulação.');
 const contracts=changes.map((c,i)=>{
   const bySuffix=c.contractSuffix?source.find(d=>masked(d.originContractNumber)===masked(c.contractSuffix)&&(!c.bankCode||d.originLenderCode===c.bankCode)):undefined;
   const draft=bySuffix||(!c.contractSuffix&&source.length===changes.length?source[i]:undefined);
   return {suffix:masked(c.contractSuffix||draft?.originContractNumber),bank:c.bankCode||draft?.originLenderCode||'—',
     balance:draft?.lastDueBalance?numeric(parseCurrency(draft.lastDueBalance)):null,
     remaining:draft?.openedInstallmentNumber&&/^\d+$/.test(draft.openedInstallmentNumber)?numeric(Number(draft.openedInstallmentNumber)):null,
     original:numeric(c.originalInstallment),adjusted:numeric(c.newInstallment),returnRate:numeric(c.returnRate)};
 });
 return {contracts,original:sum(contracts.map(c=>c.original)),adjusted:sum(contracts.map(c=>c.adjusted)),
   balance:sum(contracts.map(c=>c.balance)),refin:numeric(condition.installment),rate:numeric(condition.rate),
   term:numeric(row.term),table:row.table?.name||row.table?.cod_tabela||'Tabela não informada',
   amount:numeric(row.data?.contractAmount),cash:numeric(row.troco),version:row.sourceVersionDate||''};
}
export type DaycovalShareData = ReturnType<typeof daycovalShareData>;
type CellPainter=(x:number,y:number,w:number,h:number,label:string,fill?:string,color?:string,bold?:boolean,align?:'left'|'center',size?:number)=>void;
function paintDaycoval(d:DaycovalShareData,customerName:string,draw:CellPainter){
 const blue='#09265b',line='#8f9aa7',ink='#10213b',green='#c8e7bc',pale='#fff2cf',white='#ffffff';
 function cell(x:number,y:number,w:number,h:number,label:string,fill=white,color=ink,bold=false,align:'left'|'center'='center',size=24){draw(x,y,w,h,label,fill,color,bold,align,size);}
 cell(24,22,1452,54,'DAYCOVAL  |  SIMULADOR COM SALDO',blue,white,true,'left',30);
 cell(24,76,1452,48,'Reprodução de simulação • Sentinel Consig  |  '+customerName,white,ink,true,'left',23);
 const x=24,w=1452,left=330,col=(w-left)/(d.contracts.length+1);
 const rows:[string,(c:typeof d.contracts[number])=>string,string,string,string,boolean][]=[
 ['PORTABILIDADE',c=>c.suffix?'Banco '+c.bank+' · final '+c.suffix:'Banco '+c.bank,'TOTAL',blue,white,true],
 ['Saldo devedor',c=>money(c.balance),money(d.balance),pale,ink,true],
 ['Parcelas em aberto',c=>c.remaining==null?'—':String(c.remaining),'—',pale,ink,false],
 ['Valor parcela',c=>money(c.original),money(d.original),pale,ink,true],
 ['Taxa retorno',c=>rate(c.returnRate),'—',blue,white,true],
 ['NOVA PARCELA',c=>money(c.adjusted),money(d.adjusted),green,ink,true],
 ];
 rows.forEach(([label,value,total,fill,color,bold],i)=>{
  const y=146+i*47;cell(x,y,left,47,label,fill,color,bold,'left');
  d.contracts.forEach((c,j)=>cell(x+left+j*col,y,col,47,value(c),fill,color,bold,'center',22));
  cell(x+left+d.contracts.length*col,y,col,47,total,fill,color,bold);
 });
 cell(24,450,350,55,'Parcela do refin',blue,white,true,'left');
 cell(374,450,270,55,money(d.refin),white,ink,true);
 cell(668,450,380,55,'Prazo selecionado',blue,white,true,'left');
 cell(1048,450,428,55,d.term==null?'—':d.term+' meses',white,ink,true);
 const widths=[500,170,240,240,302],labels=['REFIN PORT · Tabela selecionada','Taxa','Valor contrato','Saldo devedor','Líquido cliente'];
 const vals=[d.table,rate(d.rate),money(d.amount),money(d.balance),money(d.cash)];
 let pos=24;labels.forEach((label,i)=>{cell(pos,532,widths[i],50,label,blue,white,true,'center',21);cell(pos,582,widths[i],70,vals[i],i===4?green:white,ink,true,'center',i===0?20:25);pos+=widths[i];});
 cell(24,674,1452,44,'Resultado: estimativa para conferência, sujeita à aprovação bancária.',white,ink,true,'left',22);
 cell(24,718,1452,44,'Reprodução dos dados calculados — não é print original nem aprovação do banco.'+(d.version?'  |  Planilha: '+d.version:''),white,ink,false,'left',20);
}
export function renderDaycovalShare(row:Quote,condition:Condition,customerName:string){
 const d=daycovalShareData(row,condition);
 const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=800;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível gerar a imagem.');
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1500,800);
 paintDaycoval(d,customerName,(x,y,w,h,label,fill='#ffffff',color='#10213b',bold=false,align='center',size=24)=>{
  ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#8f9aa7';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);
  ctx.save();ctx.beginPath();ctx.rect(x+5,y+2,w-10,h-4);ctx.clip();
  ctx.fillStyle=color;ctx.font=(bold?'700 ':'400 ')+size+'px Arial';ctx.textAlign=align;ctx.textBaseline='middle';
  ctx.fillText(label,align==='left'?x+14:x+w/2,y+h/2,w-25);ctx.restore();
 });
 return canvas;
}
const escapeXml=(v:string)=>v.replace(/[\u0000-\u001f]/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function daycovalShareSvg(d:DaycovalShareData,customerName='Cliente INSS'){
 const cells:string[]=[];
 paintDaycoval(d,customerName,(x,y,w,h,label,fill='#ffffff',color='#10213b',bold=false,align='center',size=24)=>{
  const safe=escapeXml(label);
  const fit=Math.min(size,(w-25)/Math.max(1,label.length*.58));
  cells.push('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+'" stroke="#8f9aa7"/><text x="'+(align==='left'?x+14:x+w/2)+'" y="'+(y+h/2+fit*.35)+'" text-anchor="'+(align==='left'?'start':'middle')+'" font-family="DejaVu Sans, Arial, sans-serif" font-size="'+fit+'" font-weight="'+(bold?700:400)+'" fill="'+color+'">'+safe+'</text>');
 });
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="800" viewBox="0 0 1500 800"><rect width="1500" height="800" fill="white"/>'+cells.join('')+'</svg>';
}
export async function saveDaycovalShare(row:Quote,condition:Condition,customerName:string,copy:boolean){
 const canvas=renderDaycovalShare(row,condition,customerName);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Não foi possível gerar PNG.')),'image/png'));
 if(copy){
  if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw Error('Seu navegador não permite copiar imagens. Use Salvar imagem.');
  await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);return;
 }
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='simulacao-daycoval.png';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
