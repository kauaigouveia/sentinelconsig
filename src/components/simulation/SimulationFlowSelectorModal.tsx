import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X, Landmark, BriefcaseBusiness, Wallet, PenLine } from 'lucide-react';
import { SimulationType } from '../../types';

interface SimulationFlowSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFlow: (flow: SimulationType | 'PORT_REFIN_PLANILHAS' | 'FINANTO_INSS_PORTABILIDADE' | 'FINANTO_INSS_REFIN' | 'FINANTO_INSS_PORTABILIDADE_REFIN' | 'NOSSA_FINTECH_PORTABILIDADE_REFIN' | 'CLT_MULTI' | 'FGTS_MULTI') => void;
  happySimulationAccessEnabled?: boolean;
  finantoEnabled?: boolean;
  nossaFintechEnabled?: boolean;
}

export const SimulationFlowSelectorModal: React.FC<SimulationFlowSelectorModalProps> = ({isOpen,onClose,onSelectFlow,happySimulationAccessEnabled=true,finantoEnabled=false,nossaFintechEnabled=false}) => {
 const [category,setCategory]=useState<'INSS'|null>(null);
 const dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!isOpen)return;setCategory(null);const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>previous?.focus();},[isOpen]);
 if(!isOpen)return null;
 const inss=finantoEnabled || nossaFintechEnabled || happySimulationAccessEnabled;
 const options: {flow:Parameters<typeof onSelectFlow>[0];title:string;description:string}[]=[
  ...(inss?[{flow:'FINANTO_INSS' as const,title:'Novo empréstimo',description:'Simule um novo contrato para aposentado ou pensionista.'},{flow:'FINANTO_INSS_PORTABILIDADE' as const,title:'Portabilidade',description:'Transfira um contrato de outro banco.'},{flow:'FINANTO_INSS_REFIN' as const,title:'Refinanciamento',description:'Consulte contratos para refinanciar.'},{flow:'NOSSA_FINTECH_PORTABILIDADE_REFIN' as const,title:'Portabilidade + refinanciamento',description:'Transfira o contrato e consulte o troco disponível.'}]:[]),
  {flow:'PORT_REFIN_PLANILHAS',title:'Portabilidade por planilha',description:'Condições de Daycoval, C6 e Paraná nas planilhas disponíveis.'}
 ];
 function choose(flow:Parameters<typeof onSelectFlow>[0]){onSelectFlow(flow);}
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="simulation-choice-title" tabIndex={-1} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();category?setCategory(null):onClose();}if(event.key==='Tab'){const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[href]')||[]);const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}} className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
 <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-950/40"><div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">Nova simulação · {category?'Modalidade':'Produto'}</p><h2 id="simulation-choice-title" className="text-2xl font-bold">{category?'O que deseja fazer no INSS?':'Qual produto deseja simular?'}</h2><p className="mt-2 text-sm leading-6 text-slate-500">Você poderá voltar e corrigir suas escolhas durante o preenchimento.</p></div><button type="button" aria-label="Fechar seleção de produto" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-200 dark:hover:bg-slate-800"><X size={20}/></button></header>
 <div className="overflow-y-auto p-5 sm:p-6">{category?<div className="grid gap-3 sm:grid-cols-2">{options.map(option=><button type="button" key={option.flow} id={`btn-flow-${option.flow.toLowerCase()}`} onClick={()=>choose(option.flow)} className="group rounded-2xl border border-slate-200 p-5 text-left transition-colors hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950/30"><strong className="flex items-center justify-between gap-3 text-base">{option.title}<ArrowRight size={18} className="shrink-0 text-blue-500"/></strong><p className="mt-3 text-sm leading-6 text-slate-500">{option.description}</p></button>)}</div>:<div className="grid gap-4 sm:grid-cols-2">{[{title:'INSS',description:'Novo, portabilidade e refinanciamento.',icon:Landmark,action:()=>setCategory('INSS')},{title:'Crédito do trabalhador',description:'Consulte vínculos, margem e ofertas CLT.',icon:BriefcaseBusiness,action:()=>choose('CLT_MULTI')},{title:'Antecipação FGTS',description:'Consulte saldo e compare as condições.',icon:Wallet,action:()=>choose('FGTS_MULTI')},{title:'Solicitação manual',description:'Encaminhe uma solicitação para a mesa.',icon:PenLine,action:()=>choose('MANUAL')}].map(item=><button type="button" key={item.title} onClick={item.action} className="rounded-2xl border border-slate-200 p-6 text-left transition-colors hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950/30"><item.icon size={26} className="mb-4 text-blue-500"/><strong className="block text-lg">{item.title}</strong><p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p></button>)}</div>}</div>
 <footer className="flex items-center justify-between border-t border-slate-200 p-5 dark:border-slate-700"><button type="button" onClick={()=>category?setCategory(null):onClose()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600"><ArrowLeft size={16}/>{category?'Voltar aos produtos':'Voltar'}</button><span className="text-xs text-slate-500">{category?'Escolha a modalidade INSS':'Escolha o produto'}</span></footer>
 </div></div>;
};
