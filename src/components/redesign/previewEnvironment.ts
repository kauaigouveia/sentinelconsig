// Imported exclusively by workspace-preview.tsx. Never import this into the application.
import { StorageService } from '../../services/storageService';
import { galleryRows } from './galleryFixtures';

export function installPreviewEnvironment() {
  if (!import.meta.env.DEV) throw new Error('A prévia de módulos está disponível apenas no desenvolvimento.');
  const stamp = new Date().toISOString();
  const user = {id: 'preview-user', name: 'Ana Demonstração', email: 'ana@example.invalid', role: 'MASTER', active: true, tenantId: 'preview-company', createdAt: stamp, updatedAt: stamp};
  const tenant = {id: 'preview-company', name: 'Empresa de demonstração', slug: 'preview', status: 'ACTIVE', plan: 'ENTERPRISE', maxUsers: 20, storageLimitMb: 100, createdAt: stamp, updatedAt: stamp};
  const banks = [...new Set(galleryRows.map(row => row.bank))].map((name, i) => ({id: `preview-bank-${i}`, name, active: true, createdAt: stamp, updatedAt: stamp}));
  const clients = [...new Set(galleryRows.map(row => row.client))].map((fullName, i) => ({id: `preview-client-${i}`, fullName, cpf: `0000000000${i}`, phone: '', convenio: 'INSS', city: 'Salvador', state: 'BA', createdAt: stamp, updatedAt: stamp}));
  const partners = [{id: 'preview-partner', fullName: 'Parceiro Exemplo', login: 'DEMO', promoterId: 'preview-promoter', active: true, createdAt: stamp, updatedAt: stamp}];
  const products = [{id: 'preview-product', name: 'INSS', code: 'INSS', type: 'INSS', active: true, scope: 'GLOBAL', createdAt: stamp, updatedAt: stamp}];
  const statuses = [...new Set(galleryRows.map(row => row.status))].map((name, i) => ({id: `preview-status-${i}`, name, code: ['AGUARDANDO_FORMALIZACAO','AGUARDANDO_SALDO','PENDENTE','PAGO'][i], color: ['#225de5','#8168bb','#a67224','#238469'][i], active: true, order: i, responsible: 'NOSSA EQUIPE', responsibleGroup: 'NOSSA EQUIPE', slaHours: 48, finalStatus: i === 3, manualChangeAllowed: true, automaticChangeAllowed: false, standardCategory: i === 3 ? 'PAID' : 'IN_PROGRESS'}));
  const proposals = galleryRows.map((row, i) => ({id: row.id, proposalNumber: row.ade, clientId: clients.find(client => client.fullName === row.client)!.id, client: clients.find(client => client.fullName === row.client), clientName: row.client, clientCpf: clients.find(client => client.fullName === row.client)!.cpf, bankId: banks.find(bank => bank.name === row.bank)!.id, bankName: row.bank, productId: 'preview-product', productName: row.product, partnerId: 'preview-partner', partnerCode: 'DEMO', promoterId: 'preview-promoter', digitizerId: user.id, statusId: statuses[i % 4].id, status: statuses[i % 4], currentResponsible: 'NOSSA EQUIPE', disbursedValue: row.amount, contractValue: row.contract, installmentValue: row.installment, installmentsCount: 84, type: i % 2 ? 'PORTABILIDADE' : 'NOVO', createdAt: stamp, updatedAt: stamp}));
  const simulations = proposals.slice(0, 8).map((proposal, i) => ({...proposal, cpf: proposal.clientCpf, clientName: proposal.clientName, type: 'INSS_MULTI', simulationType: 'INSS_MULTI', createdById: user.id, status: i % 2 ? 'SIMULAÇÃO ENVIADA' : 'DIGITADA PELA MESA', requestedByUserId: user.id, requestedBy: user, partner: partners[0], partnerId: partners[0].id, observations: 'Registro fictício para avaliação da interface.', results: []}));
  const financial = Array.from({length: 8}, (_, i) => ({id: `preview-finance-${i}`, description: ['Comissão de contratos','Aluguel do escritório','Serviços administrativos','Recebimento operacional'][i % 4], category: i % 2 ? 'DESPESA_FIXA' : 'COMISSAO_RECEBIDA', type: i % 2 ? 'SAIDA' : 'ENTRADA', status: i % 3 ? 'PREVISTO' : 'REALIZADO', amount: 450 + i * 130, dueDate: stamp.slice(0,10), createdAt: stamp, updatedAt: stamp}));
  const empty = () => [];
  Object.assign(StorageService, {
    getActiveUser: () => user, getUsers: () => [user], getCurrentTenant: () => tenant, getCurrentTenantId: () => tenant.id, getTenants: () => [tenant], getClients: () => clients, getBanks: () => banks, getPartners: () => partners, getProducts: () => products, getStatuses: () => statuses, getProposals: () => proposals,
    getProductsForConvenio: () => products, getConvenios: empty, getPromotersForBank: () => [{id: 'preview-promoter', name: 'Promotora Exemplo', active: true}], getPromoters: () => [{id: 'preview-promoter', name: 'Promotora Exemplo', active: true}], getHistory: empty, getComments: empty, getDocuments: empty, getClientNotes: empty, getClientCommunications: empty, getProposalRelations: empty, getTasks: empty,
    getWhiteLabel: () => ({companyName: 'Sentinel Consig', primaryColor: '#225de5'}),
    fetchAndSyncStatuses: async () => statuses, syncWithPostgreSQL: async () => {}, syncSpecificEntity: async () => {},
  });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requestUrl, window.location.href);
    // API calls in this preview never reach a server, including third-party requests.
    if (!url.pathname.startsWith('/api/') && url.origin === window.location.origin) return originalFetch(input, init);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
    if (method !== 'GET' && method !== 'HEAD') return json({error: 'Prévia de layout: alterações e consultas bancárias estão desativadas.'}, 405);
    const data: Record<string, unknown> = {
      '/api/clients': clients, '/api/proposals': proposals, '/api/statuses': statuses, '/api/partners': partners, '/api/users': [user], '/api/banks': banks, '/api/products': products, '/api/convenios': [], '/api/simulations': simulations, '/api/financial': financial,
      '/api/settings/simulation-access': {enabled: true, simulationAccessEnabled: true},
      '/api/public/tenant-branding': {status: 'PLATFORM_DEFAULT', domainType: 'PLATFORM_DEFAULT', companyName: 'Sentinel Consig', primaryColor: '#225de5'},
      '/api/admin/overview': {activeUsersCount: 1, usersCount: 1, productsCount: 1, conveniosCount: 0, openPendenciesCount: 0, pendenciesCount: 0, banksCount: banks.length, activeAutomationsCount: 0},
    };
    if (url.pathname in data) return json(data[url.pathname]);
    if (url.pathname.includes('/support/conversations')) return json({conversations: [], metrics: {openCount: 0, inProgressCount: 0, resolvedCount: 0, totalActive: 0, totalMessagesToday: 0}});
    return json({error: 'Esta fonte não está disponível na prévia de layout.'}, 503);
  };
}
