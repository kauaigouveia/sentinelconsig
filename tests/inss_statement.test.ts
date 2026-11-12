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
  it('recusa arquivos sem o layout da consulta', () => {
    expect(() => parseInssStatement([])).toThrow(/não reconhecido/);
  });
});
