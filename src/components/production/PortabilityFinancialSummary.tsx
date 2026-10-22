import React from 'react';
import type { Proposal } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { PORTABILITY_SITUATIONS, portabilityMonitoredValue, type PortabilitySegment, type PortabilitySituation } from '../../lib/portabilityMonitoring';
import { MetricCard } from '../ui/MetricCard';

export type PortabilityFinancialRow = { proposal: Proposal; segment: PortabilitySegment; situation: PortabilitySituation };
export function PortabilityFinancialSummary({ rows, selected, onSelect }: {
  rows: PortabilityFinancialRow[];
  selected: { segment: PortabilitySegment; situation: PortabilitySituation } | null;
  onSelect: (segment: PortabilitySegment, situation: PortabilitySituation) => void;
}) {
  return <section aria-label="Acompanhamento financeiro da portabilidade" className="col-span-full min-w-0 space-y-5">
    <header><h2 className="text-base font-bold">Acompanhamento financeiro</h2><p className="mt-1 text-xs leading-5 text-slate-500">Situação atual da carteira carregada. Clique em um cartão para consultar as propostas. Pendentes: pendências ou ação do cliente/parceiro; em andamento: demais etapas abertas.</p></header>
    {(['SALDO', 'TROCO'] as const).map(segment => {
      const items = rows.filter(row => row.segment === segment);
      return <section key={segment} aria-label={segment === 'SALDO' ? 'Saldos de portabilidade' : 'Trocos de refinanciamento da portabilidade'} className="space-y-2">
        <h3 className="text-sm font-semibold">{segment === 'SALDO' ? 'Saldo devedor da portabilidade' : 'Troco do refinanciamento da portabilidade'}</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{PORTABILITY_SITUATIONS.filter(item => !['CANCELADO', 'OUTROS'].includes(item.key) || items.some(row => row.situation === item.key)).map(item => {
          const group = items.filter(row => row.situation === item.key);
          const total = group.reduce((sum, row) => sum + (portabilityMonitoredValue(row.proposal, segment) ?? 0), 0);
          const missing = group.filter(row => portabilityMonitoredValue(row.proposal, segment) === null).length;
          return <MetricCard key={item.key} title={item.label} value={formatCurrency(total)} subtitle={`${group.length} proposta${group.length === 1 ? '' : 's'}${missing ? ` · ${missing} sem valor informado` : ''}`} tone={item.tone} onClick={() => onSelect(segment, item.key)} className={selected?.segment === segment && selected.situation === item.key ? 'ring-2 ring-blue-500' : ''} />;
        })}</div>
      </section>;
    })}
    <p className="text-xs text-slate-500">Saldo é somado somente na portabilidade; troco, somente no refinanciamento da portabilidade. Cada proposta segue seu próprio status. Propostas canceladas e sem classificação são apresentadas separadamente.</p>
  </section>;
}
