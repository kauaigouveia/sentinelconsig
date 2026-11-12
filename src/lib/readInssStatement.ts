import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseInssStatement } from './inssStatement';

export async function readInssStatement(file: File, signal: AbortSignal) {
  if (!file.size || file.size > 5 * 1024 * 1024) throw Error('Selecione um PDF de até 5 MB.');
  const data = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  if (String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') throw Error('Selecione um arquivo PDF válido.');
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({ data, useWorkerFetch: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: true, verbosity: 0 });
  const cancel = () => { void task.destroy(); };
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 20000);
  try {
    const doc = await task.promise;
    if (doc.numPages > 20) throw Error('Use um extrato individual com até 20 páginas.');
    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const { items } = await page.getTextContent();
      if (items.length > 10000) throw Error('Página fora dos limites deste formato de extrato.');
      const words = items.flatMap(item => 'str' in item && item.str.trim()
        ? [{ x: item.transform[4], y: item.transform[5], text: item.str }] : []);
      words.sort((a,b) => b.y - a.y);
      let row: typeof words = [];
      const finishRow = () => {
        if (row.length) lines.push(row.sort((a,b) => a.x - b.x).map(word => word.text).join(' '));
        row = [];
      };
      for (const word of words) {
        if (row.length && Math.abs(word.y - row[0].y) > 2) finishRow();
        row.push(word);
      }
      finishRow();
      page.cleanup();
    }
    signal.throwIfAborted();
    return parseInssStatement(lines);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    await task.destroy();
  }
}
