import React from 'react';
import type { PlaybookInput } from '../../lib/bankPlaybooks';
export function BankPlaybooksPanel({portal=false}:{input?:PlaybookInput;portal?:boolean}) {
 return <aside className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"><h3 className="text-sm font-semibold">Roteiros operacionais em PDF</h3><p className="mt-2 text-sm leading-6 text-slate-500">{portal?'As condições devem ser conferidas nos roteiros vigentes pela mesa.':'Consulte o documento do banco para conferir tabelas, critérios e exceções.'}</p>{!portal&&<a href="/roteiros" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-lg border border-blue-500/30 px-3 py-2 text-sm font-semibold text-blue-500">Abrir biblioteca de PDFs ↗</a>}</aside>;
}
