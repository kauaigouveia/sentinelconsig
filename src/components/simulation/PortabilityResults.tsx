import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardCopy, Info } from 'lucide-react';
import { higherMonthlyRateFirst } from '../../lib/monthlyRateOrder';
import { formatMonthlyRate } from '../../lib/portRefinQuote';

export type PortabilityResult = {
  installmentChanges?: {label?: string; originalInstallment: number; newInstallment: number | null}[];
  originalInstallment?: number;
  contractLabel?: string;
  provider: string;
  unified?: boolean;
  success: boolean;
  requiresReview?: boolean;
  reviewReason?: string;
  troco?: number | null;
  term?: number;
  table?: any;
  data?: {contractAmount?:number; balance?:number; rate?:number; installment?:number};
  error?: string;
  skipped?: boolean;
};

type Condition = { installment?: number | null; rate?: number | string | null };
const amount = (value:unknown) => {
  const number = Number(value);
  return value == null || !Number.isFinite(number) || number < 0
    ? 'Não informado'
    : number.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
};
const positive = (value: unknown) => value != null && Number.isFinite(Number(value)) && Number(value) > 0;
const bankName = (provider:string) => ({
  PARANA:'Paraná Banco',
  C6:'C6 Bank',
  DAYCOVAL:'Daycoval',
  FINANTO:'Finanto',
  FACTA:'Facta',
} as Record<string,string>)[provider] || provider;

/** Financial values are estimates from the configured calculation. Selection saves a reviewable quote, not a bank approval. */
export function PortabilityResults<T extends PortabilityResult>({rows, selected, selectedRows, savedRows, onSelect, conditionFor}:{
  rows:T[];
  selected:T|null;
  selectedRows?:T[];
  savedRows?:T[];
  onSelect:(row:T)=>void;
  conditionFor:(row:T)=>Condition;
}) {
  const [unified, setUnified] = useState(false);
  const [providerFilter, setProviderFilter] = useState('');
  const [page, setPage] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const available = rows.filter(row => !row.skipped);
  const providers = [...new Set(available.map(row => row.provider))].sort();
  const grouped = useMemo(() => {
    const byContract = new Map<string,Map<string,T[]>>();
    for (const row of rows) {
      if (row.skipped || Boolean(row.unified) !== unified || (providerFilter && row.provider !== providerFilter)) continue;
      const label = row.contractLabel || 'Contrato informado';
      if (!byContract.has(label)) byContract.set(label, new Map());
      const byProvider = byContract.get(label)!;
      if (!byProvider.has(row.provider)) byProvider.set(row.provider, []);
      byProvider.get(row.provider)!.push(row);
    }
    return [...byContract.entries()];
  }, [rows, unified, providerFilter]);

  const lastPage = Math.max(0, Math.ceil(grouped.length / 3) - 1);
  const currentPage = Math.min(page, lastPage);

  const sharing = selectedRows?.length ? selectedRows : selected ? [selected] : [];
  const shareText = sharing.map((row,index) => [
    'COTAÇÃO ' + (index + 1) + ' · INSS PORTABILIDADE + REFINANCIAMENTO',
    'Instituição: ' + bankName(row.provider),
    'Contrato: ' + (row.contractLabel || 'Contrato informado'),
    'Tabela: ' + (row.table?.name || row.table?.cod_tabela || 'Condição calculada'),
    'Troco estimado: ' + amount(row.troco),
    'Parcela atual: ' + amount(row.originalInstallment),
    'Parcela projetada: ' + amount(conditionFor(row).installment),
    'Prazo: ' + (row.term ? String(row.term) + ' meses' : 'Não informado'),
    'Taxa: ' + formatMonthlyRate(conditionFor(row).rate),
    'Estimativa sujeita à conferência comercial e documental; não representa aprovação ou contratação.',
  ].join('\n')).join('\n\n');


  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível');
      await navigator.clipboard.writeText(shareText);
      setCopyStatus('Resumo copiado. Confira as condições antes de encaminhar.');
    } catch {
      setCopyStatus('Selecione e copie o resumo no campo abaixo.');
    }
  };

  const renderCondition = (row:T, key:string) => {
    const condition = conditionFor(row);
    const selectable = row.success && positive(row.troco);
    const isSelected = selectedRows ? selectedRows.includes(row) : selected === row;
    const isSaved = Boolean(savedRows?.includes(row));
    const original = row.originalInstallment;
    const installment = condition.installment;
    const changed = positive(original) && positive(installment) &&
      Math.round(Number(original) * 100) !== Math.round(Number(installment) * 100);
    const showProjected = !positive(original) || !positive(installment) || changed || Boolean(row.unified) ||
      Boolean(row.installmentChanges?.length);
    return <div key={key} className={'rounded-xl border p-4 sm:p-5 ' + (isSelected
      ? 'border-[var(--action)] bg-[var(--bg-surface-elevated)]'
      : 'border-[var(--border-default)] bg-[var(--bg-surface)]')}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
            {row.table?.name || row.table?.cod_tabela || 'Condição calculada'}
          </p>
          {row.success ? <p className="mt-1 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Info size={13} aria-hidden="true" />
            {row.requiresReview ? 'Estimativa · documentação e vigência para conferir' : 'Cotação calculada · sujeita à aprovação'}
          </p> : <p className="mt-2 text-sm text-[var(--warning-text)]">{row.error || 'Condição indisponível para este contrato.'}</p>}
        </div>
        {row.success && <button type="button" aria-pressed={isSelected} disabled={!selectable || isSaved}
          onClick={() => {setCopyStatus(''); onSelect(row);}}
          className={'inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold ' +
            (isSelected
              ? 'bg-[var(--success-bg)] text-[var(--success-text)] ring-1 ring-[var(--success-border)]'
              : 'bg-[var(--action)] text-[var(--action-ink)]') +
            ' disabled:cursor-not-allowed disabled:opacity-50'}>
          {isSelected || isSaved ? <Check size={15} aria-hidden="true"/> : <ArrowRight size={15} aria-hidden="true"/>}
          {isSaved ? 'Cotação salva' : isSelected ? 'Cotação selecionada' : 'Selecionar cotação'}
        </button>}
      </div>
      {row.success && <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] p-3">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Troco estimado para o cliente</span>
          <strong className="mt-1 block break-words text-xl font-bold tabular-nums text-[var(--success-text)]">{amount(row.troco)}</strong>
        </div>
        <div className="min-w-0 p-2">
          <span className="block text-[11px] text-[var(--text-secondary)]">Parcela atual</span>
          <strong className="mt-1 block text-base tabular-nums">{amount(original)}</strong>
        </div>
        <div className="min-w-0 p-2">
          <span className="block text-[11px] text-[var(--text-secondary)]">{showProjected ? (row.unified ? 'Parcela unificada projetada' : 'Nova parcela do refinanciamento') : 'Parcela mantida'}</span>
          <strong className="mt-1 block text-base tabular-nums">{amount(installment)}</strong>
        </div>
        <div className="min-w-0 p-2">
          <span className="block text-[11px] text-[var(--text-secondary)]">Prazo e taxa mensal</span>
          <strong className="mt-1 block text-sm tabular-nums">{positive(row.term) ? String(row.term) + ' meses' : 'Prazo não informado'}</strong>
          <span className="mt-1 block text-xs">{formatMonthlyRate(condition.rate)}</span>
        </div>
      </div>}
      {row.success && positive(row.data?.contractAmount) && <p className="mt-2 text-xs text-[var(--text-secondary)]">Valor do contrato calculado: <strong>{amount(row.data?.contractAmount)}</strong></p>}
      {Boolean(row.installmentChanges?.length) && <details className="mt-3 rounded-lg border border-[var(--border-default)] p-3 text-xs">
        <summary className="cursor-pointer font-semibold">Ver composição das parcelas da portabilidade</summary>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[var(--text-secondary)]">
          <span>Contrato</span><span>Original</span><span>Recalculada</span>
          {row.installmentChanges!.map((change,index) => <React.Fragment key={index}>
            <span>{change.label || 'Contrato ' + String(index + 1)}</span>
            <strong>{amount(change.originalInstallment)}</strong>
            <strong>{amount(change.newInstallment)}</strong>
          </React.Fragment>)}
          {row.installmentChanges!.length > 1 && <>
            <strong>Total</strong>
            <strong>{row.installmentChanges!.every(item => positive(item.originalInstallment))
              ? amount(row.installmentChanges!.reduce((sum,item) => sum + item.originalInstallment,0)) : 'Não informado'}</strong>
            <strong>{row.installmentChanges!.every(item => positive(item.newInstallment))
              ? amount(row.installmentChanges!.reduce((sum,item) => sum + Number(item.newInstallment),0)) : 'Não informado'}</strong>
          </>}
        </div>
      </details>}
      {row.requiresReview && <p className="mt-3 text-xs text-[var(--warning-text)]">
        Esta cotação pode ser salva para conferência, mas não deve seguir para contratação antes da validação.
      </p>}
    </div>;
  };

  return <section className="mt-6 space-y-4" aria-label="Resultados da portabilidade">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold text-[var(--text-primary)]">Comparação de simulações</h3>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-secondary)]">
          Compare o troco, a parcela e o prazo por contrato e por banco. Os valores são estimativas, não aprovação de crédito.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold">
        Filtrar banco
        <select aria-label="Filtrar banco" value={providerFilter} onChange={event => {setProviderFilter(event.target.value);setPage(0);}}
          className="max-w-48 rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] p-2">
          <option value="">Todos os bancos</option>
          {providers.map(provider => <option key={provider} value={provider}>{bankName(provider)}</option>)}
        </select>
      </label>
    </header>
    <div className="flex flex-wrap gap-2" aria-label="Tipo de resultado">
      {[false,true].map(value => <button type="button" key={String(value)} aria-pressed={unified === value}
        onClick={() => {setUnified(value);setPage(0);}}
        className={'rounded-lg border px-3 py-2 text-xs font-semibold ' +
          (unified === value ? 'border-[var(--action)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]' : 'border-[var(--border-default)] text-[var(--text-secondary)]')}>
        {value ? 'Unificações Daycoval' : 'Contratos individuais'} ({new Set(available.filter(row => Boolean(row.unified) === value).map(row => row.contractLabel || 'Contrato informado')).size})
      </button>)}
    </div>
    {unified && <p className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)]">
      Unificações representam alternativas para os mesmos contratos; os valores não devem ser somados entre propostas.
    </p>}
    {grouped.length === 0 && <p role="status" className="rounded-xl border border-[var(--border-default)] p-6 text-sm">Nenhuma simulação encontrada para estes filtros.</p>}
    {grouped.slice(currentPage * 3,currentPage * 3 + 3).map(([label,banks]) => <article key={label}
      className="space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-elevated)] p-3 sm:p-5">
      <h4 className="border-b border-[var(--border-default)] pb-3 text-sm font-bold">{label}</h4>
      {[...banks].map(([provider,conditions]) => {
        const sorted = [...conditions].sort((a,b) =>
          Number(b.success) - Number(a.success) ||
          higherMonthlyRateFirst(conditionFor(a).rate,conditionFor(b).rate) ||
          (Number(b.troco) || 0) - (Number(a.troco) || 0));
        return <section key={provider} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="text-sm font-bold">{bankName(provider)}</h5>
            <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
              {conditions.length} {conditions.length === 1 ? 'condição' : 'condições'}
            </span>
          </div>
          {renderCondition(sorted[0],provider + ':first')}
          {sorted.length > 1 && <details className="rounded-lg border border-[var(--border-default)] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--link)]">
              Comparar outras {sorted.length - 1} condições de {bankName(provider)}
            </summary>
            <div className="mt-3 space-y-3">{sorted.slice(1).map((row,index) => renderCondition(row,provider + ':' + index))}</div>
          </details>}
        </section>;
      })}
    </article>)}
    {lastPage > 0 && <nav className="flex flex-wrap items-center justify-between gap-3 text-xs" aria-label="Páginas de contratos">
      <button type="button" disabled={currentPage===0} onClick={() => setPage(currentPage-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Anterior</button>
      <span>Página {currentPage+1} de {lastPage+1} · {grouped.length} grupos</span>
      <button type="button" disabled={currentPage===lastPage} onClick={() => setPage(currentPage+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Próxima</button>
    </nav>}
    {sharing.length > 0 && <aside className="rounded-xl border border-[var(--success-border)] bg-[var(--bg-surface)] p-4" aria-label="Resumo selecionado para o parceiro">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold">Resumo {sharing.length === 1 ? 'da cotação selecionada' : 'das ' + sharing.length + ' cotações selecionadas'}</h4>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Dados prontos para copiar e encaminhar ao parceiro com aviso de conferência.</p>
        </div>
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--field-border)] px-3 py-2 text-xs font-semibold">
          <ClipboardCopy size={15} aria-hidden="true"/> Copiar resumo para parceiro
        </button>
      </div>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--bg-canvas)] p-3 text-xs leading-relaxed text-[var(--text-primary)]">{shareText}</pre>
      {copyStatus && <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">{copyStatus}</p>}
    </aside>}
  </section>;
}
