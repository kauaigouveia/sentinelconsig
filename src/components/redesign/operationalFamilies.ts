// Presentation metadata only; route and backend authorization remain unchanged.
const administration = new Set(['admin-usuarios','admin-produtos','admin-status','admin-calendario','admin-auditoria','admin-comunicados','admin-import-status','promotoras','admin-bancos','admin-c6-bank','admin-integracoes-bancos','central-administracao','administracao']);
const workflow = new Set(['agenda-operacional','minha-fila','central-operacoes','gamificacao','home-digitador']);
const support = new Set(['central-atendimento','suporte-central','atendimento-parceiros','suporte','pendencias','sla']);
const analytics = new Set(['dashboard-executivo','radar-comercial','sentinela-ai','sentinel-intelligence','relatorio-gargalos']);
const automation = new Set(['central-automacao','automacoes']);
const platform = new Set(['saas-tenants','admin-plano-consumo']);
const primary = new Set(['torre-controle','producao','simulacoes','esteira','clientes','busca-cpf','pesquisa-cpf','portabilidades','central-pendencias','pendencias-central','parceiros','hub-integracoes','integracoes-hub','financeiro-geral']);
export function operationalFamily(view: string): string | undefined {
  return administration.has(view) ? 'administration' : workflow.has(view) ? 'workflow' : support.has(view) ? 'support' : analytics.has(view) ? 'analytics' : automation.has(view) ? 'automation' : platform.has(view) ? 'platform' : primary.has(view) ? 'special' : ['command-center','command'].includes(view) ? 'command' : view === 'tv-monitor' ? 'monitor' : undefined;
}
