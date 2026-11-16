import ExcelJS from 'exceljs';
import {describe,expect,it} from 'vitest';
import {serial,type DaycovalWorkbook} from '../server/services/daycovalWorkbook';
import {importPortRefin,isPortRefinModelCompatible,SPREADSHEET_MODELS} from '../server/services/portRefinWorkbooks';
import {daycovalWeeklyStructureErrors,isDaycovalAutoValidated,validateDaycovalWeeklyWorkbook} from '../server/services/daycovalWeeklyValidator';
import {DAYCOVAL_FORMULA_HASHES} from '../server/services/daycovalModelVersions';
import {previewPortRefin} from '../server/services/portRefinPreview';
import {encodeDaycoval,decodeDaycoval} from '../server/services/daycovalWorkbook';

const synthetic=()=>{
 const base=Array.from({length:24},(_,i)=>({0:'EMPREGADOR',5:'TAXA',6:'PRAZO',19:'minport_%'} as Record<number,string>)[i]||'CAMPO_'+i);
 const cells:Record<string,any>={
  M8:serial(new Date('2026-12-15T00:00:00Z')),
  E20:{formula:'2.123/100'},E21:{formula:'E19-1.53'},
  F20:{formula:'2.123/100'},F21:{formula:'F19-1.53'},
  E25:{formula:'SUM(E19:F19)'},E27:{formula:'1.85/100'},
  F29:'800581 - RFN INSS 1',I29:0.0185,J29:0.02,
  K29:{formula:'E17+100'},L29:{formula:'E17'},M29:{formula:'K29-L29'},
  N29:'TAB disponivel',O29:'Modelo sintético',
 };
 return {hash:'a'.repeat(64),formulaHash:'b'.repeat(64),fileName:'daycoval-weekly.xlsx',
  uploadedAt:'2026-11-16',terms:[108],enabled:true,
  sheets:{
   'SIMULADOR COM SALDO':{rows:50,cols:20,cells},
   'Base tabelas':{rows:3,cols:24,cells:{A2:'INSS',G2:108}},
   'CALENDARIO':{rows:1,cols:1,cells:{}},
   'Batalha Naval (2)':{rows:1,cols:1,cells:{}},
  },
  tables:{Consulta1:{sheet:'Base tabelas',startRow:1,startCol:1,endRow:3,columns:base}},
 } as DaycovalWorkbook;
};
describe('importação semanal Daycoval sem hash fixo',()=>{
 it('autovalida tabelas e parcelas calculadas para operação individual e unificação',()=>{
  const book=synthetic();
  expect(daycovalWeeklyStructureErrors(book)).toEqual([]);
  const proof=validateDaycovalWeeklyWorkbook(book);
  expect(proof.scenarios).toEqual(['portabilidade-individual','unificacao-duas-parcelas']);
  expect(isPortRefinModelCompatible('DAYCOVAL',book.formulaHash)).toBe(false);
  book.automaticValidation=proof;
  expect(isPortRefinModelCompatible('DAYCOVAL',book.formulaHash,book)).toBe(true);
  expect(isDaycovalAutoValidated(decodeDaycoval(encodeDaycoval(book)))).toBe(true);
  expect(previewPortRefin('DAYCOVAL',book,{
   birthDate:'1980-06-15',benefitType:41,term:108,
   contracts:[{originBank:'237',originalTerm:84,remaining:40,balance:841.72,installment:31.53}],
  },'2026-11-16').offers.length).toBeGreaterThan(0);
 });
 it('rejeita coluna, fórmula central ausente e estado adulterado',()=>{
  const missing=synthetic();delete missing.sheets['SIMULADOR COM SALDO'].cells.E21;
  expect(()=>validateDaycovalWeeklyWorkbook(missing)).toThrow(/fórmula financeira|Célula do simulador/);
  const wrong=synthetic();wrong.tables.Consulta1.columns[5]='OUTRO';
  expect(()=>validateDaycovalWeeklyWorkbook(wrong)).toThrow(/TAXA/);
  const stamped=synthetic();stamped.automaticValidation=validateDaycovalWeeklyWorkbook(stamped);
  stamped.formulaHash='c'.repeat(64);
  expect(isDaycovalAutoValidated(stamped)).toBe(false);
  stamped.formulaHash='b'.repeat(64);stamped.hash='d'.repeat(64);
  expect(isDaycovalAutoValidated(stamped)).toBe(false);
 });
 it('não aprova alterações que o motor não sabe calcular, mesmo com colunas intactas',()=>{
  const wrong=synthetic();
  wrong.sheets['SIMULADOR COM SALDO'].cells.E21={formula:'UNSUPPORTED_WEEKLY_FUNCTION(E19)'};
  expect(()=>validateDaycovalWeeklyWorkbook(wrong)).toThrow(/validação automática Daycoval falhou/i);
 });
 it('permanece compatível com hashes históricos e conserva outros bancos inalterados',()=>{
  for(const hash of DAYCOVAL_FORMULA_HASHES)expect(isPortRefinModelCompatible('DAYCOVAL',hash)).toBe(true);
  expect(isPortRefinModelCompatible('C6',SPREADSHEET_MODELS.C6.hash)).toBe(true);
  expect(isPortRefinModelCompatible('PARANA',SPREADSHEET_MODELS.PARANA.hash)).toBe(true);
  expect(isPortRefinModelCompatible('C6','f'.repeat(64),synthetic())).toBe(false);
 });
 it('importa um XLSX semanal com assinatura inédita quando estrutura e cálculo passam',async()=>{
  const wb=new ExcelJS.Workbook();
  const main=wb.addWorksheet('SIMULADOR COM SALDO');
  const source=synthetic().sheets['SIMULADOR COM SALDO'].cells;
  for(const [address,value] of Object.entries(source))main.getCell(address).value=value;
  const base=wb.addWorksheet('Base tabelas');
  const cols=synthetic().tables.Consulta1.columns;
  base.addTable({
   name:'Consulta1',ref:'A1',headerRow:true,totalsRow:false,
   columns:cols.map(name=>({name,filterButton:false})),
   rows:[
    cols.map((_,i)=>i===0?'INSS':i===6?108:''),
    cols.map((_,i)=>i===0?'INSS':i===6?96:''),
   ],
  });
  wb.addWorksheet('CALENDARIO').getCell('A1').value='Dia';
  wb.addWorksheet('Batalha Naval (2)').getCell('A1').value='Controle';
  const data=Buffer.from(await wb.xlsx.writeBuffer());
  const book=await importPortRefin('DAYCOVAL',data,'DAYCOVAL-23112026.xlsx');
  expect(book.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(book.formulaHash).toMatch(/^[0-9a-f]{64}$/);
  expect(book.automaticValidation?.scenarios).toHaveLength(2);
  expect(isPortRefinModelCompatible('DAYCOVAL',book.formulaHash,book)).toBe(true);
  expect(book.automaticValidation?.fileHash).toBe(book.hash);
 });
});
