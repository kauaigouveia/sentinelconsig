// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { readProductionColumns } from '../src/components/production/ProductionWorkspace';
beforeEach(() => localStorage.clear());
it('inicia com colunas essenciais sem ocultar cliente, situação ou ações', () => {
  const hidden = readProductionColumns('columns');
  expect(hidden.length).toBeGreaterThan(0);
  expect(hidden).not.toContain(3);
  expect(hidden).not.toContain(10);
  expect(hidden).not.toContain(13);
});
it('respeita a escolha explícita de exibir todas as colunas', () => {
  localStorage.setItem('columns', '[]');
  expect(readProductionColumns('columns')).toEqual([]);
});
it('preserva colunas salvas válidas e descarta índices que esconderiam as ações', () => {
  localStorage.setItem('columns', '[4,4,13,99,"5",8]');
  expect(readProductionColumns('columns')).toEqual([4,8]);
});
