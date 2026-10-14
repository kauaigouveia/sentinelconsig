export type PartnerBatchAction = 'delete' | 'reset';
export interface PartnerBatchTarget { id: string; name?: string; code?: string; }
export interface PartnerBatchResult { id: string; name: string; code: string; email: string; password: string; portalUrl: string; success: boolean; status: string; }

/** Uses the existing tenant-scoped, audited endpoints. Never retries a mutation automatically. */
export async function runPartnerBatch(action: PartnerBatchAction, targets: PartnerBatchTarget[], onProgress: (done: number, total: number) => void, request: typeof fetch = fetch): Promise<PartnerBatchResult[]> {
  const unique = [...new Map(targets.map(target => [target.id, target])).values()];
  const results: PartnerBatchResult[] = [];
  let blocked = false;
  for (const target of unique) {
    const row: PartnerBatchResult = { id: target.id, name: target.name || '', code: target.code || '', email: '', password: '', portalUrl: '', success: false, status: '' };
    try {
      if (blocked) throw new Error('Não processado: sessão ou permissão indisponível.');
      const response = await request(`/api/partners/${encodeURIComponent(target.id)}${action === 'reset' ? '/portal-access/reset' : ''}`, { method: action === 'reset' ? 'POST' : 'DELETE', credentials: 'include' });
      if ([401, 403].includes(response.status)) blocked = true;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
      if (action === 'reset' && !data.portalAccess?.temporaryPassword) throw new Error('Senha não retornada. Confira o acesso antes de tentar novamente.');
      Object.assign(row, { success: true, status: action === 'reset' ? 'Senha redefinida; trocar no primeiro acesso' : 'Parceiro excluído', email: data.portalAccess?.email || '', password: data.portalAccess?.temporaryPassword || '', portalUrl: data.portalAccess?.portalUrl || '' });
    } catch (error) { row.status = error instanceof Error ? error.message : 'Falha; confira o registro antes de tentar novamente.'; }
    results.push(row);
    onProgress(results.length, unique.length);
  }
  return results;
}
