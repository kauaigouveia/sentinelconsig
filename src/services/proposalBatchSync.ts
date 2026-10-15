import type { Bank, Proposal } from '../types';
export function proposalSyncProvider(proposal: Proposal, banks: Bank[]): string | null {
  if (proposal.workbankSource) throw new Error('Atualize esta proposta pelo período na aba WorkBank da promotora vinculada.');
  const linked = [proposal.finantoSimulationId?.trim() ? 'finanto' : '', proposal.nossaFintechDebtKey?.trim() ? 'nossa-fintech' : ''].filter(Boolean);
  if (linked.length > 1) throw new Error('Mais de uma API externa vinculada. Revise a origem desta proposta.');
  if (linked.length) return linked[0];
  const bank = banks.find(item => item.id === proposal.bankId || item.code === proposal.bankId) || (proposal as any).bank;
  const code = String(bank?.code || '').toUpperCase(), name = String(bank?.name || '').toUpperCase();
  if (code === '149' || name.includes('FACTA')) return 'facta';
  if (code === '336' || name.includes('C6')) return 'c6';
  if (code === '318' || name.includes('BMG')) return 'bmg';
  if (code === 'HAPPY' || /HAPPY|BYX/.test(name)) return 'happy';
  return null;
}
export async function syncProposalBatch(proposals: Proposal[], banks: Bank[], onProgress: (done: number, total: number) => void, request: typeof fetch = fetch) {
  const unique = [...new Map(proposals.map(row => [row.id, row])).values()];
  const results: { id: string; ade: string; provider: string; state: 'OK' | 'FAILED' | 'SKIPPED'; message: string }[] = [];
  let blocked = false;
  for (const proposal of unique) {
    const row = { id: proposal.id, ade: proposal.proposalNumber, provider: '', state: 'SKIPPED' as 'OK' | 'FAILED' | 'SKIPPED', message: '' };
    try {
      if (blocked) throw new Error('Não processada: sessão ou permissão indisponível.');
      const provider = proposalSyncProvider(proposal, banks);
      if (!provider) { row.message = 'Sem API de consulta vinculada a este banco.'; }
      else if (!proposal.promoterId) { row.message = 'Vincule a promotora interna antes de consultar.'; }
      else {
        row.provider = provider;
        const id = encodeURIComponent(proposal.id);
        const url = provider === 'bmg' ? `/api/integrations/bmg/proposals/${id}/sync` : `/api/proposals/${id}/${provider}-sync`;
        const response = await request(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(60000) });
        if ([401, 403].includes(response.status)) blocked = true;
        const data = await response.json();
        if (!response.ok || data.success === false) throw new Error(data.error || 'A API não confirmou a consulta.');
        row.state = 'OK'; row.message = data.statusMapped === false ? 'Consultada; status interno sem mapeamento.' : 'Consulta e sincronização concluídas.';
      }
    } catch (error) { row.state = 'FAILED'; row.message = error instanceof Error ? error.message : 'Falha na consulta.'; }
    results.push(row); onProgress(results.length, unique.length);
  }
  return results;
}
