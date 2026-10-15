import React, { useState } from 'react';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';
export function ParanaProposalSyncCard({ proposalId, onUpdated }: { proposalId: string; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const user = StorageService.getActiveUser(), allowed = (hasPermission(user?.role, user?.customPermissions, 'integrations.sync') || hasPermission(user?.role, user?.customPermissions, 'integrations.manage')) && hasPermission(user?.role, user?.customPermissions, 'proposals.update');
  return <section className="px-6 py-3 border-b border-blue-600 bg-blue-500/10 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Paraná Banco · API</strong>{allowed && <button disabled={busy} type="button" className="rounded-lg border px-3 py-2" onClick={async () => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}/parana-sync`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Consulta Paraná não concluída.');
      await StorageService.syncSpecificEntity('Proposal'); onUpdated();
      setNotice(`Status Paraná: ${data.bankStatus || 'não informado'}.${data.statusMapped ? '' : ' Configure o mapeamento para atualizar o status interno.'}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível consultar.'); } finally { setBusy(false); }
  }}>{busy ? 'Consultando…' : 'Atualizar proposta no Paraná'}</button>}</div><p className="text-xs">Consulta a conexão da promotora cadastrada nesta proposta.</p>{error && <p role="alert" className="text-rose-500">{error}</p>}{notice && <p role="status">{notice}</p>}</section>;
}
