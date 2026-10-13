import React, { useState } from 'react';
import { Partner } from '../../types';
import { DaycovalSimulationModal } from './DaycovalSimulationModal';

export function SpreadsheetPortRefinWorkspace({ partners = [], portal = false, onSuccess }: { partners?: Partner[]; portal?: boolean; onSuccess: () => void }) {
  const [bank, setBank] = useState<'DAYCOVAL' | 'C6' | 'PARANA'>('DAYCOVAL');
  return <section className="space-y-4"><header><h2 className="text-lg font-bold">PORT + REFIN · Planilhas</h2><p className="mt-1 text-sm text-slate-500">Simule com o arquivo de cada banco ativado pelo MASTER da empresa.</p></header><div className="flex flex-wrap gap-2" role="tablist" aria-label="Bancos de Portabilidade + Refinanciamento por planilha">{(['DAYCOVAL', 'C6', 'PARANA'] as const).map(item => <button key={item} type="button" role="tab" aria-selected={bank === item} onClick={() => setBank(item)} className={`rounded-lg border px-5 py-2 text-sm font-bold ${bank === item ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{item === 'DAYCOVAL' ? 'Daycoval' : item === 'PARANA' ? 'Paraná' : 'C6'}</button>)}</div><DaycovalSimulationModal bank={bank} embedded portal={portal} partners={partners} onClose={() => {}} onSuccess={onSuccess} /></section>;
}
