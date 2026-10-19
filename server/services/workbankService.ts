import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { ProposalType } from '@prisma/client';
import { bankPromoterConfigKey, resolveBankPromoter } from './bankPromoterConfig.js';
import { resolveMappedBankStatus } from './bankStatusMappings.js';
import { isValidCpf } from '../../src/lib/utils.js';

const ORIGINS = ['https://goapi.workbankvirtual.com.br', 'https://go-api.workbankvirtual.com.br'];
const WORKBANK_ORIGIN = 'https://go-api.workbankvirtual.com.br';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const workbankAgentKey = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
function key() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('Segredo de autenticação não configurado.');
  return createHash('sha256').update(`sentinel:workbank:${secret}`).digest();
}
function seal(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(part => part.toString('base64')).join('.');
}
function open(value: string) {
  const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}
export type WorkbankRow = {
  id: string; proposalNumber: string; agent: string; bank: string; product: string; agreement: string;
  status: string; operation: string; cpf: string; clientName: string; createdAt: string;
  releasedValue: number; contractValue: number; debtBalance: number; installmentValue: number; installmentsCount: number; observation?: string;
};
export function normalizeWorkbankRow(raw: any): WorkbankRow {
  const text = (field: string, max = 250) => String(raw?.[field] ?? '').trim().slice(0, max);
  const amount = (field: string) => {
    const value = Number(raw?.[field]);
    if (raw?.[field] == null || raw[field] === '' || !Number.isFinite(value) || value < 0 || value > 9999999999.99) throw new Error('Valores financeiros ausentes ou inválidos no extrato.');
    return value;
  };
  const id = text('idProposta', 80), proposalNumber = text('nrProposta', 80), installmentsCount = amount('qtParcela');
  if (String(raw?.idProposta ?? '').length > 80 || String(raw?.nrProposta ?? '').length > 80) throw new Error('Identificador da proposta excede o limite permitido.');
  if (!id || !proposalNumber || !Number.isInteger(installmentsCount) || installmentsCount < 1 || installmentsCount > 1000) throw new Error('Identificador, número ou prazo ausente/inválido.');
  if (typeof raw.idProposta === 'number' && !Number.isSafeInteger(raw.idProposta)) throw new Error('Identificador numérico fora do limite seguro.');
  return { id, proposalNumber, observation: text('dsObservacao', 2000), agent: text('nmAgente'), bank: text('nmBanco'), product: text('dsProduto'), agreement: text('dsConvenio'), status: text('DsSituacao'), operation: text('dsTipoProposta'), cpf: text('nrCPF', 30).replace(/\D/g, ''), clientName: text('nmCliente'), createdAt: text('dtInclusao', 50), releasedValue: amount('vrLiquido'), contractValue: amount('VAL_BRUTO'), debtBalance: amount('vrSaldoRefin'), installmentValue: amount('vrParcela'), installmentsCount };
}
type RecordData = { row: WorkbankRow; proposalId?: string; message?: string; lastSyncAt: string };
type Config = { enabled: boolean; username: string; clientKey: string; publicKey: string; authOrigin: string; extractOrigin: string };
const tokens = new Map<string, { token: string; expires: number; fingerprint: string }>();
export class WorkbankService {
  static configKey(promoterId: string, suffix: string) { return bankPromoterConfigKey('workbank', promoterId, suffix); }
  static async read(db: any, tenantId: string, promoterId: string, suffix: string) {
    const row = await db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: this.configKey(promoterId, suffix) } } });
    return row ? { ...row, value: open(row.configValue) } : null;
  }
  static async write(db: any, tenantId: string, promoterId: string, suffix: string, value: any) {
    const configKey = this.configKey(promoterId, suffix), configValue = seal(value);
    return db.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue, isSecret: true }, update: { configValue, isSecret: true } });
  }
  static async config(db: any, tenantId: string, promoterId: string): Promise<Config> {
    const saved = (await this.read(db, tenantId, promoterId, 'config'))?.value;
    return { ...(saved || { enabled: false, username: '', clientKey: '', publicKey: '' }), authOrigin: WORKBANK_ORIGIN, extractOrigin: WORKBANK_ORIGIN };
  }
  static metadata(config: Config) { return { enabled: config.enabled, username: config.username, authOrigin: config.authOrigin, extractOrigin: config.extractOrigin, hasClientKey: !!config.clientKey, hasPublicKey: !!config.publicKey }; }
  static async save(db: any, tenantId: string, promoterId: string, input: any) {
    const old = await this.config(db, tenantId, promoterId);
    if ([input.authOrigin, input.extractOrigin].some(value => value && !ORIGINS.includes(value))) throw new Error('Utilize apenas o domínio HTTPS oficial WorkBank.');
    const config: Config = { enabled: input.enabled === true, username: String(input.username || '').trim(), clientKey: String(input.clientKey || old.clientKey).trim(), publicKey: String(input.publicKey || old.publicKey).trim(), authOrigin: WORKBANK_ORIGIN, extractOrigin: WORKBANK_ORIGIN };
    if ([config.clientKey, config.publicKey, config.username].some(value => value.length > 10000 || /[\r\n]/.test(value))) throw new Error('Credenciais inválidas.');
    if (config.enabled && (!config.username || !config.clientKey || !config.publicKey)) throw new Error('Preencha login, clientKey e publicKey.');
    await this.write(db, tenantId, promoterId, 'config', config); tokens.delete(`${tenantId}:${promoterId}`);
    return this.metadata(config);
  }
  static async token(db: any, tenantId: string, promoterId: string, force = false) {
    const config = await this.config(db, tenantId, promoterId);
    if (!config.enabled || !config.username || !config.clientKey || !config.publicKey) throw new Error('Cadastre e habilite a conexão WorkBank.');
    const cacheKey = `${tenantId}:${promoterId}`, fingerprint = hash(JSON.stringify(config)), cached = tokens.get(cacheKey);
    if (!force && cached?.fingerprint === fingerprint && cached.expires > Date.now()) return cached.token;
    const response = await fetch(`${config.authOrigin}/api/auth/v1/token`, { method: 'POST', headers: { clientKey: config.clientKey, publicKey: config.publicKey, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ username: config.username }), redirect: 'error', signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.token !== 'string' || !data.token || /[\r\n]/.test(data.token)) {
      if (response.status >= 500) throw new Error(`A autenticação da WorkBank retornou erro interno (HTTP ${response.status}) no endpoint oficial. Isso não confirma credenciais inválidas. Se persistir, confira com a WorkBank a liberação do login/clientKey/publicKey desta conexão.`);
      throw new Error(`WorkBank não autenticou a conexão (HTTP ${response.status}). Confira o login e as chaves desta promotora.`);
    }
    const expires = Number(data.expiresIn);
    if (Number.isFinite(expires) && expires > 60) tokens.set(cacheKey, { token: data.token, fingerprint, expires: Date.now() + Math.min(expires - 60, 3600) * 1000 });
    return data.token as string;
  }
  static async extract(db: any, tenantId: string, promoterId: string, userId: string, input: any) {
    const dates = [input.datainicio, input.datatermino];
    if (dates.some(date => !/^\d{8}$/.test(String(date)))) throw new Error('Informe datas no formato AAAAMMDD.');
    const toDate = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const start = new Date(toDate(dates[0])), end = new Date(toDate(dates[1]));
    if (dates.some((date, i) => !Number.isFinite([start, end][i].getTime()) || [start, end][i].toISOString().slice(0, 10) !== toDate(date)) || start > end || Number(end) - Number(start) > 366 * 86400000) throw new Error('Período inválido. Consulte até 366 dias por período.');
    const pageNumber = Number(input.pageNumber || 1);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 100000) throw new Error('Página inválida.');
    const config = await this.config(db, tenantId, promoterId), token = await this.token(db, tenantId, promoterId);
    const response = await fetch(`${config.extractOrigin}/api/partner/v1/extract`, { method: 'POST', headers: { 'x-api-key': config.publicKey, 'x-api-token': token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ acao: 'Extrair', tipoperiodo: 'DataOperacao', datainicio: dates[0], datatermino: dates[1], pageNumber }), redirect: 'error', signal: AbortSignal.timeout(25000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.propostaIntegracao) || data.propostaIntegracao.length > 500 || Number(data.pageNumber) !== pageNumber || typeof data.hasNextPage !== 'boolean') throw new Error(`Extrato WorkBank inválido (HTTP ${response.status}). Nenhuma proposta foi enviada à Produção.`);
    // Persist only the documented fields required for reconciliation, never address/RG or tokens.
    const errors: string[] = [], rows: WorkbankRow[] = [];
    for (const raw of data.propostaIntegracao) { try { rows.push(normalizeWorkbankRow(raw)); } catch (error) { errors.push(error instanceof Error ? error.message : 'Registro inválido.'); } }
    const batchId = randomUUID();
    await this.write(db, tenantId, promoterId, `batch:${batchId}`, { userId, cursor: 0, rows, errors, createdAt: Date.now(), pageNumber, hasNextPage: data.hasNextPage, totalPaginas: data.totalPaginas });
    return { batchId, count: rows.length, invalid: errors.length, pageNumber, hasNextPage: data.hasNextPage, totalPaginas: data.totalPaginas };
  }
  static async agent(db: any, tenantId: string, promoterId: string, name: string) {
    const binding = await this.read(db, tenantId, promoterId, `agent:${hash(workbankAgentKey(name))}`);
    if (!binding || binding.value.name !== workbankAgentKey(name)) return null;
    return db.partner.findFirst({ where: { id: binding.value.partnerId, tenantId, promoterId, status: 'ATIVO', deletedAt: null } });
  }
  static async bindAgent(db: any, tenantId: string, promoterId: string, name: string, partnerId: string) {
    const normalized = workbankAgentKey(name);
    if (!normalized || normalized.length > 250) throw new Error('Informe o nome exato do agente retornado pela WorkBank.');
    const partner = await db.partner.findFirst({ where: { id: partnerId, tenantId, promoterId, status: 'ATIVO', deletedAt: null } });
    if (!partner) throw new Error('Selecione um parceiro ativo vinculado a esta empresa e promotora.');
    await this.write(db, tenantId, promoterId, `agent:${hash(normalized)}`, { name: normalized, partnerId });
  }
  static async syncImported(tx: any, tenantId: string, promoterId: string, item: RecordData, userId: string | null) {
    if (!item.proposalId) return;
    const partner = await this.agent(tx, tenantId, promoterId, item.row.agent);
    const proposal = await tx.proposal.findFirst({ where: { id: item.proposalId, tenantId, promoterId, deletedAt: null }, include: { client: true } });
    if (!partner || !proposal || proposal.partnerId !== partner.id || proposal.client.cpf.replace(/\D/g, '') !== item.row.cpf || proposal.proposalNumber !== item.row.proposalNumber) { item.message = 'Vínculo ou identidade divergente. Sincronização retida para conferência.'; return; }
    const target = await resolveMappedBankStatus(tx, tenantId, promoterId, 'workbank', [item.row.status]);
    if (!target) { item.message = 'Mapeie o status WorkBank antes de sincronizar esta proposta.'; return; }
    await tx.proposal.update({ where: { id: proposal.id }, data: { ...this.financial(item.row), statusId: target.id, standardCategory: target.standardCategory, version: { increment: 1 } } });
    if (proposal.statusId !== target.id) await tx.statusHistory.create({ data: { tenantId, proposalId: proposal.id, statusId: target.id, statusName: target.name, userId, notes: 'WorkBank: sincronização do extrato da promotora vinculada.' } });
    item.message = undefined;
  }
  static financial(row: WorkbankRow) { return { releasedValue: row.releasedValue, contractValue: row.contractValue, debtBalance: row.debtBalance, installmentValue: row.installmentValue, installmentsCount: row.installmentsCount }; }
  static async linkedProposal(db: any, tenantId: string, promoterId: string, proposalId: string) {
    const rows = await db.systemConfig.findMany({ where: { tenantId, configKey: { startsWith: this.configKey(promoterId, 'record:') } }, take: 2001 });
    if (rows.length > 2000) throw new Error('Conferência de vínculos WorkBank requer processamento em lote.');
    return rows.find((row: any) => open(row.configValue).proposalId === proposalId) || null;
  }
  static async refreshLinkedProposal(db: any, proposal: any) {
    const stored = await this.linkedProposal(db, proposal.tenantId, proposal.promoterId, proposal.id);
    if (!stored) throw new Error('Vínculo WorkBank não encontrado.');
    const item: RecordData = open(stored.configValue);
    const progressKey = `cip-page:${proposal.id}`;
    const page = (await this.read(db, proposal.tenantId, proposal.promoterId, progressKey))?.value?.page || 1;
    const start = new Date(item.row.createdAt); start.setUTCDate(start.getUTCDate() - 1);
    if (!Number.isFinite(start.getTime())) throw new Error('Data de origem WorkBank inválida.');
    const format = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');
    const batch = await this.extract(db, proposal.tenantId, proposal.promoterId, 'SYSTEM_CIP', { datainicio: format(start), datatermino: format(new Date()), pageNumber: page });
    const saved = await this.read(db, proposal.tenantId, proposal.promoterId, `batch:${batch.batchId}`);
    if (!saved) throw new Error('Página WorkBank indisponível.');
    const matches = saved.value.rows.filter((row: WorkbankRow) => row.id === item.row.id && row.proposalNumber === proposal.proposalNumber);
    // This private scratch batch belongs only to this invocation, not an operator import.
    await db.systemConfig.deleteMany({ where: { id: saved.id, tenantId: proposal.tenantId, configKey: this.configKey(proposal.promoterId, `batch:${batch.batchId}`) } });
    if (matches.length !== 1) {
      await this.write(db, proposal.tenantId, proposal.promoterId, progressKey, { page: batch.hasNextPage ? page + 1 : 1 });
      throw new Error('Proposta não localizada nesta página WorkBank; consulta continuará no próximo ciclo.');
    }
    item.row = matches[0]; item.lastSyncAt = new Date().toISOString();
    await db.$transaction(async (tx: any) => {
      await this.syncImported(tx, proposal.tenantId, proposal.promoterId, item, null);
      if (item.message) throw new Error(item.message);
      await tx.systemConfig.update({ where: { id: stored.id }, data: { configValue: seal(item) } });
    });
    await this.write(db, proposal.tenantId, proposal.promoterId, progressKey, { page: 1 });
    return { success: true, reason: item.row.observation || item.row.status };
  }
  static async step(db: any, tenantId: string, promoterId: string, userId: string, batchId: string) {
    if (!/^[a-f0-9-]{36}$/.test(batchId)) throw new Error('Lote inválido.');
    return db.$transaction(async (tx: any) => {
      const batch = await this.read(tx, tenantId, promoterId, `batch:${batchId}`);
      if (!batch || batch.value.userId !== userId || Date.now() - batch.value.createdAt > 86400000) throw new Error('Lote inexistente, expirado ou de outro operador. Consulte novamente o período.');
      const value = batch.value;
      if (value.done) return { done: true, processed: value.total, total: value.total };
      const claim = await tx.systemConfig.updateMany({ where: { id: batch.id, tenantId, configValue: batch.configValue }, data: { configValue: seal({ ...value, claim: randomUUID() }) } });
      if (claim.count !== 1) throw new Error('Lote em processamento. Tente continuar novamente.');
      for (const row of value.rows.slice(value.cursor, value.cursor + 10) as WorkbankRow[]) {
        const suffix = `record:${hash(row.id)}`, configKey = this.configKey(promoterId, suffix);
        // Lock the record before reading its current production binding. A concurrent
        // page must not overwrite a binding committed by the review action.
        const locked = await tx.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue: seal({ row, lastSyncAt: new Date().toISOString() }), isSecret: true }, update: { updatedAt: new Date() } });
        const previous: RecordData = open(locked.configValue);
        const item: RecordData = { row, proposalId: previous.proposalId, lastSyncAt: new Date().toISOString() };
        if (item.proposalId && (previous.row.bank !== row.bank || previous.row.operation !== row.operation || previous.row.product !== row.product)) item.message = 'Banco, produto ou operação alterado na origem. Sincronização retida para conferência.';
        else await this.syncImported(tx, tenantId, promoterId, item, userId);
        await this.write(tx, tenantId, promoterId, suffix, item);
      }
      value.cursor = Math.min(value.cursor + 10, value.rows.length);
      const done = value.cursor === value.rows.length;
      // Clear the encrypted page once reconciled. Pending records remain independently resumable.
      if (done) { const total = value.cursor; value.rows = []; value.cursor = 0; value.total = total; value.done = true; }
      await this.write(tx, tenantId, promoterId, `batch:${batchId}`, value);
      return { done: value.done === true, processed: value.done ? value.total : value.cursor, total: value.done ? value.total : value.rows.length };
    }, { timeout: 25000 });
  }
  static async records(db: any, tenantId: string, promoterId: string, cursor?: string) {
    const rows = await db.systemConfig.findMany({ where: { tenantId, configKey: { startsWith: this.configKey(promoterId, 'record:') } }, orderBy: { id: 'asc' }, take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return { items: await Promise.all(rows.slice(0, 50).map(async (stored: any) => { const item: RecordData = open(stored.configValue), partner = await this.agent(db, tenantId, promoterId, item.row.agent); return { id: stored.id, ...item, row: { ...item.row, cpf: undefined }, partnerId: partner?.id || null, state: item.proposalId ? 'IMPORTED' : partner ? 'WAITING_REVIEW' : 'WAITING_AGENT' }; })), nextCursor: rows.length > 50 ? rows[49].id : null };
  }
  static async publish(db: any, tenantId: string, promoterId: string, userId: string, recordId: string, input: any, canCreateClient: boolean) {
    return db.$transaction(async (tx: any) => {
      const stored = await tx.systemConfig.findFirst({ where: { id: recordId, tenantId, configKey: { startsWith: this.configKey(promoterId, 'record:') } } });
      if (!stored) throw new Error('Registro não encontrado nesta conexão.');
      const item: RecordData = open(stored.configValue), row = item.row;
      const lock = await tx.systemConfig.updateMany({ where: { id: stored.id, tenantId, configValue: stored.configValue }, data: { configValue: seal({ ...item, claim: randomUUID() }) } });
      if (lock.count !== 1) throw new Error('Registro alterado por outra consulta. Recarregue a fila.');
      if (item.proposalId) throw new Error('Esta proposta já foi enviada à Produção.');
      const partner = await this.agent(tx, tenantId, promoterId, row.agent);
      if (!partner) throw new Error('Vincule o nome do agente ao parceiro correto antes de enviar à Produção.');
      if (!isValidCpf(row.cpf) || !row.clientName) throw new Error('CPF ou nome do cliente inválido. Corrija na origem.');
      if (!Object.values(ProposalType).includes(input.type)) throw new Error('Selecione o tipo de operação.');
      const [bank, product, agreement, bankLink, target] = await Promise.all([
        tx.bank.findFirst({ where: { id: input.bankId || '', tenantId, status: 'ATIVO' } }),
        tx.product.findFirst({ where: { id: input.productId || '', active: true, OR: [{ tenantId }, { tenantId: null, scope: 'GLOBAL' }] } }),
        tx.convenio.findFirst({ where: { id: input.convenioId || '', active: true, OR: [{ tenantId }, { tenantId: null, scope: 'GLOBAL' }] } }),
        tx.bankPromoter.findFirst({ where: { tenantId, bankId: input.bankId || '', promoterId, status: 'ATIVO' } }),
        resolveMappedBankStatus(tx, tenantId, promoterId, 'workbank', [row.status]),
      ]);
      if (!bank || !product || !agreement || !bankLink) throw new Error('Selecione banco habilitado nesta promotora, produto e convênio ativos da empresa.');
      if (!target) throw new Error('Mapeie o status WorkBank para um status interno com alteração automática permitida.');
      const duplicate = await tx.proposal.findUnique({ where: { tenantId_proposalNumber: { tenantId, proposalNumber: row.proposalNumber } } });
      if (duplicate) throw new Error('Número de proposta já cadastrado. Mantido na fila para conferir a origem, sem sobrescrever a Produção.');
      let client = await tx.client.findUnique({ where: { tenantId_cpf: { tenantId, cpf: row.cpf } } });
      if (client?.deletedAt) throw new Error('Cliente inativo. Reative o cadastro antes de importar.');
      if (!client) {
        if (!canCreateClient) throw new Error('Sem permissão clients.create para cadastrar este cliente.');
        client = await tx.client.create({ data: { tenantId, cpf: row.cpf, fullName: row.clientName } });
      }
      const createdAt = new Date(row.createdAt);
      if (!Number.isFinite(createdAt.getTime())) throw new Error('Data de inclusão inválida na origem.');
      const proposal = await tx.proposal.create({ data: { tenantId, proposalNumber: row.proposalNumber, clientId: client.id, partnerId: partner.id, promoterId, bankId: bank.id, productId: product.id, convenioId: agreement.id, type: input.type, statusId: target.id, standardCategory: target.standardCategory, ...this.financial(row), createdById: userId, createdAt } });
      await tx.statusHistory.create({ data: { tenantId, proposalId: proposal.id, statusId: target.id, statusName: target.name, userId, notes: 'WorkBank: importação revisada com vínculo explícito do agente.' } });
      item.proposalId = proposal.id;
      await this.write(tx, tenantId, promoterId, `record:${hash(row.id)}`, item);
      const configKey = `workbank:source:${proposal.id}`;
      await tx.systemConfig.create({ data: { tenantId, configKey, configValue: JSON.stringify({ promoterId, externalId: row.id }), isSecret: false } });
      return { proposalId: proposal.id };
    }, { timeout: 25000 });
  }
}
