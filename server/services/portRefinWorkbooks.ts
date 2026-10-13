import { importDaycoval, simulateDaycoval, DaycovalCalculator, type DaycovalWorkbook, serial, parseDate } from './daycovalWorkbook.js';
import { c6ConditionEligible } from '../../src/lib/c6Eligibility.js';
export type SpreadsheetBank = 'DAYCOVAL' | 'C6' | 'PARANA';
export const SPREADSHEET_MODELS = {
  DAYCOVAL: { key: 'DAYCOVAL_INSS_WORKBOOK_V1', label: 'Daycoval', extensions: ['.xlsx'], hash: '6e0eacd03bb614e7a257cae03b8c7844f4f1436abd14cad78124369427dfb1af', sheets: undefined },
  C6: { key: 'C6_PORT_REFIN_WORKBOOK_V1', label: 'C6', extensions: ['.xlsx', '.xlsm'], hash: 'db9afab9b88a4dcf391b704642f3534e9d4d9f81dc21e473a1940656821a5aef', sheets: ['Simulador Port','Planilha 1','PZO','VL_PARC'] },
  PARANA: { key: 'PARANA_PORT_REFIN_WORKBOOK_V1', label: 'Paraná', extensions: ['.xlsx'], hash: 'b2b070b28d91c88e71708351d45a49175a5cad79defbe6af2c00d792253effda', sheets: ['Simulador Portabilidade e Refin','Premissas Convênios','Build Up'] },
};
export async function importPortRefin(bank: SpreadsheetBank, buffer: Buffer, name: string) {
  const model=SPREADSHEET_MODELS[bank];
  if(!model.extensions.some(extension=>name.toLowerCase().endsWith(extension)))throw new Error('Formato de arquivo inválido para este banco.');
  const book=await importDaycoval(buffer,name,model.hash,model.sheets);
  if(bank==='C6')book.terms=[108];
  if(bank==='PARANA') {
    const s=book.sheets['Premissas Convênios'];
    if(s.cells.A8!=='INSS')throw new Error('A linha INSS da planilha Paraná mudou.');
    const minimum=Number(s.cells.I8),maximum=Number(s.cells.J8);
    if(!Number.isInteger(minimum)||!Number.isInteger(maximum)||minimum<1||maximum>120||maximum<minimum)throw new Error('Prazos INSS inválidos na planilha Paraná.');
    book.terms=Array.from({length:maximum-minimum+1},(_,i)=>maximum-i);
  }
  book.enabled=true;return book;
}
export function calculatePortRefin(bank: SpreadsheetBank, book: DaycovalWorkbook, input: any) {
  if(bank==='DAYCOVAL')return simulateDaycoval(book,input);
  const date=parseDate(input.simulationDate),birth=parseDate(input.birthDate);if(birth>date)throw new Error('Nascimento inválido.');
  if(!Array.isArray(input.contracts)||input.contracts.length!==1)throw new Error('Esta planilha calcula um contrato por vez.');
  const contract=input.contracts[0],balance=Number(contract.balance),installment=Number(contract.installment),remaining=Number(contract.remaining),term=Number(input.term);
  if(!Number.isFinite(balance)||balance<=0||!Number.isFinite(installment)||installment<=0||!Number.isInteger(remaining)||remaining<1||remaining>108||!book.terms.includes(term))throw new Error('Revise saldo, parcela e prazos do contrato.');
  const version={fileName:book.fileName,hash:book.hash,uploadedAt:book.uploadedAt,versionDate:(book as any).versionDate};
  if(bank==='C6') {
    if(!Number.isInteger(Number(input.benefitType))||Number(input.benefitType)<=0)throw new Error('Informe a espécie do benefício para aplicar as tabelas C6.');
    const calculator=new DaycovalCalculator(book,{C2:'INSS',C7:serial(date),C8:balance,C9:installment,C10:remaining,__TODAY:serial(date)},'Simulador Port');
    const offers:any[]=[];
    for(const scenario of ['PZO','VL_PARC'])for(let row=4;row<=15;row++) {
      if(Number(calculator.cell(`W${row}`,scenario))<=0)continue;
      const tableCode=String(calculator.cell(`AA${row}`,scenario)),tableName=String(calculator.cell(`AB${row}`,scenario) || tableCode),amount=Number(calculator.cell(`AF${row}`,scenario)),contractAmount=Number(calculator.cell(`AD${row}`,scenario));
      if(!tableName||!Number.isFinite(amount)||!Number.isFinite(contractAmount))throw new Error('A planilha C6 não conseguiu calcular os valores.');
      if(!c6ConditionEligible({client_amount:amount,covenant:{description:tableName}},input.benefitType))continue;
      const rate=(Number(calculator.cell(`AC${row}`,scenario))**30-1)*100;
      offers.push({provider:'C6',tableId:`${scenario}:${tableCode}`,tableName,amount,contractAmount,balance:Number(calculator.cell('J8',scenario)),installment:Number(calculator.cell('J9',scenario)),term:Number(calculator.cell('P3',scenario)),rate,coefficient:Number(calculator.cell('J9',scenario))/contractAmount,iof:Number(calculator.cell(`AE${row}`,scenario)),scenario:scenario==='PZO'?'Otimização de prazo':'Redução de parcela',status:'Disponível na planilha',eligible:true,portTerm:Number(calculator.cell(scenario==='PZO'?'C21':'E21')),portInstallment:Number(calculator.cell(scenario==='PZO'?'C22':'E22')),portRate:Number(calculator.cell(scenario==='PZO'?'C23':'E23'))*100});
    }
    const first=Number(calculator.cell('J31','Planilha 1'));
    return {offers,contracts:[{returnRate:Number(calculator.cell('C11'))*100,newInstallment:Number(calculator.cell('C22'))}],firstDue:new Date(Date.UTC(1899,11,30)+first*86400000).toISOString().slice(0,10),weightedRate:Number(calculator.cell('C23'))*100,version,message:offers.length?'':'A planilha C6 não retornou ofertas compatíveis com o contrato e a espécie informados.'};
  }
  const rate=Number(input.refinanceRate)/100,extra=Number(input.additionalMargin||0);
  if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(extra)||extra<0)throw new Error('Informe taxa do refinanciamento e margem adicional válidas.');
  const calculator=new DaycovalCalculator(book,{H4:'INSS',J4:serial(date),K4:'NÃO',B9:remaining,D9:installment,D12:balance,H9:term,J9:installment+extra,L9:rate},'Simulador Portabilidade e Refin');
  const amount=Number(calculator.cell('F17')),contractAmount=Number(calculator.cell('J12')),status=String(calculator.cell('D20')),first=Number(calculator.cell('L12'));
  if(!status||!Number.isFinite(amount)||!Number.isFinite(contractAmount))throw new Error('A planilha Paraná não conseguiu calcular a condição.');
  const offer={provider:'PARANA',tableId:`INSS:${term}:${rate}`,tableName:'INSS · condição da planilha Paraná',amount,contractAmount,balance,installment:installment+extra,term,rate:rate*100,coefficient:(installment+extra)/contractAmount,iof:Number(calculator.cell('G15')),insurance:Number(calculator.cell('H15')),status,eligible:status.startsWith('✅')&&amount>0};
  return {offers:[offer],contracts:[{returnRate:Number(calculator.cell('F9'))*100,newInstallment:installment}],firstDue:new Date(Date.UTC(1899,11,30)+first*86400000).toISOString().slice(0,10),weightedRate:rate*100,version};
}
