import { simulateDaycoval, type DaycovalWorkbook } from './daycovalWorkbook.js';

/**
 * Daycoval commercial tables are revised weekly. The hash of all formulas is
 * not a stable schema version: it changes when the bank adds/removes an unused
 * formula. Test the supported model with bounded financial calculations
 * instead of hard-coding another formula checksum into a deploy.
 *
 * This validates technical compatibility, NOT commercial validity or bank
 * approval. It never sends data to a bank, saves a proposal, or edits rates.
 */
export const DAYCOVAL_AUTO_VALIDATOR_VERSION = 'weekly-daycoval-v1' as const;
export type DaycovalAutomaticValidation={
  version:typeof DAYCOVAL_AUTO_VALIDATOR_VERSION;
  fileHash:string;
  formulaHash:string;
  validatedAt:string;
  scenarios:string[];
};

const MAIN='SIMULADOR COM SALDO';
const SHEETS=[MAIN,'Base tabelas','CALENDARIO','Batalha Naval (2)'] as const;
const HEADER_POSITIONS:Record<number,string>={0:'EMPREGADOR',5:'TAXA',6:'PRAZO',19:'minport_%'};
const REQUIRED_CALCULATIONS=['M8','E20','E21','E25','E27','F29','I29','J29','K29','L29','M29','N29'] as const;
const FINANCIAL_FORMULAS=['E20','E21','E25','E27'] as const;
const sha=/^[0-9a-f]{64}$/;

export function daycovalWeeklyStructureErrors(book:DaycovalWorkbook):string[]{
  const errors:string[]=[];
  for(const name of SHEETS){
    const sheet=book.sheets?.[name];
    if(!sheet||!sheet.cells||!Number.isInteger(sheet.rows)||sheet.rows<1)errors.push('Aba obrigatória ausente ou ilegível: '+name);
  }
  const table=book.tables?.Consulta1;
  if(!table||table.sheet!=='Base tabelas')errors.push('Tabela Consulta1 não encontrada na aba Base tabelas.');
  const columns=table?.columns||[];
  for(const [index,expected] of Object.entries(HEADER_POSITIONS)){
    if(columns[Number(index)]!==expected)errors.push('Coluna obrigatória da tabela alterada: '+expected+'.');
  }
  const main=book.sheets?.[MAIN]?.cells||{};
  for(const address of REQUIRED_CALCULATIONS){
    if(main[address]==null||main[address]==='')errors.push('Célula do simulador ausente: '+address+'.');
  }
  for(const address of FINANCIAL_FORMULAS){
    if(!main[address]||typeof main[address]!=='object'||typeof main[address].formula!=='string')
      errors.push('A fórmula financeira '+address+' não está disponível.');
  }
  if(!Array.isArray(book.terms)||!book.terms.some(t=>Number.isInteger(t)&&t>=24&&t<=120))
    errors.push('Nenhum prazo INSS válido foi localizado nas tabelas.');
  if(!sha.test(book.hash||'')||!sha.test(book.formulaHash||''))
    errors.push('A assinatura do arquivo importado é inválida.');
  return errors;
}

export function isDaycovalAutoValidated(book:DaycovalWorkbook|undefined|null):boolean{
  if(!book)return false;
  const validation=book.automaticValidation;
  return validation?.version===DAYCOVAL_AUTO_VALIDATOR_VERSION &&
    validation.fileHash===book.hash && validation.formulaHash===book.formulaHash &&
    Array.isArray(validation.scenarios)&&validation.scenarios.length>=2 &&
    daycovalWeeklyStructureErrors(book).length===0;
}

function assertFinancialOutput(result:ReturnType<typeof simulateDaycoval>,count:number){
  if(result.contracts.length!==count)throw Error('A planilha não devolveu as parcelas de todos os contratos.');
  if(!result.offers.length)throw Error('Nenhuma tabela do refinanciamento foi calculada.');
  const good=(n:any)=>typeof n==='number'&&Number.isFinite(n)&&n>0;
  for(const contract of result.contracts){
    if(!good(contract.newInstallment)||!good(contract.returnRate)||contract.returnRate>15)
      throw Error('A parcela recalculada ou a taxa de retorno apresentou valor inconsistente.');
  }
  let meaningful=0;
  for(const offer of result.offers){
    if(typeof offer.tableName!=='string'||!offer.tableName.trim())continue;
    if(typeof offer.eligible!=='boolean'||!Number.isInteger(offer.term)||offer.term<24||offer.term>120)
      throw Error('A planilha retornou uma tabela sem prazo ou status válido.');
    // A weekly sheet may keep rows for tables that cannot be contracted in
    // this fictional scenario. Their zero/empty cells are not a reason to
    // reject an otherwise usable workbook; only active offers are asserted.
    if(!offer.eligible)continue;
    if(!good(offer.rate)||offer.rate>15||!good(offer.installment)||
       !good(offer.contractAmount)||offer.contractAmount>2_000_000||
       !Number.isFinite(offer.amount)||Math.abs(offer.amount)>2_000_000)
      throw Error('Uma tabela disponível gerou taxa, parcela ou valor de contrato inconsistente.');
    meaningful++;
  }
  // The interpreter must calculate the workbook. Some test inputs may have
  // no eligible offers because weekly policy rates change; this is not a
  // parser failure or permission to fabricate an available offer.
  if(!result.offers.some(offer=>typeof offer.tableName==='string'&&offer.tableName.trim()))
    throw Error('A planilha não retornou identificação de tabela calculada.');
}

export function validateDaycovalWeeklyWorkbook(book:DaycovalWorkbook):DaycovalAutomaticValidation{
  const structure=daycovalWeeklyStructureErrors(book);
  if(structure.length)throw Error('Planilha Daycoval incompatível: '+structure.slice(0,3).join(' '));
  const available=book.terms.filter(t=>Number.isInteger(t)&&t>=24&&t<=108).sort((a,b)=>b-a);
  if(!available.length)throw Error('Nenhum prazo até 108 meses está disponível para os cenários de validação.');
  const term=available[0];
  const scenarioInputs=[
    {key:'portabilidade-individual',contracts:[
      {balance:841.72,remaining:40,installment:31.53},
    ]},
    {key:'unificacao-duas-parcelas',contracts:[
      {balance:841.72,remaining:40,installment:31.53},
      {balance:1532.57,remaining:51,installment:46.58},
    ]},
  ];
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const scenarios:string[]=[];
  for(const input of scenarioInputs){
    try{
      const result=simulateDaycoval(book,{
        simulationDate:today,birthDate:'1980-06-15',benefitType:41,
        term,additionalMargin:0,requestedRefinAmount:0,contracts:input.contracts,
      });
      assertFinancialOutput(result,input.contracts.length);
      scenarios.push(input.key);
    }catch(error:any){
      const reason=String(error?.message||'Erro de cálculo').slice(0,170);
      throw Error('Validação automática Daycoval falhou em '+input.key+': '+reason+
        '. A versão ativa não foi substituída.');
    }
  }
  return {
    version:DAYCOVAL_AUTO_VALIDATOR_VERSION,
    fileHash:book.hash,formulaHash:book.formulaHash,
    validatedAt:new Date().toISOString(),scenarios,
  };
}
