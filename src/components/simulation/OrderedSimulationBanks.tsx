import React, { useEffect, useState } from 'react';
import { BANK_LABELS, bankKey, normalizeBankOrders } from '../../lib/simulationBankOrder';
export function OrderedSimulationBanks({ operation, groups }: { operation: string; groups: { bank: string; content: React.ReactNode; visible: boolean; resultRank?:number }[] }) {
  const [orders, setOrders] = useState(normalizeBankOrders(null));
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/simulations/bank-order', { cache: 'no-store', signal: controller.signal }).then(async response => { if (response.ok) setOrders(normalizeBankOrders(await response.json())); }).catch(() => {});
    return () => controller.abort();
  }, []);
  const order = orders[operation as keyof typeof orders] || [];
  return <div className="space-y-4">{groups.filter(group => group.visible).sort((a, b) => {
    const rank = (bank: string) => { const index = order.indexOf(bankKey(bank)); return index < 0 ? order.length : index; };
    return (a.resultRank??2)-(b.resultRank??2)||rank(a.bank) - rank(b.bank);
  }).map(group => <section key={group.bank} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><h3 className="mb-3 font-bold">{BANK_LABELS[bankKey(group.bank)] || group.bank}</h3>{group.content}</section>)}</div>;
}
