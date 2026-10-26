import { createHash } from 'node:crypto';
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
export type JourneySnapshot = { executionId: string; running: boolean; banks: JourneyBank[]; results: Record<string, { status: 'QUERYING' | 'RETURNED' | 'ERROR' | 'CONTEXTUAL'; rows: ProductSimulationRow[]; message?: string; contractPending?: boolean; executionId?: string }> };
type Entry = { fingerprint: string; updated: number; snapshot: JourneySnapshot; listeners: Set<(snapshot: JourneySnapshot) => void> };

// Process-local deduplication only. Never retry a POST automatically after an uncertain outcome.
export class CltJourneyService {
  private entries = new Map<string, Entry>();
  private key(tenant: string, actor: string, id: string) { return JSON.stringify([tenant, actor, id]); }
  get(tenant: string, actor: string, id: string) {
    const key = this.key(tenant, actor, id), entry = this.entries.get(key);
    if (entry && !entry.snapshot.running && Date.now() - entry.updated > 1800000) { this.entries.delete(key); return undefined; }
    return entry;
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
      }),
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
    const key = this.key(tenant, actor, id), fingerprint = createHash('sha256').update(JSON.stringify({ input, provider, action })).digest('hex');
    const previous = this.entries.get(key);
    if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('EXECUTION_CONFLICT'); return previous; }
    for (const [k, e] of this.entries) if (!e.snapshot.running && Date.now() - e.updated > 1800000) this.entries.delete(k);
    if (this.entries.size >= 500) throw new Error('EXECUTION_CAPACITY');
    // Reserve before awaiting discovery, preventing concurrent duplicates.
    const entry: Entry = { fingerprint, updated: Date.now(), snapshot: { executionId: id, running: true, banks: [], results: {} }, listeners: new Set() };
    this.entries.set(key, entry);
    const publish = () => { entry.updated = Date.now(); for (const listener of entry.listeners) listener(entry.snapshot); };
    void (async () => {
      try {
        const all = await this.available(db, tenant);
        const banks = provider ? all.filter(bank => bank.id === provider) : all;
        entry.snapshot.banks = banks;
        for (const bank of banks) entry.snapshot.results[bank.id] = { executionId: id, status: bank.contextual ? 'CONTEXTUAL' : 'QUERYING', rows: [], message: bank.error ? 'Não foi possível verificar a configuração. Nenhuma consulta foi iniciada.' : bank.contextual ? 'Etapa específica disponível neste cartão. Nenhuma autorização enviada.' : undefined };
        publish();
        await Promise.all(banks.filter(bank => !bank.contextual).map(async bank => {
          const result = entry.snapshot.results[bank.id];
          try {
            // Contract gate: never simulate V8 from the unified journey until pre-calculation is resolved.
            const effectiveAction = bank.id === 'v8' ? 'REFRESH' : action;
            const update = async (rows: ProductSimulationRow[]) => { result.rows = rows.map(projectRow); publish(); };
            const response = await ProductSimulationService.run(db, tenant, 'CLT', effectiveAction, { ...input, bmgActorId: actor }, update, [bank.id]);
            result.rows = response.rows.map(projectRow); result.status = 'RETURNED';
            if (bank.id === 'v8') { result.contractPending = true; result.message = 'Pré-cálculo V8 pendente de confirmação contratual. Somente consentimento e margem consultados.'; }
            else if (!result.rows.length) result.message = 'Sem ofertas retornadas nesta consulta.';
          } catch { result.status = 'ERROR'; result.message = 'Consulta não concluída. Confira o estado antes de tentar novamente.'; }
          publish();
        }));
      } catch { entry.snapshot.results.system = { status: 'ERROR', rows: [], message: 'Não foi possível preparar as integrações. Nenhuma repetição automática.' }; }
      finally { entry.snapshot.running = false; publish(); }
    })();
    return entry;
  }
}

function projectRow(row: ProductSimulationRow): ProductSimulationRow {
  const data = row.data as any;
  return { provider: row.provider, institution: row.institution, table: row.table, state: row.state, outcome: row.outcome, message: cltPublicMessage(row.message), amount: row.amount, contractAmount: row.contractAmount, installment: row.installment, term: row.term, rate: row.rate, simulationId: row.simulationId,
    link: typeof row.link === 'string' && /^https:\/\//i.test(row.link) ? row.link : undefined,
    data: data ? { employment: data.employment ? { employer_cnpj: data.employment.employer_cnpj, work_registration: data.employment.work_registration } : undefined,
      margin: data.margin ? { name: data.margin.name, available_balance: data.margin.available_balance, employer: data.margin.employer ? { name: data.margin.employer.name, document: data.margin.employer.document } : undefined } : undefined,
      v8: data.v8 ? { consultId: data.v8.consultId, promoterId: data.v8.promoterId } : undefined } : undefined };
}
