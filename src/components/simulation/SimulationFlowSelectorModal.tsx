import React from 'react';
import {
  Calculator,
  Building2,
  Briefcase,
  XCircle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Zap,
  Landmark,
} from 'lucide-react';
import { SimulationType } from '../../types';

interface SimulationFlowSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFlow: (flow: SimulationType | 'FINANTO_INSS_PORTABILIDADE' | 'FINANTO_INSS_REFIN' | 'FINANTO_INSS_PORTABILIDADE_REFIN' | 'NOSSA_FINTECH_PORTABILIDADE_REFIN') => void;
  happySimulationAccessEnabled?: boolean;
  finantoEnabled?: boolean;
  nossaFintechEnabled?: boolean;
}

export const SimulationFlowSelectorModal: React.FC<SimulationFlowSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectFlow,
  happySimulationAccessEnabled = true,
  finantoEnabled = false,
  nossaFintechEnabled = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className={`relative w-full ${happySimulationAccessEnabled || finantoEnabled || nossaFintechEnabled ? 'max-w-5xl' : 'max-w-md'} rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 transition-all`}>
        <div className="flex items-start justify-between pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Central de Simulações
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {happySimulationAccessEnabled
                  ? 'Selecione o fluxo desejado para iniciar a simulação'
                  : 'Inicie uma nova simulação manual'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className={`mt-6 grid gap-4 ${happySimulationAccessEnabled || finantoEnabled || nossaFintechEnabled ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1'}`}>
          {/* CARD 1: SIMULAÇÃO MANUAL */}
          <button
            type="button"
            id="btn-flow-manual"
            onClick={() => onSelectFlow('MANUAL')}
            className="group relative flex flex-col justify-between p-5 rounded-xl border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 text-left transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                  <Calculator className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  Ágil
                </span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Simulação Manual
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                  Fluxo independente da mesa. Requer apenas <strong>CPF</strong> e <strong>Agente/Parceiro</strong>.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
              <span>Iniciar Manual</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* CARD 2: HAPPY INSS (Oculto se Happy estiver bloqueado) */}
          {happySimulationAccessEnabled && (
            <button
              type="button"
              id="btn-flow-happy-inss"
              onClick={() => onSelectFlow('HAPPY_INSS')}
              className="group relative flex flex-col justify-between p-5 rounded-xl border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 text-left transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                    Happy INSS
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    Happy INSS
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                    Consignado Público INSS. Esteira completa com <strong>IN100</strong>, autorização digital, margem livre e refin.
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span>Iniciar INSS</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          )}

          {finantoEnabled && ([
            { flow: 'FINANTO_INSS' as const, title: 'INSS Novo', description: 'Simule um novo contrato INSS nas tabelas disponíveis da FINANTO.' },
            { flow: 'FINANTO_INSS_PORTABILIDADE' as const, title: 'INSS Portabilidade', description: 'Informe saldo devedor, parcela atual e parcelas restantes do contrato.' },
            { flow: 'FINANTO_INSS_REFIN' as const, title: 'INSS Refinanciamento', description: 'Consulte contratos elegíveis para refinanciamento na FINANTO.' },
            { flow: 'FINANTO_INSS_PORTABILIDADE_REFIN' as const, title: 'INSS Portabilidade + Refinanciamento', description: 'Transfira o contrato e consulte condição com valor adicional.' },
          ].map(({ flow, title, description }) => (
            <button
              type="button"
              id={`btn-flow-${flow.toLowerCase()}`}
              key={flow}
              onClick={() => onSelectFlow(flow)}
              className="group relative flex flex-col justify-between rounded-xl border-2 border-slate-200 bg-slate-50/50 p-5 text-left shadow-xs transition-all duration-200 hover:border-violet-500 hover:bg-violet-50/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-violet-500 dark:hover:bg-violet-950/20"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"><Landmark className="h-5 w-5" /></div>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">FINANTO</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-violet-600 dark:text-slate-100 dark:group-hover:text-violet-400">{title}</h4>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-200/70 pt-3 text-xs font-semibold text-violet-600 dark:border-slate-700/60 dark:text-violet-400"><span>Iniciar simulação</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
            </button>
          )))}

          {nossaFintechEnabled && <button type="button" id="btn-flow-nossa-fintech-port-refin" onClick={() => onSelectFlow('NOSSA_FINTECH_PORTABILIDADE_REFIN')} className="group relative flex flex-col justify-between rounded-xl border-2 border-slate-200 bg-slate-50/50 p-5 text-left shadow-xs transition-all hover:border-indigo-500 hover:bg-indigo-50/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20">
            <div className="space-y-3"><div className="flex items-center justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"><Landmark className="h-5 w-5" /></div><span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">Nossa Fintech</span></div><div><h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">INSS · Portabilidade + Refin</h4><p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Informe os dados do contrato e compare o troco estimado nas tabelas elegíveis da Nossa Fintech.</p></div></div><div className="mt-5 flex items-center justify-between border-t border-slate-200/70 pt-3 text-xs font-semibold text-indigo-600 dark:border-slate-700/60 dark:text-indigo-400"><span>Simular Port/Refin</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
          </button>}

          {/* CARD 3: HAPPY CLT (Oculto se Happy estiver bloqueado) */}
          {happySimulationAccessEnabled && (
            <button
              type="button"
              id="btn-flow-happy-clt"
              onClick={() => onSelectFlow('HAPPY_CLT')}
              className="group relative flex flex-col justify-between p-5 rounded-xl border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 text-left transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                    Happy CLT
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    Happy CLT (Privado)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                    Consignado Privado para CLT. Integração <strong>Dataprev</strong>, motor de aprovação e simulação de contrato.
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                <span>Iniciar CLT</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Multi-tenant isolado e dados protegidos</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
