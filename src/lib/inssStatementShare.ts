import {originContractSuffix} from './portRefinBreakdown';
import {formatMonthlyRate} from './portRefinQuote';
import type {PortedInstallmentChange} from './portRefinBreakdown';

export type SharedMarginQuote={
  institution:string; table:string; amount:number;
  installment:number|null; term:number|null; rate:number|null;
  source:'API'|'PLANILHA';
  scenario?:'PROJECTED_2027';
  calculatedByApi?:boolean;
};
export type SharedPortQuote={
  provider:string; contractLabel?:string; unified?:boolean;
  table?:{name?:string;cod_tabela?:string};
  troco?:number|null; originalInstallment?:number;
  term?:number; installmentChanges?:PortedInstallmentChange[];
  requiresReview?:boolean;
};
const currency=(n:number|null|undefined)=>n!=null&&Number.isFinite(n)&&n>0
  ? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : 'Não informado';

export function inssStatementWhatsAppText(
  customerName:string,
  selectedMargin:SharedMarginQuote|null,
  selectedPort:readonly SharedPortQuote[],
  conditionFor:(row:SharedPortQuote)=>{installment?:number|null;rate?:number|null},
):string {
  if(!selectedMargin && !selectedPort.length)return '';
  const blocks=['*SIMULAÇÃO INSS*'+(customerName?'\nCliente: '+customerName:'')];
  if(selectedMargin){
    const future=selectedMargin.scenario==='PROJECTED_2027';
    const lines=[future?'*NOVO · AUMENTO DE MARGEM 2027*':'*NOVO · MARGEM ATUAL*',
      'Banco: '+selectedMargin.institution,
      (future&&!selectedMargin.calculatedByApi?'Valor bruto estimado: ':'Valor estimado: ')+currency(selectedMargin.amount),
      'Parcela: '+currency(selectedMargin.installment),
      'Prazo: '+(selectedMargin.term?selectedMargin.term+' meses':'Não informado')];
    if(selectedMargin.table&&!/não identificad|não retorn|não informad/i.test(selectedMargin.table))lines.splice(2,0,'Tabela: '+selectedMargin.table);
    if(selectedMargin.rate!=null&&selectedMargin.rate>0)lines.push('Taxa: '+formatMonthlyRate(selectedMargin.rate));
    if(future)lines.push('⚠ Margem futura ainda não liberada.');
    blocks.push(lines.join('\n'));
  }
  for(const [index,row]of selectedPort.entries()){
    const condition=conditionFor(row);
    const suffixes=(row.installmentChanges||[]).map(c=>originContractSuffix(c.contractSuffix)).filter(Boolean);
    const lines=[`*PORTABILIDADE ${index+1} + REFINANCIAMENTO*`,'Banco: '+row.provider];
    const table=row.table?.name||row.table?.cod_tabela;
    if(table)lines.push('Tabela: '+table);
    if(row.unified)lines.push('Operação: Unificação'+(row.installmentChanges?.length?' de '+row.installmentChanges.length+' contratos':''));
    if(suffixes.length)lines.push('Contratos: finais '+suffixes.join(' e '));
    else if(row.contractLabel)lines.push('Origem: '+row.contractLabel);
    lines.push('*Troco estimado: '+currency(row.troco)+'*','Parcela atual: '+currency(row.originalInstallment),
      'Parcela do refinanciamento: '+currency(condition.installment),'Prazo: '+(row.term?row.term+' meses':'Não informado'));
    if(condition.rate!=null&&condition.rate>0)lines.push('Taxa: '+formatMonthlyRate(condition.rate));
    blocks.push(lines.join('\n'));
  }
  blocks.push('_Valores sujeitos à conferência e aprovação bancária._');
  return blocks.join('\n\n');
}
