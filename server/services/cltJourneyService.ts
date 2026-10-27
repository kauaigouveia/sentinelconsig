import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from './cltJourneyStore.js';
import { withinJourneyDeadline } from './cltJourneyDeadline.js';
import { ProductSimulationService, type ProductSimulationInput, type ProductSimulationRow } from './productSimulationService.js';
import { NossaFintechService } from './nossaFintechService.js';
import { FinantoService } from './finantoService.js';
import { FactaBankService } from './factaBankService.js';
import { BmgBankService } from './bmgBankService.js';
import { V8BankService } from './v8BankService.js';
import { ParanaBankService } from './paranaBankService.js';
import { PresencaBankService } from './presencaBankService.js';
import { integrationConfigStore } from './bankPromoterConfig.js';
import { cltPublicMessage } from '../../src/lib/cltSimulationOutcome.js';

export const journeyProviders = ['nossa', 'finanto', 'facta', 'bmg', 'v8', 'parana', 'presenca', 'happy'] as const;
export type JourneyProvider = typeof journeyProviders[number];
export type JourneyBank = { id: JourneyProvider; name: string; contextual?: boolean; error?: boolean };
export type JourneySnapshot = { executionId: string; running: boolean; banks: JourneyBank[]; results: Record<string, { status: 'QUERYING' | 'RETURNED' | 'ERROR' | 'CONTEXTUAL' | 'UNKNOWN'; rows: ProductSimulationRow[]; message?: string; contractPending?: boolean; executionId?: string }> };
type Entry = { raw: string; record: JourneyRecord; snapshot: JourneySnapshot; store: CltJourneyStore; listeners: Set<(snapshot: JourneySnapshot) => void> };

export class CltJourneyService {
  async get(db: any, tenant: string, actor: string, id: string): Promise<Entry | undefined> {
    const store = new CltJourneyStore(db, tenant, actor), saved = await store.read(id);
    if (!saved) return undefined;
    const { record } = saved;
    let raw = saved.raw;
    if ((record.phase === 'RUNNING' || record.phase === 'READY') && Date.now() >= record.deadline) {
      record.phase = 'UNKNOWN'; record.snapshot.running = false;
      for (const result of Object.values(record.snapshot.results)) if (result.status === 'QUERYING') {
        result.status = 'UNKNOWN'; result.message = 'Resultado incerto após interrupção. Confira o estado no banco; nenhuma repetição automática.';
      }
      try { raw = await store.compareAndSet(record.snapshot.executionId, raw, record); }
      catch { return this.get(db, tenant, actor, id); }
    }
    return { raw, record, snapshot: record.snapshot, store, listeners: new Set() };
  }
  async available(db: any, tenant: string): Promise<JourneyBank[]> {
    const banks: JourneyBank[] = [];
    const check = async (id: JourneyProvider, name: string, read: () => Promise<boolean>, contextual = false) => {
      try { if (await read()) banks.push({ id, name, contextual }); }
      catch { banks.push({ id, name, contextual: true, error: true }); }
    };
    await Promise.all([
      check('nossa', 'Nossa Fintech · instituições CLT', async () => { const c = await NossaFintechService.getConfig(db, tenant); return c.enabled && c.isConfigured; }),
      check('finanto', 'FINANTO · instituições CLT', async () => { const c = await FinantoService.getConfig(db, tenant); return c.enabled && c.isConfigured; }),
      check('facta', 'FACTA', async () => { const c = await FactaBankService.getTenantConfig(db, tenant); return c.isConfigured && c.simulationEnabled; }),
      check('bmg', 'BMG', async () => { const c = await BmgBankService.config(db, tenant); return c.enabled; }),
      check('v8', 'V8 DIGITAL', async () => {
        const rows = await db.systemConfig.findMany({ where: { tenantId: tenant, configKey: { startsWith: 'integration:v8:' } }, select: { configKey: true } });
        for (const row of rows) { const promoter = /^integration:v8:(.+):config$/.exec(row.configKey)?.[1]; if (promoter) { const c = await V8BankService.config(db, tenant, promoter); if (c.enabled && c.cltEnabled) return true; } }
        return false;
      }, true),
      check('parana', 'Paraná Banco', async () => {
        const promoters = await db.promoter.findMany({ where: { tenantId: tenant, status: 'ATIVO' }, select: { id: true } });
        for (const p of promoters) { const c = await ParanaBankService.config(db, tenant, p.id); if (c.enabled && c.clientId && c.clientSecret) return true; }
        return false;
      }, true),
      check('presenca', 'Presença Bank', async () => {
        const promoters = await db.promoter.findMany({ where: { tenantId: tenant, status: 'ATIVO' }, select: { id: true } });
        for (const p of promoters) { const c = await PresencaBankService.config(db, tenant, p.id); if (c.enabled && c.cltEnabled) return true; }
        return false;
      }, true),
      check('happy', 'Happy CLT', async () => {
        const access = await db.tenant?.findUnique({ where: { id: tenant }, select: { simulationAccessEnabled: true, happySimulationAccessEnabled: true } });
        if (access?.simulationAccessEnabled === false || access?.happySimulationAccessEnabled === false) return false;
        // Match HappyTokenManager's private namespace, including its documented public fallback.
        const store = await integrationConfigStore(db, tenant, 'happy');
        const rows = await store.findMany({ where: { tenantId: tenant, configKey: { in: ['happy_ativo', 'happy_clt_client_id', 'happy_client_id', 'happy_clt_secret', 'happy_secret', 'happy_clt_usuario', 'happy_usuario', 'happy_clt_senha', 'happy_senha'] } } });
        const values = new Map(rows.map((r: any) => [r.configKey, r.configValue]));
        return values.get('happy_ativo') === 'true' && ['client_id', 'secret', 'usuario', 'senha'].every(field => !!(values.get(`happy_clt_${field}`) || values.get(`happy_${field}`)));
      }, true),
    ]);
    return banks.sort((a, b) => journeyProviders.indexOf(a.id) - journeyProviders.indexOf(b.id));
  }
  async start(db: any, tenant: string, actor: string, id: string, input: ProductSimulationInput, provider?: JourneyProvider, action: 'SIMULATE' | 'AUTHORIZE' | 'REFRESH' = 'SIMULATE') {
    const fingerprint = journeyFingerprint({ input, provider, action });
    const previous = await this.get(db, tenant, actor, id);
    if (previous) { if (previous.record.fingerprint !== fingerprint) throw Error('EXECUTION_CONFLICT'); return previous; }
    const all = await this.available(db, tenant), banks = provider ? all.filter(bank => bank.id === provider).map(bank => bank.id === 'v8' ? { ...bank, contextual: false } : bank) : all;
    const snapshot: JourneySnapshot = { executionId: id, running: true, banks, results: {} };
    for (const bank of banks) snapshot.results[bank.id] = { executionId: id, status: bank.contextual ? 'CONTEXTUAL' : 'QUERYING', rows: [], message: bank.error ? 'Não foi possível verificar a configuração. Nenhuma consulta foi iniciada.' : bank.contextual ? 'Etapa específica disponível neste cartão. Nenhuma autorização enviada.' : undefined };
    const record: JourneyRecord = { fingerprint, phase: 'READY', deadline: Date.now() + 50000, snapshot };
    const store = new CltJourneyStore(db, tenant, actor), canonical = await store.create(id, record);
    const entry = await this.get(db, tenant, actor, canonical);
    if (!entry || entry.record.fingerprint !== fingerprint) throw Error('EXECUTION_CONFLICT');
    return entry;
  }
  async execute(db: any, tenant: string, actor: string, entry: Entry, input: ProductSimulationInput, action: 'SIMULATE' | 'AUTHORIZE' | 'REFRESH' = 'SIMULATE', provider?: JourneyProvider) {
    if (entry.record.phase !== 'READY') return;
    const { record, store, snapshot } = entry, id = snapshot.executionId;
    record.phase = 'RUNNING'; record.deadline = Date.now() + 50000;
    try { entry.raw = await store.compareAndSet(id, entry.raw, record); }
    catch { const current = await this.get(db, tenant, actor, id); if (current) Object.assign(entry, current); return; }
    const stop = new AbortController(), signal = AbortSignal.any([stop.signal, AbortSignal.timeout(40000)]);
    let writes = Promise.resolve();
    const publish = () => {
      // Serialize writes, but use CAS as the distributed authority. Partial results are durable before broadcast.
      const copy = structuredClone(record);
      writes = writes.then(async () => { entry.raw = await store.compareAndSet(id, entry.raw, copy); for (const listener of entry.listeners) listener(copy.snapshot); });
      writes = writes.catch(error => { stop.abort(); throw error; });
      return writes;
    };
    await withinJourneyDeadline(signal, async () => {
      const outcomes = await Promise.allSettled(snapshot.banks.filter(bank => !bank.contextual).map(async bank => {
        const result = snapshot.results[bank.id];
        try {
          const update = async (rows: ProductSimulationRow[]) => { result.rows = rows.map(projectRow); await publish(); };
          const response = await ProductSimulationService.run(db, tenant, 'CLT', bank.id === 'v8' && provider !== 'v8' ? 'REFRESH' : action, { ...input, bmgActorId: actor }, update, [bank.id]);
          result.rows = response.rows.map(projectRow); result.status = result.rows.some(row => row.state === 'ERROR' || row.outcome === 'TECHNICAL_ERROR') ? 'UNKNOWN' : 'RETURNED';
          if (bank.id === 'v8') { result.contractPending = true; result.message = 'Simulação V8 pendente de homologação. Nenhuma simulação V8 é enviada sem liberação do caso e confirmação contratual.'; }
          else if (!result.rows.length) result.message = 'Sem ofertas retornadas nesta consulta.';
        } catch { result.status = 'UNKNOWN'; result.message = 'Resultado incerto. Confira o estado antes de outra operação; nenhuma repetição automática.'; }
        if (signal.aborted) { result.status = 'UNKNOWN'; result.message = 'Prazo da consulta encerrado. Confira o estado no banco antes de outra operação.'; }
        await publish();
      }));
      if (outcomes.some(result => result.status === 'rejected')) throw Error('EXECUTION_PERSISTENCE_FAILED');
    });
    snapshot.running = false;
    record.phase = Object.values(snapshot.results).some(r => r.status === 'UNKNOWN') ? 'UNKNOWN' : 'DONE';
    record.deadline = Date.now();
    await publish();
  }
}

function projectRow(row: ProductSimulationRow): ProductSimulationRow {
  const data = row.data as any;
  return { provider: row.provider, institution: row.institution, table: row.table, state: row.state, outcome: row.outcome, message: cltPublicMessage(row.message), amount: row.amount, contractAmount: row.contractAmount, installment: row.installment, term: row.term, rate: row.rate, simulationId: row.simulationId,
    link: typeof row.link === 'string' && /^https:\/\//i.test(row.link) ? row.link : undefined,
    data: data ? { employment: data.employment ? { employer_cnpj: data.employment.employer_cnpj, work_registration: data.employment.work_registration } : undefined,
      eligible: typeof data.eligible === 'boolean' ? data.eligible : undefined,
      restrictions: safeReasons(data.restrictions),
      borrower: data.borrower ? { name: data.borrower.name } : undefined,
      items: Array.isArray(data.items) ? data.items.slice(0, 500).map((item: any) => ({ employerDocument: item.employerDocument, employerName: item.employerName, registrationNumber: item.registrationNumber, term: item.term, rate: item.rate, netValue: item.netValue, installmentValue: item.installmentValue, maxInstallmentValue: item.maxInstallmentValue })) : undefined,
      margin: data.margin ? { name: data.margin.name, available_balance: data.margin.available_balance, can_continue: typeof data.margin.can_continue === 'boolean' ? data.margin.can_continue : undefined, restrictions: safeReasons(data.margin.restrictions), employer: data.margin.employer ? { name: data.margin.employer.name, document: data.margin.employer.document } : undefined } : undefined,
      v8: data.v8 ? { consultId: data.v8.consultId, promoterId: data.v8.promoterId } : undefined } : undefined };
}

function safeReasons(value: unknown) { return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 30).map(v => cltPublicMessage(v)).filter(Boolean) : undefined; }
