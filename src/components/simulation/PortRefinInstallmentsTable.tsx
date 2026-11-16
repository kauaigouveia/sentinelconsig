import React from 'react';
import {money,portabilityInstallmentStatus,type PortRefinPaymentBreakdown} from '../../lib/portRefinBreakdown';
import {formatMonthlyRate} from '../../lib/portRefinQuote';

/**
 * Explicit separation between PORTABILITY installment recalculations and the
 * newly originated REFIN installment. Never silently merge those concepts.
 */
export function PortRefinInstallmentsTable({detail}:{detail:PortRefinPaymentBreakdown}){
  return <section className="space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] p-3 sm:p-4" aria-label="Parcelas dos contratos portados">
    <div>
      <h4 className="text-sm font-bold text-[var(--text-primary)]">Parcelas de cada contrato portado</h4>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">Compare a parcela original com a recalculada pela planilha. A parcela do novo refinanciamento aparece separadamente abaixo.</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[610px] text-left text-xs">
        <thead><tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
          <th scope="col" className="p-2">Contrato / banco</th>
          <th scope="col" className="p-2 text-right">Parcela original</th>
          <th scope="col" className="p-2 text-right">Após portabilidade</th>
          <th scope="col" className="p-2 text-right">Alteração</th>
        </tr></thead>
        <tbody>
          {detail.contracts.map((change,index)=>{
            const status=portabilityInstallmentStatus(change);
            return <tr key={index} className="border-b border-[var(--border-default)] align-top">
              <td className="p-2"><strong className="block font-semibold">{change.label}</strong>
                <span className="text-[var(--text-secondary)]">{change.bankCode?'Banco '+change.bankCode:''}{change.contractSuffix?' · Contrato final '+change.contractSuffix:''}</span>
                {typeof change.returnRate==='number'&&change.returnRate>0&&<span className="block text-[var(--text-secondary)]">Taxa de retorno: {formatMonthlyRate(change.returnRate)}</span>}
              </td>
              <td className="p-2 text-right tabular-nums">{money(change.originalInstallment)}</td>
              <td className="p-2 text-right tabular-nums font-bold">{money(change.newInstallment)}</td>
              <td className="p-2 text-right">
                <span className={'font-semibold '+(status.label==='Reduzida'?'text-[var(--success-text)]':status.label==='Aumentada'?'text-[var(--warning-text)]':'text-[var(--text-secondary)]')}>{status.label}</span>
                {status.difference!=null&&status.difference>0&&<span className="block tabular-nums">{money(status.difference)}</span>}
              </td>
            </tr>;
          })}
        </tbody>
        <tfoot><tr className="font-semibold">
          <th className="p-2">Total das portadas</th>
          <td className="p-2 text-right tabular-nums">{money(detail.originalPortabilityTotal)}</td>
          <td className="p-2 text-right tabular-nums">{money(detail.adjustedPortabilityTotal)}</td>
          <td className="p-2 text-right text-[var(--text-secondary)]">Soma dos contratos</td>
        </tr></tfoot>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-elevated)] p-3">
      <div><p className="text-[11px] font-medium text-[var(--text-secondary)]">Parcela do NOVO refinanciamento</p>
        <strong className="mt-1 block text-lg font-bold tabular-nums">{money(detail.refinanceInstallment)}</strong>
      </div>
      <p className="max-w-sm text-xs leading-relaxed text-[var(--text-secondary)]">É uma parcela da nova operação. Não é a parcela de cada contrato portado e não deve ser somada novamente às parcelas individuais.</p>
    </div>
    {detail.adjustedPortabilityTotal===null&&<p role="status" className="text-xs text-[var(--warning-text)]">A planilha não retornou a parcela recalculada de todos os contratos. Não é possível afirmar que todos foram mantidos.</p>}
  </section>;
}
