export async function readJsonResponse(response: Response): Promise<any> {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; }
  catch {
    if (response.status === 413 || /request entity too large|payload too large/i.test(raw)) throw new Error('O envio ultrapassou o limite de tamanho. Envie os documentos separadamente e tente novamente.');
    throw new Error(`O servidor não concluiu a solicitação (HTTP ${response.status}). Tente novamente. Se houve envio ao banco, confira a esteira antes de repetir.`);
  }
}
