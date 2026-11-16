import {describe,expect,it} from 'vitest';
import {compareDaycovalWorkbook} from '../server/services/daycovalWorkbookCompare';
import type {DaycovalWorkbook} from '../server/services/daycovalWorkbook';
const formulas=(value:string)=>({
 'SIMULADOR COM SALDO':{cells:{E21:{formula:value},E25:{formula:'E21+E26'}},rows:40,cols:8},
 'Batalha Naval (2)':{cells:{N5:{formula:'K6'}},rows:10,cols:20},
} as any);
const columns=Array.from({length:24},(_,index)=>({0:'EMPREGADOR',5:'TAXA',6:'PRAZO',19:'minport_%'} as Record<number,string>)[index]||'OUTRA_'+index);
const book=(hash:string,sheetForm:string):DaycovalWorkbook=>({
 hash:'file-'+hash,fileName:'planilha-'+hash+'.xlsx',uploadedAt:'2026-11-13',terms:[108,96],
 formulaHash:hash,sheets:formulas(sheetForm),tables:{Consulta1:{columns} as any},
} as DaycovalWorkbook);
describe('comparação Daycoval sem alteração no modelo instalado',()=>{
 it('detecta formula de parcela port recalculada sem homologar a planilha automaticamente',()=>{
  const old=book('approved','IF(E20>MAX,E207,E19)');
  const current=book('unreviewed','IF(E20>=MAX,E207,E19)');
  const report=compareDaycovalWorkbook(current,old,['approved']);
  expect(report.reviewedModel).toBe(false);
  expect(report.canActivateWithCurrentReviewedModels).toBe(false);
  expect(report.formulaComparison).toMatchObject({changed:1,added:0,removed:0});
  expect(report.formulaComparison?.sample).toEqual(['SIMULADOR COM SALDO!E21 · alterada']);
  expect(old.sheets['SIMULADOR COM SALDO'].cells.E21).toEqual({formula:'IF(E20>MAX,E207,E19)'});
 });
 it('um hash homologado e mesmas colunas passa na verificação, sem gravar no banco',()=>{
  const result=compareDaycovalWorkbook(book('approved','F20'),book('approved','F20'),['approved']);
  expect(result.canActivateWithCurrentReviewedModels).toBe(true);
  expect(result.formulaComparison).toMatchObject({changed:0,added:0,removed:0});
 });
 it('alteração de cabeçalhos obrigatórios é incompatibilidade mesmo com hash aprovado',()=>{
  const invalid=book('approved','F20');
  invalid.tables.Consulta1.columns[5]='OUTRA';
  const result=compareDaycovalWorkbook(invalid,null,['approved']);
  expect(result.requiredStructureValid).toBe(false);
  expect(result.canActivateWithCurrentReviewedModels).toBe(false);
 });
});
