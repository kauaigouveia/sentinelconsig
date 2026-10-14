export interface BankImportRow { line: number; name: string; code: string; status: 'VALID' | 'INVALID' | 'EXISTS' | 'CREATED' | 'FAILED'; message: string; }

export function parseBankText(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] || '';
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (char === delimiter || char === '\n')) { row.push(cell.trim()); cell = ''; if (char === '\n') { rows.push(row); row = []; } }
    else if (char !== '\r') cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  if (quoted) throw new Error('Arquivo CSV com aspas não fechadas.');
  return rows;
}

export function prepareBankRows(matrix: unknown[][], existing: { name: string; code?: string }[]): BankImportRow[] {
  const names = new Set(existing.map(bank => bank.name.trim().toUpperCase()));
  const codes = new Set(existing.map(bank => String(bank.code || '').trim().padStart(3, '0')));
  const seenNames = new Set<string>(), seenCodes = new Set<string>();
  const header = matrix[0]?.map(cell => String(cell || '').trim().toLowerCase());
  const hasHeader = header?.some(cell => ['nome', 'banco', 'nome do banco'].includes(cell));
  const nameIndex = hasHeader ? header.findIndex(cell => ['nome', 'banco', 'nome do banco'].includes(cell)) : 0;
  const codeIndex = hasHeader ? header.findIndex(cell => /c[oó]digo|febraban/.test(cell)) : 1;
  if (hasHeader && codeIndex < 0) throw new Error('Inclua a coluna Código FEBRABAN.');
  return matrix.slice(hasHeader ? 1 : 0).map((cells, index) => {
    const name = String(cells[nameIndex] ?? '').trim().toUpperCase();
    const rawCode = String(cells[codeIndex] ?? '').trim();
    const code = /^\d{1,3}$/.test(rawCode) ? rawCode.padStart(3, '0') : rawCode;
    const row: BankImportRow = { line: index + (hasHeader ? 2 : 1), name, code, status: 'VALID', message: 'Pronto para cadastrar' };
    if (!name || !/^\d{3}$/.test(code)) { row.status = 'INVALID'; row.message = 'Informe nome e código FEBRABAN de 3 dígitos.'; }
    else if (names.has(name) || codes.has(code)) { row.status = 'EXISTS'; row.message = 'Banco já cadastrado; será ignorado.'; }
    else if (seenNames.has(name) || seenCodes.has(code)) { row.status = 'INVALID'; row.message = 'Banco ou código repetido neste lote.'; }
    else { seenNames.add(name); seenCodes.add(code); }
    return row;
  }).filter(row => row.name || row.code);
}

export async function importBankRows(rows: BankImportRow[], onProgress: (done: number, total: number) => void, request: typeof fetch = fetch): Promise<BankImportRow[]> {
  const result = rows.map(row => ({ ...row }));
  const pending = result.filter(row => row.status === 'VALID'); let done = 0, blocked = false;
  for (const row of pending) {
    try {
      if (blocked) throw new Error('Não processado: sessão ou permissão indisponível.');
      const response = await request('/api/banks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: row.name, code: row.code }) });
      if ([401, 403].includes(response.status)) blocked = true;
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Erro ao cadastrar banco.');
      row.status = 'CREATED'; row.message = 'Cadastrado';
    } catch (error) { row.status = 'FAILED'; row.message = error instanceof Error ? error.message : 'Falha; confira o cadastro antes de tentar novamente.'; }
    onProgress(++done, pending.length);
  }
  return result;
}
