import React, { useEffect, useState } from 'react';

export function promoterApiUrl(path: string, promoterId: string) {
  return `${path}${path.includes('?') ? '&' : '?'}promoterId=${encodeURIComponent(promoterId)}`;
}

export function BankPromoterConnection({ children, endpoint = '/api/integrations/promoters' }: { endpoint?: string; children: (promoterId: string) => React.ReactNode }) {
  const [promoters, setPromoters] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const rows = await response.json();
      if (!response.ok || !Array.isArray(rows)) throw new Error(rows.error || 'Não foi possível carregar as promotoras.');
      if (controller.signal.aborted) return;
      setPromoters(rows);
      setSelected(rows.find(row => ['DG', 'DG PROMOTORA'].includes(row.name.trim().toUpperCase()))?.id || rows[0]?.id || '');
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint]);
  if (loading) return <p role="status">Carregando conexões por promotora…</p>;
  if (error) return <p role="alert">{error}</p>;
  return <div className="space-y-4">
    <label className="block text-sm font-semibold">Promotora da conexão
      <select value={selected} onChange={event => setSelected(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        {!promoters.length && <option value="">Cadastre uma promotora ativa</option>}
        {promoters.map(promoter => <option key={promoter.id} value={promoter.id}>{promoter.name}</option>)}
      </select>
    </label>
    <p className="text-xs text-slate-500">Cada banco tem credenciais e ativação próprias por promotora. As conexões anteriores pertencem à DG PROMOTORA.</p>
    {selected && <React.Fragment key={selected}>{children(selected)}</React.Fragment>}
  </div>;
}
