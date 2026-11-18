import {isValidCpf} from './utils';
import {contractKey,type PortabilityContractDraft} from './multiContractSimulation';
import type {InssStatement} from './inssStatement';

const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const amount=String.raw`(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`;
const loanPattern=new RegExp(
 String.raw`(?:^|\s)(\d{1,3})\s*-\s*[^\n]*?(\d{2}\/\d{4})\s+(\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,3})\s*\/\s*(\d{1,3})\s+(`+
 amount+String.raw`)\s+(`+amount+String.raw`)\s+[\d.,]+\s+(`+amount+String.raw`)(?:\s|$)`);
const iso=(value:string):string=>{
 const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
 if(!m)return '';
 const date=m[3]+'-'+m[2]+'-'+m[1];
 const check=new Date(date+'T00:00:00Z');
 return Number.isFinite(check.getTime())&&check.toISOString().startsWith(date)?date:'';
};
const cash=(value:string):string=>value.replace(/\./g,'').replace(',','.');

/** MultiCorban: "Parcelas 44 / 54" means remaining / original.
 * Never treat the separately listed RMC/RCC cards as loan contracts.
 */
export function parseMultiCorbanStatement(input:readonly string[]):InssStatement{
 const lines=input.map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean);
 const raw=lines.join('\n'),source=fold(raw);
 if(!source.includes('demonstrativo de emprestimos consignados')||
    !source.includes('contratos de emprestimos')||
    !source.includes('numero do beneficio'))
  throw Error('Demonstrativo MultiCorban não identificado.');
 const field=(pattern:RegExp)=>pattern.exec(source)?.[1]?.trim()||'';
 const cpf=field(/\bcpf:\s*([\d.\-]+)/).replace(/\D/g,'');
 const benefitNumber=field(/numero do beneficio:\s*([\d.\-]+)/).replace(/\D/g,'');
 const name=(/\bnome:\s*([^\n]+?)\s+n[uú]mero do benef[ií]cio:/i.exec(raw)?.[1]||'').trim();
 const birthDate=iso(field(/data nascimento:\s*(\d{2}\/\d{2}\/\d{4})/));
 const benefitType=field(/\bespecie:\s*(\d{1,3})/);
 const uf=field(/\buf:\s*([a-z]{2})\b/).toUpperCase();
 if(!isValidCpf(cpf)||!/^\d{10}$/.test(benefitNumber)||!name||
    !birthDate||!benefitType||!/^\w{2}$/.test(uf))
  throw Error('Dados obrigatórios inconsistentes no demonstrativo MultiCorban.');
 const margin=field(/margem emprestimo:\s*r?\$?\s*(-?\d[\d.]*,\d{2})/);
 const cardMargin=field(/margem para cartao:\s*r?\$?\s*(-?\d[\d.]*,\d{2})/);
 const benefitCardMargin=field(/cartao beneficio:\s*r?\$?\s*(-?\d[\d.]*,\d{2})/);
 const blocked=/bloqueado para emprestimo:\s*bloqueado para emprestimo/.test(source);
 const representative=/possui representante legal:\s*possui representante legal/.test(source)?
   true:/possui representante legal:\s*nao possui representante legal/.test(source)?false:undefined;
 const sectionStart=lines.findIndex(line=>fold(line).includes('contratos de emprestimos'));
 const sectionEnd=lines.findIndex((line,index)=>index>sectionStart&&
   /contratos de cartao|observacao|demonstrativo para simples conferencia/.test(fold(line)));
 const loanLines=lines.slice(sectionStart+1,sectionEnd<0?undefined:sectionEnd);
 const blocks:{status:string;lines:string[]}[]=[];
 let current:{status:string;lines:string[]}|null=null;
 for(const line of loanLines){
  const m=/^situa[cç][aã]o:\s*(ativo|inativo|encerrado|cancelado|suspenso)\b/i.exec(line);
  if(m){
   if(current)blocks.push(current);
   current={status:fold(m[1]),lines:[]};
  }else if(current)current.lines.push(line);
 }
 if(current)blocks.push(current);
 const issues:string[]=[];
 const records=new Map<string,PortabilityContractDraft>();
 for(const block of blocks){
  if(block.status!=='ativo')continue;
  const match=loanPattern.exec(block.lines.join(' '));
  if(!match){issues.push('Linha ativa com colunas de empréstimo incompletas.');continue;}
  const [,bank,,,,remainingText,totalText,installmentText,,balanceText]=match;
  // The PDF may break an identifier across lines, e.g. ...0824 and "8".
  const ids=block.lines.flatMap(line=>{
   const m=/^([\d][\d.\/-]{6,30})(?=\s|$)/.exec(line);
   return m?[m[1]]:[];
  });
  if(ids.length!==1){issues.push('Identificador do contrato ausente ou ambíguo.');continue;}
  let number=ids[0];
  const suffix=block.lines.filter(line=>/^\d$/.test(line));
  if(suffix.length>1){issues.push('Identificador de contrato fragmentado.');continue;}
  if(suffix.length===1)number+=suffix[0];
  const remaining=Number(remainingText),total=Number(totalText);
  const installment=Number(cash(installmentText)),balance=Number(cash(balanceText));
  if(!Number.isInteger(remaining)||!Number.isInteger(total)||remaining<1||
    total<remaining||total>360||!Number.isFinite(installment)||installment<=0||
    !Number.isFinite(balance)||balance<=0){
    issues.push('Contrato com parcelas ou valores inválidos.');continue;
  }
  const draft:PortabilityContractDraft={
    originContractNumber:number,originLenderCode:bank.padStart(3,'0'),
    originalTerm:String(total),openedInstallmentNumber:String(remaining),
    installmentFaceValue:installmentText,lastDueBalance:balanceText,
  };
  const key=contractKey(draft);
  if(records.has(key)){issues.push('Contrato duplicado.');records.delete(key);}
  else records.set(key,draft);
 }
 if(!blocks.length)issues.push('Nenhum empréstimo localizado na tabela.');
 return {
  customer:{cpf,name,benefitNumber,birthDate,benefitType},
  income:'',loanMargin:margin?cash(margin):'',
  cardMargin:cardMargin?cash(cardMargin):'',
  benefitCardMargin:benefitCardMargin?cash(benefitCardMargin):'',
  // DDB is not DIB. Do not fabricate a benefit start date from DDB.
  benefitStart:'',uf,reference:'',legalRepresentative:representative,
  loanBlocked:blocked,contracts:[...records.values()],issues,
 };
}
