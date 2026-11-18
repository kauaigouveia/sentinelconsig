import { describe, expect, it } from 'vitest';
import { parseInssStatement } from '../src/lib/inssStatement';
import { validateSimulationContracts } from '../src/lib/multiContractSimulation';

const customer = ['Nome: Pessoa de Teste', 'CPF: 12345678909', 'Beneficio: 0000000001', 'Data Nascimento: 29/02/1960', 'Espécie: 42 - Exemplo',
  'Margem Empréstimo: -10,35', 'Margem Cartão: 0,00', 'Cartão Benefício:', 'Banco: 999'];
const table = ['Empréstimos Bancários', 'N° Contrato Banco Inicio Desconto. Vl. Emprestado Vl. Parcela Prazo Pagas Saldo Taxa'];
const row = '001A-1 1 - Banco de Teste 2021-01 5.000,00 50,00 84 57 1.300,44 1.50';
const read = (...rows: string[]) => parseInssStatement([...customer, ...table, ...rows]);
describe('Extrato textual da consulta INSS', () => {
  it('usa o saldo da coluna correta, banco credor, identificador e prazo restante', () => {
    const data = read(row);
    expect(data.customer.birthDate).toBe('1960-02-29');
    expect(data.customer.benefitNumber).toBe('0000000001');
    expect(data.contracts).toEqual([{ originContractNumber:'001A-1', originLenderCode:'001', originalTerm:'84',
      openedInstallmentNumber:'27', lastDueBalance:'1.300,44', installmentFaceValue:'50,00' }]);
    expect(() => validateSimulationContracts(data.contracts)).not.toThrow();
  });
  it('mantém margem negativa, zero e desconhecida distintas', () => {
    const data = read(row);
    expect([data.loanMargin, data.cardMargin, data.benefitCardMargin]).toEqual(['-10.35','0.00','']);
  });
  it('separa cartões dos contratos portáveis', () => {
    const data = read(row, 'Reserva de Margem para Cartão de Crédito', row.replace('001A-1','CARD1'));
    expect(data.contracts).toHaveLength(1);
  });
  it('remove cópias e exige revisão de contratos divergentes', () => {
    expect(read(row, row).contracts).toHaveLength(1);
    const data = read(row, row.replace('50,00','49,00'), row);
    expect(data.contracts).toHaveLength(0);
    expect(data.issues).toHaveLength(1);
  });
  it('mantém contratos válidos quando outra linha estiver incompleta', () => {
    const data = read('linha parcial',row,row.replace('84 57','84 84'));
    expect(data.contracts).toHaveLength(1);
    expect(data.issues).toHaveLength(2);
  });
  it('exige cabeçalho verificado para importar valores', () => {
    const data = parseInssStatement([...customer,table[0],row]);
    expect(data.contracts).toHaveLength(0);
    expect(data.issues).toHaveLength(1);
  });
  it('recusa múltiplos benefícios e datas impossíveis', () => {
    expect(() => read(row, 'Beneficio: 0000000002')).toThrow(/divergentes/);
    expect(() => parseInssStatement([...customer.map(x=>x.replace('1960','1961')), ...table])).toThrow(/nascimento/);
  });
  it('reconhece MultiCorban, preserva número quebrado e lê restantes/total sem misturar cartões',()=>{
    const lines=[
 'Demonstrativo de Empréstimos Consignados',
 'Dados do Beneficiário',
 'Nome: Pessoa Teste Número do Benefício: 000.000.000-1 CPF: 529.982.247-25',
 'Data Nascimento: 29/02/1960',
 'Dados Complementares','UF: BA Município: TESTE',
 'Dados do Benefício','Espécie: 93 - Pensão por morte',
 'Situação: ATIVO DDB: 22/05/2021',
 'Possui Representante Legal: Não possui representante legal',
 'Bloqueado para Empréstimo: Bloqueado para empréstimo Elegível para Empréstimo: Elegível para empréstimos',
 'Margem Consignável',
 'Base de Cálculo: R$ 2.160,01 Margem Empréstimo: R$ 28,49 Margem para Cartão: R$ 0,00 Cartão Benefício: R$ 0,00',
 'Contratos de Empréstimos',
 'Empréstimo CBC/Banco Comp. 1ª Parcela Comp. Última Parcela Data Inclusão Parcelas Valor Parcela Valor Emprestado Taxa Saldo Quitação',
 'Situação: Ativo',
 '0000000000003000824',
 '41 - Banrisul 01/2026 06/2030 12/12/2025 44 / 54 33,00 1.070,41 2.0553 949,66',
 '8',
 'Situação: Ativo',
 '383258437-3 623 - PAN 02/2024 01/2031 24/01/2024 51 / 84 26,00 1.084,43 1.9071 843,12',
 'Situação: Ativo',
 '1100236816 121 - Agibank 05/2023 04/2030 10/04/2023 42 / 84 631,25 30.750,11 1.43 19.828,29',
 'Situação: Ativo',
 '626 - Ficsa (C6',
 '010121945511 03/2023 02/2030 14/02/2023 40 / 84 37,26 1.362,46 2.3443 960,34',
 'Consignado)',
 'Contratos de Cartão',
 '52-0887657/22 707 - Daycoval 07/01/2022 Ativo 2.610,00 108,00 RMC',
 '770677082-8 623 - PAN 15/02/2023 Ativo 2.626,00 108,00 RCC',
];
    const result=parseInssStatement(lines);
    expect(result.issues).toEqual([]);
    expect(result.contracts).toHaveLength(4);
    expect(result.customer).toMatchObject({cpf:'52998224725',benefitNumber:'0000000001',
      benefitType:'93',birthDate:'1960-02-29'});
    expect(result.uf).toBe('BA');
    expect(result.loanMargin).toBe('28.49');
    expect(result.loanBlocked).toBe(true);
    expect(result.benefitStart).toBe(''); // DDB is not DIB.
    expect(result.contracts.map(c=>c.originLenderCode)).toEqual(['041','623','121','626']);
    expect(result.contracts[0]).toMatchObject({
      originContractNumber:'00000000000030008248',originalTerm:'54',
      openedInstallmentNumber:'44',installmentFaceValue:'33,00',lastDueBalance:'949,66'});
    expect(result.contracts[1]).toMatchObject({originalTerm:'84',openedInstallmentNumber:'51'});
    expect(result.contracts[3]).toMatchObject({originContractNumber:'010121945511',openedInstallmentNumber:'40'});
    expect(JSON.stringify(result)).not.toContain('52-0887657/22');
    expect(JSON.stringify(result)).not.toContain('770677082-8');
    expect(()=>validateSimulationContracts(result.contracts)).not.toThrow();
  });
  it('não completa empréstimo ativo ilegível e sinaliza conferência obrigatória',()=>{
    const lines=[
 'Demonstrativo de Empréstimos Consignados',
 'Dados do Beneficiário',
 'Nome: Pessoa Teste Número do Benefício: 000.000.000-1 CPF: 529.982.247-25',
 'Data Nascimento: 29/02/1960',
 'Dados Complementares','UF: BA Município: TESTE',
 'Dados do Benefício','Espécie: 93 - Pensão por morte',
 'Situação: ATIVO DDB: 22/05/2021',
 'Possui Representante Legal: Não possui representante legal',
 'Bloqueado para Empréstimo: Bloqueado para empréstimo Elegível para Empréstimo: Elegível para empréstimos',
 'Margem Consignável',
 'Base de Cálculo: R$ 2.160,01 Margem Empréstimo: R$ 28,49 Margem para Cartão: R$ 0,00 Cartão Benefício: R$ 0,00',
 'Contratos de Empréstimos',
 'Empréstimo CBC/Banco Comp. 1ª Parcela Comp. Última Parcela Data Inclusão Parcelas Valor Parcela Valor Emprestado Taxa Saldo Quitação',
 'Situação: Ativo',
 '0000000000003000824',
 '41 - Banrisul 01/2026 06/2030 12/12/2025 44 / 54 33,00 1.070,41 2.0553 949,66',
 '8',
 'Situação: Ativo',
 '383258437-3 623 - PAN 02/2024 01/2031 24/01/2024 51 / 84 26,00 1.084,43 1.9071 843,12',
 'Situação: Ativo',
 '1100236816 121 - Agibank 05/2023 04/2030 10/04/2023 42 / 84 631,25 30.750,11 1.43 19.828,29',
 'Situação: Ativo',
 '626 - Ficsa (C6',
 '010121945511 03/2023 02/2030 14/02/2023 40 / 84 37,26 1.362,46 2.3443 960,34',
 'Consignado)',
 'Contratos de Cartão',
 '52-0887657/22 707 - Daycoval 07/01/2022 Ativo 2.610,00 108,00 RMC',
 '770677082-8 623 - PAN 15/02/2023 Ativo 2.626,00 108,00 RCC',
];
    const corrupted=lines.map(s=>s.includes('42 / 84 631,25')?
      s.replace('42 / 84 631,25','parcelas não identificadas'):s);
    const result=parseInssStatement(corrupted);
    expect(result.contracts).toHaveLength(3);
    expect(result.issues).toHaveLength(1);
  });
  it('recusa arquivos sem o layout da consulta', () => {
    expect(() => parseInssStatement([])).toThrow(/não reconhecido/);
  });
});
