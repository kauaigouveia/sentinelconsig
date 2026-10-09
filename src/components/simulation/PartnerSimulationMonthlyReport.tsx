import React, { useMemo, useState } from 'react';
import type { SimulationRequest, Partner } from '../../types';

export function PartnerSimulationMonthlyReport({ simulations, partners }: { simulations: SimulationRequest[]; partners: Partner[] }) {
  const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' }).slice(0, 7));
  const rows = useMemo(() => {
    const groups = new Map<string, { code: string; name: string; total: number; digitized: number; lost: number; pending: number; late: number }>();
    for (const sim of simulations) {
      if (sim.simulationType !== 'PARTNER_AUTO' || new Date(sim.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Bahia' }).slice(0, 7) !== month || !sim.partnerId) continue;
      const partner = partners.find(item => item.id === sim.partnerId);
      const row = groups.get(sim.partnerId) || { code: sim.partnerCodeSnapshot || partner?.login || '', name: partner?.fullName || '', total: 0, digitized: 0, lost: 0, pending: 0, late: 0 };
      row.total++;
      if (sim.status === 'DIGITADA PELA MESA') { row.digitized++; if (sim.matchedAfterDeadline) row.late++; }
      else if (sim.status === 'PERDIDA (NÃO DIGITADA)') row.lost++;
      else if (sim.status === 'SIMULAÇÃO ENVIADA') row.pending++;
      groups.set(sim.partnerId, row);
    }
    return [...groups.values()].sort((a, b) => a.digitized - b.digitized || b.total - a.total);
  }, [simulations, partners, month]);
  const exportReport = () => {
    const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'").replace(/"/g, '""')}"`;
    const content = ['MES;CODIGO_PARCEIRO;NOME;SIMULACOES_COM_OFERTA;DIGITADAS;OFERTAS_PERDIDAS;AGUARDANDO;DIGITADAS_APOS_PRAZO;CONVERSAO_PERCENTUAL;SIMULA_SEM_DIGITAR', ...rows.map(row => [month, row.code, row.name, row.total, row.digitized, row.lost, row.pending, row.late, (100 * row.digitized / row.total).toFixed(2).replace('.', ','), row.digitized === 0 ? 'SIM' : 'NAO'].map(cell).join(';'))].join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `Simulacoes_Parceiros_${month}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="rounded-xl border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-slate-900"><div className="mb-3 flex flex-wrap items-center gap-3"><h3 className="font-bold">Conversão mensal dos parceiros</h3><input aria-label="Mês do relatório de parceiros" type="month" value={month} onChange={event => setMonth(event.target.value)} className="rounded-lg border bg-transparent p-2" /><button onClick={exportReport} disabled={!rows.length} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Exportar relatório mensal</button></div><p className="mb-3 text-xs text-slate-500">Consultas do portal com valor liberado no mês selecionado. A digitação posterior é atribuída ao mês da simulação. Uma ADE converte uma consulta; novas tentativas continuam no histórico.</p><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Parceiro', 'Simulações', 'Digitadas', 'Perdidas', 'Aguardando', 'Após o prazo', 'Conversão'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.code} className="border-t dark:border-slate-800"><td className="p-2">{row.code} · {row.name}{!row.digitized && <strong className="block text-amber-600">Simula sem digitar</strong>}</td><td className="p-2">{row.total}</td><td className="p-2">{row.digitized}</td><td className="p-2">{row.lost}</td><td className="p-2">{row.pending}</td><td className="p-2">{row.late}</td><td className="p-2">{(100 * row.digitized / row.total).toFixed(1)}%</td></tr>)}</tbody></table>{!rows.length && <p className="p-3 text-sm text-slate-500">Nenhuma simulação automática dos parceiros neste mês.</p>}</div></section>;
}
