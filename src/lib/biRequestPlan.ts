/**
 * BI datasets per visible tab. Load only what the operator can see.
 * The executive overview retains its 4 existing metrics sources.
 */
export type BITabId='visao-geral'|'producao'|'conversao'|'bancos'|'produtos'|'parceiros'|'operadores'|'sla-pendencias'|'gargalos'|'integracoes';
export type BIDataSet='overview'|'production'|'conversion'|'banks'|'products'|'convenios'|'partners'|'operators'|'pendencies'|'bottlenecks'|'cancellations'|'refusals'|'integrations'|'operationalHealth'|'comparison';
export const BI_TAB_REQUESTS:Record<BITabId,readonly BIDataSet[]>={
  'visao-geral':['overview','production','comparison','operationalHealth'],
  'producao':['production'],
  'conversao':['conversion'],
  'bancos':['banks'],
  'produtos':['products','convenios'],
  'parceiros':['partners'],
  'operadores':['operators'],
  'sla-pendencias':['pendencies'],
  'gargalos':['bottlenecks','cancellations','refusals'],
  'integracoes':['integrations'],
};
export function biRequestsForTab(tab:BITabId):readonly BIDataSet[]{return BI_TAB_REQUESTS[tab];}
