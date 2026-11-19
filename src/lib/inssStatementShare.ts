import {buildPortRefinBreakdown,portabilityBreakdownText} from './portRefinBreakdown';
import {formatMonthlyRate} from './portRefinQuote';
import type {PortedInstallmentChange} from './portRefinBreakdown';

export type SharedMarginQuote={
  institution:string; table:string; amount:number;
  installment:number|null; term:number|null; rate:number|null;
  source:'API'|'PLANILHA';
  scenario?:'PROJECTED_2027';
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
  const parts=['*SIMULAÇÃO INSS · CONDIÇÕES SELECIONADAS*',customerName?'Cliente: '+customerName:''];
  if(selectedMargin)parts.push(
    '',
    selectedMargin.scenario==='PROJECTED_2027'?'*NOVO · PRÉVIA 2027 (SEM MARGEM LIBERADA)*':'*NOVO · MARGEM ATUAL*',
    'Banco: '+selectedMargin.institution,
    'Tabela: '+selectedMargin.table,
    (selectedMargin.scenario==='PROJECTED_2027'?'Valor bruto teórico, não liberado: ':'Valor estimado a liberar: ')+currency(selectedMargin.amount),
    'Parcela: '+currency(selectedMargin.installment),
    'Prazo: '+(selectedMargin.term?selectedMargin.term+' meses':'Não informado'),
    'Taxa: '+formatMonthlyRate(selectedMargin.rate),
    selectedMargin.scenario==='PROJECTED_2027'
      ? 'Fonte: taxa/prazo da cotação bancária vigente, reaplicados na fórmula Price; NÃO é cotação futura, aprovação ou valor líquido.'
      : selectedMargin.source==='PLANILHA'?'Fonte: planilha (estimativa)':'Fonte: consulta bancária',
  );
  for(const [index,row]of selectedPort.entries()){
    const condition=conditionFor(row);
    parts.push('',
      `*PORTABILIDADE ${index+1}${row.unified?' · UNIFICAÇÃO DAYCOVAL':''}*`,
      'Banco: '+row.provider,
      'Origem: '+(row.contractLabel||'Contrato informado'),
      'Tabela: '+(row.table?.name||row.table?.cod_tabela||'Condição calculada'),
      'Troco estimado: '+currency(row.troco),
      'Soma das parcelas originais: '+currency(row.originalInstallment),
      'Parcela do refinanciamento: '+currency(condition.installment),
      'Prazo: '+(row.term?row.term+' meses':'Não informado'),
      'Taxa: '+formatMonthlyRate(condition.rate),
    );
    if(row.provider.toUpperCase()==='DAYCOVAL'){
      const detail=buildPortRefinBreakdown(row.installmentChanges,condition.installment);
      if(detail)parts.push(portabilityBreakdownText(detail));
      else parts.push('Parcelas individuais ajustadas: não informadas pela planilha.');
    }
  }
  parts.push('','*Importante:* Valores para conferência, sujeitos às regras vigentes, autorização e aprovação bancária. '+(selectedMargin?.scenario==='PROJECTED_2027'
    ? 'A parcela futura de R$ 42,00 AINDA NÃO está liberada; projeção teórica, sem consulta de margem futura aos bancos.'
    : 'A margem projetada de 2027 não foi incluída.'));
  return parts.filter(Boolean).join('\n');
}
