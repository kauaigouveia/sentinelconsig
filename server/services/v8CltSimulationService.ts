import {calculationDiagnostic} from '../../src/lib/cltCalculationDiagnostic.js';
import { V8CltContract } from './v8CltContract.js';
import { V8CltConsentAudit } from './v8CltConsentAudit.js';
import { v8CltOperation } from './v8CltOperation.js';
import { V8CltPilot } from './v8CltPilot.js';
import { journeyFetch } from './cltJourneyDeadline.js';
import { V8BankService } from './v8BankService.js';
import { currentIntegrationPromoter } from './bankPromoterConfig.js';
import { logger } from '../logger.js';
import { normalizeBrlInput } from '../../src/lib/brlInput.js';
import type { ProductSimulationInput, ProductSimulationRow } from './productSimulationService.js';
import { cltPublicMessage, type CltOutcome } from '../../src/lib/cltSimulationOutcome.js';
import { cltPaymentLimit } from './cltFinancialPolicy.js';
import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from './cltJourneyStore.js';

const responseHttpStatus=Symbol('v8-http-status');
const BASE = 'https://bff.v8sistema.com';
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const number = (value: unknown) => {
  // JSON numbers and documented decimal strings are transport values, not BRL form entries.
  // Never interpret their decimal point as a thousands separator or round provider precision.
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const decimal = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(decimal)) {
    const parsed = Number(decimal);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  // Preserve the previous, explicitly comma-formatted compatibility case. This is not
  // evidence that the bank contract accepts localized financial values in requests.
  if (!decimal.includes(',')) return undefined;
  const parsed = normalizeBrlInput(decimal);
  return parsed !== null && parsed !== '' ? Number(parsed) : undefined;
};
const row = (outcome: CltOutcome, message: string, extra: Partial<ProductSimulationRow> = {}): ProductSimulationRow => ({ provider: 'V8 DIGITAL', institution: 'V8 · QI', state: outcome === 'TECHNICAL_ERROR' ? 'ERROR' : 'PENDING', outcome, message, ...extra });
function v8PublicReason(data:any):string|undefined {
 const message=[data?.description,data?.message,typeof data?.error==='string'?data.error:undefined].find(v=>typeof v==='string'&&v.trim());
 if(!message||/access.?token|refresh.?token|password|senha|credential|secret|api.?key|[A-Za-z0-9_-]{40,}/i.test(message))return undefined;
 return cltPublicMessage(message)?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[e-mail omitido]').replace(/(?:\+55\s*)?\(?\d{2}\)?[ .-]?\d{4,5}[ .-]?\d{4}\b/g,'[telefone omitido]');
}
class V8CltError extends Error {
  constructor(public status: number, public code: string, public officialReason?:string) { super('Falha na consulta CLT V8.'); }
}

export class V8CltSimulationService {
  // A reviewed integration contract replaces the former unconditional pilot flag.
  static async canSimulate(db: any, tenant: string, promoter: string) {
    const c = await V8BankService.config(db, tenant, promoter);
    return c.enabled && c.cltEnabled && c.environment === 'production' && V8BankService.metadata(c).hasCredentials && (await V8CltContract.read(db, tenant, promoter)).simulationReady;
  }
  static async request(db: any, tenantId: string, promoterId: string, path: string, body?: unknown) {
    if (!V8CltPilot.permitsRequest(tenantId)) throw new V8CltError(0, 'OPERATIONAL_SCOPE_REQUIRED');
    // No arbitrary paths, consent acceptance, operation creation or external Azure host.
    const consentId = /^\/private-consignment\/consult\/([a-f\d-]{36})\/authorize$/i.exec(path)?.[1];
    if (consentId) {
      const policy = await V8CltContract.read(db, tenantId, promoterId);
      if (!V8CltPilot.permitsConsent(tenantId, consentId) || !(policy.apiAuthorizationReady || policy.consentReady || policy.nativeConsentReady) || body === undefined) throw new V8CltError(0, 'AUTHORIZATION_SCOPE_REQUIRED');
    } else if (!['/private-consignment/consult', '/private-consignment/simulation/configs', '/private-consignment/simulation'].includes(path.split('?')[0])
      || (body !== undefined && !['/private-consignment/simulation', '/private-consignment/consult'].includes(path))) throw new V8CltError(0, 'METHOD_NOT_ALLOWED');
    if (path === '/private-consignment/simulation' && !await this.canSimulate(db, tenantId, promoterId)) throw new V8CltError(0, 'HOMOLOGATION_REQUIRED');
    const connection = await V8BankService.config(db, tenantId, promoterId);
    if (!connection.enabled || !connection.cltEnabled || connection.environment !== 'production') throw new V8CltError(0, 'CONNECTION_DISABLED');
    const { token } = await V8BankService.token(db, tenantId, promoterId, 'production');
    let response: Response;
    try {
      response = await journeyFetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new V8CltError(0, 'NETWORK'); }
    const data = consentId && response.ok ? {} : await response.json().catch(() => null);
    if (!response.ok || !data || data.error || data.type === 'permission_denied') throw new V8CltError(response.status, data?.type === 'permission_denied' || response.status === 403 ? 'PERMISSION_DENIED' : 'PROVIDER_RESPONSE',v8PublicReason(data));
    if(data&&typeof data==='object')Object.defineProperty(data,responseHttpStatus,{value:response.status});
    return data;
  }

  static async run(db: any, tenantId: string, action: 'REFRESH' | 'SIMULATE' | 'AUTHORIZE' | 'CREATE_CONSULT', input: ProductSimulationInput): Promise<ProductSimulationRow[]> {
    const permit = await V8CltPilot.authorize(db, tenantId, input);
    if ('reason' in permit) return [row('UNSUPPORTED', 'Seu usuário não possui acesso operacional V8 nesta empresa. Nenhuma consulta foi enviada.')];
    return V8CltPilot.within(permit, () => this.runAuthorized(db, tenantId, action, input));
  }
  private static async runAuthorized(db: any, tenantId: string, action: 'REFRESH' | 'SIMULATE' | 'AUTHORIZE' | 'CREATE_CONSULT', input: ProductSimulationInput): Promise<ProductSimulationRow[]> {
    // An explicit amount always wins over a stale automatic-calculation hint.
    input={...input,autoConditions:input.autoConditions===true&&(input.value==null||input.value===0)};
    // Backend gate covers the unified journey, legacy simulator and partner portal.
    // No environment switch can accidentally enable an unhomologated financial operation.
    const stored = await db.systemConfig?.findMany?.({ where: { tenantId, configKey: { startsWith: 'integration:v8:' } }, select: { configKey: true } }) || [];
    const scoped = currentIntegrationPromoter();
    const promoters = [...new Set<string>(stored.map((item: any) => /^integration:v8:(.+):config$/.exec(item.configKey)?.[1]).filter((id: any) => id && (!scoped || id === scoped)))];
    const rows: ProductSimulationRow[] = [];
    if (input.v8ConsultId && !input.v8PromoterId) return [row('MISSING_DATA', 'Selecione a conexão e a consulta V8 juntas. Atualize os dados e selecione novamente.')];
    if (input.v8PromoterId && !promoters.includes(input.v8PromoterId)) return [row('MISSING_DATA', 'A conexão V8 selecionada não pertence às conexões disponíveis desta empresa.')];
    if (action === 'CREATE_CONSULT' && promoters.length > 1 && !input.v8PromoterId) return [row('MISSING_DATA', 'Selecione uma conexão V8 antes de criar a consulta. Nenhuma consulta foi criada.')];
    for (const promoterId of promoters) {
      if (input.v8PromoterId && input.v8PromoterId !== promoterId) continue;
      try {
        const config = await V8BankService.config(db, tenantId, promoterId);
        if (!config.enabled) continue;
        if (!config.cltEnabled) { rows.push(row('UNSUPPORTED', 'CLT não está habilitado nesta conexão V8. Confira a habilitação com o administrador.')); continue; }
        if (config.environment !== 'production') { rows.push(row('UNSUPPORTED', 'O endereço de homologação V8 ainda não foi confirmado.')); continue; }
        if (!V8BankService.metadata(config).hasCredentials) { rows.push(row('MISSING_DATA', 'As credenciais da conexão V8 estão incompletas. Solicite a configuração ao administrador.')); continue; }
        const contract = action === 'CREATE_CONSULT' || action === 'AUTHORIZE' ? undefined : await V8CltContract.read(db, tenantId, promoterId);
        if (action === 'SIMULATE' && !contract.simulationReady) { rows.push(row('MISSING_DATA', contract.reasons.join(' '))); continue; }
        if (action === 'AUTHORIZE') { rows.push(row('AUTHORIZATION_REQUIRED', 'Use Autorizar consulta V8 no cartão da consulta. A operação dedicada valida sessão, empresa, consulta e dispositivo antes de acessar a API.')); continue; }
        if (action === 'CREATE_CONSULT') {
          const body = this.consultationPayload(input);
          if (!body) { rows.push(row('MISSING_DATA', 'Informe nascimento, sexo e e-mail válidos do trabalhador para criar a consulta V8.')); continue; }
          rows.push(...await this.createConsultationOnce(db, tenantId, promoterId, input.cpf, body));
          continue;
        }
        const endDate = new Date(), startDate = new Date(endDate.getTime() - 30 * 86400000);
        const consultations: any[] = [];
        // The documented listing is paginated; never switch to another CPF or pick the first row.
        for (let page = 1; page <= 10; page++) {
          const query = new URLSearchParams({ startDate: startDate.toISOString(), endDate: endDate.toISOString(), limit: '50', page: String(page), search: input.cpf, provider: 'QI' });
          const result = await this.request(db, tenantId, promoterId, `/private-consignment/consult?${query}`);
          if (!Array.isArray(result.data)) throw new V8CltError(200, 'CONSULT_SCHEMA');
          consultations.push(...result.data.filter((item: any) => String(item.documentNumber || '').replace(/\D/g, '') === input.cpf));
          if (!result.pages?.hasNext) break;
          if (page === 10) throw new V8CltError(200, 'PAGINATION_LIMIT');
        }
        let selected = input.v8ConsultId ? consultations.filter(item => item.id === input.v8ConsultId) : consultations;
        if(!input.v8ConsultId){
          const owned=[];for(const item of selected)if(await this.ownsConsult(db,tenantId,promoterId,input.cpf,item.id))owned.push(item);
          const active=owned.filter(item=>!['FAILED','REJECTED'].includes(item.status));
          if(owned.length)selected=active.length?active:owned;
        }
        if (action === 'SIMULATE' && selected.length > 1) { rows.push(row('MISSING_DATA', 'A V8 retornou múltiplas consultas. Atualize os dados e selecione a consulta autorizada que deseja usar.')); continue; }
        if (!selected.length) { rows.push(row(input.v8ConsultId ? 'MISSING_DATA' : 'AUTHORIZATION_REQUIRED', input.v8ConsultId ? 'Consulta V8 selecionada não encontrada para este cliente e conexão. Atualize e selecione novamente.' : 'Nenhuma consulta V8 encontrada nos últimos 30 dias. Crie e autorize uma consulta pela API V8.', input.v8ConsultId ? {} : {data:{v8:{promoterId,nextAction:'CREATE_CONSULT'}}})); continue; }
        for (const consult of selected) {
          if (!uuid(consult.id)) throw new V8CltError(200, 'CONSULT_ID');
          if (!await this.ownsConsult(db, tenantId, promoterId, input.cpf, consult.id)) { rows.push(row('MISSING_DATA', 'Consulta não registrada nesta empresa e conexão. Crie e autorize uma consulta própria; os dados externos não foram expostos.',{data:{v8:{promoterId,nextAction:'CREATE_CONSULT'}}})); continue; }
          let consentRecorded = await V8CltConsentAudit.recorded(db, tenantId, promoterId, input.cpf, consult.id);
          if(!consentRecorded && ['CONSENT_APPROVED','WAITING_CONSULT','WAITING_CREDIT_ANALYSIS','SUCCESS'].includes(consult.status)){
            await V8CltConsentAudit.record(db,tenantId,promoterId,input.cpf,consult.id,{method:'BANK_STATUS_API',source:'V8_CONSULT',humanAcceptanceCollected:false,observedBankStatus:consult.status,observedAt:new Date().toISOString()});
            consentRecorded=true;
          }
          const reference = { data: { v8: { consultId: consult.id, promoterId, status: consult.status, consentRecorded } } };
          const description = typeof (consult.description ?? consult.Description) === 'string' ? cltPublicMessage(consult.description ?? consult.Description) : undefined;
          if (consult.status === 'REJECTED') { rows.push(row('INELIGIBLE', description || 'A V8 informou que o cliente não é elegível nesta consulta.', reference)); continue; }
          if (consult.status === 'FAILED') { rows.push(row('TECHNICAL_ERROR', description || 'A consulta V8 falhou. Atualize os dados ou confira a conexão.', reference)); continue; }
          const pending: Record<string, string> = { WAITING_CONSENT: 'Aguardando autorização da consulta pela API V8.', CONSENT_APPROVED: 'Autorização processada; aguardando processamento.', WAITING_CONSULT: 'Aguardando consulta à base competente.', WAITING_CREDIT_ANALYSIS: 'Aguardando análise de crédito.' };
          if (consult.status !== 'SUCCESS') { rows.push(row(consult.status === 'WAITING_CONSENT' ? 'AUTHORIZATION_REQUIRED' : 'PENDING', pending[consult.status] || 'Status V8 desconhecido. Nenhuma simulação foi enviada.', reference)); continue; }
          const margin = number(consult.availableMarginValue);
          if (margin === undefined) { rows.push(row('MISSING_DATA', 'A V8 não informou a margem disponível nesta consulta. Atualize os dados.', reference)); continue; }
          if (margin <= 0) { rows.push(row('INELIGIBLE', 'A consulta V8 não retornou margem disponível positiva.', reference)); continue; }
          if (action === 'REFRESH') {
            const configs = await this.request(db, tenantId, promoterId, '/private-consignment/simulation/configs?provider=QI');
            if (!Array.isArray(configs.configs)) throw new V8CltError(200, 'CONFIG_SCHEMA');
            const ownershipConfirmed = await this.ownsConsult(db, tenantId, promoterId, input.cpf, consult.id);
            const configurations = configs.configs.filter((c: any) => uuid(c.id) && Array.isArray(c.number_of_installments)).map((c: any) => ({ id: c.id, name: typeof c.slug === 'string' ? c.slug.slice(0, 100) : 'Configuração CLT', terms: c.number_of_installments.map(Number).filter((t: number) => Number.isInteger(t) && t > 0 && t <= 120), rawMonthlyRate: typeof c.monthly_interest_rate === 'string' || typeof c.monthly_interest_rate === 'number' ? c.monthly_interest_rate : undefined }));
            rows.push(row('PENDING', consentRecorded ? 'Margem disponível; simulação habilitada.' : 'Margem disponível. Falta registrar a autorização desta consulta pela API V8.', { state: 'DATA', data: { v8: { consultId: consult.id, promoterId, status: 'SUCCESS', configurations, ownershipConfirmed, consentRecorded, simulationReady: ownershipConfirmed && consentRecorded && contract.simulationReady, authorizationReady: contract.apiAuthorizationReady, contractReasons: contract.reasons }, margin: { name: consult.name, available_balance: margin, can_continue: true } } })); continue;
          }
          if (!consentRecorded) { rows.push(row('MISSING_DATA', 'Autorize esta consulta pela API V8 antes de simular. A consulta e a margem continuam disponíveis.', reference)); continue; }
          if (!await this.ownsConsult(db, tenantId, promoterId, input.cpf, consult.id)) { rows.push(row('MISSING_DATA', 'Consulta não registrada nesta empresa e conexão. Não será reutilizada para cálculo.', reference)); continue; }
          if (!input.autoConditions && (!(input.value > 0) || !Number.isFinite(input.value))) { rows.push(row('MISSING_DATA', 'Informe um valor positivo para simular na V8.')); continue; }
          if (!input.autoConditions && input.mode === 'Payment' && input.value > margin) { rows.push(row('INELIGIBLE', 'A parcela desejada supera a margem disponível informada nesta consulta V8.')); continue; }
          const configs = await this.request(db, tenantId, promoterId, '/private-consignment/simulation/configs?provider=QI');
          if (!Array.isArray(configs.configs)) throw new V8CltError(200, 'CONFIG_SCHEMA');
          if(input.v8ConfigId&&!uuid(input.v8ConfigId)){rows.push(row('MISSING_DATA','Selecione uma configuração V8 válida.'));continue;}
          const eligibleConfigs=input.v8ConfigId?configs.configs.filter((c:any)=>c.id===input.v8ConfigId):configs.configs;
          if(input.v8ConfigId&&!eligibleConfigs.length){rows.push(row('MISSING_DATA','A configuração V8 selecionada não está disponível nesta conexão. Atualize as configurações.'));continue;}
          let attempted = false;
          for (const table of eligibleConfigs) {
            if (!uuid(table.id) || !Array.isArray(table.number_of_installments)) throw new V8CltError(200, 'CONFIG_SCHEMA');
            const terms = [...new Set<number>(table.number_of_installments.map(Number).filter((term: number) => Number.isInteger(term) && term > 0 && term <= 120 && (!input.term || term === input.term)))];
            for (const term of terms) {
              attempted = true;
              let financialInput:{mode:'Payment'|'Liquid';value:number}={mode:input.mode,value:input.value};
              try {
                const payload = this.simulationPayload(consult, table, term, input);
                financialInput={mode:'installment_face_value' in payload?'Payment':'Liquid',value:('installment_face_value' in payload?payload.installment_face_value:payload.disbursed_amount)!};
                const operation = await v8CltOperation(db, tenantId, promoterId, ['SIMULATE', input.cpf, payload, table.updated_at ?? null, contract.reviewedAt ?? null], async () => {
                let result:any;
                try{result=await this.request(db, tenantId, promoterId, '/private-consignment/simulation', payload);}catch(error){
                  // A definitive financial rejection is a completed result, not an UNKNOWN write.
                  // Persist it inside the existing reservation so it cannot be replayed on recovery.
                  if(error instanceof V8CltError&&[400,422].includes(error.status)&&error.code!=='PERMISSION_DENIED')return [row('PENDING',error.officialReason?`V8: ${error.officialReason}`:'A V8 rejeitou esta condição. Outras configurações elegíveis continuam sendo verificadas.',{data:{calculationDiagnostics:[calculationDiagnostic('v8',financialInput,term,'BANK_REJECTED',error.status)]}})];
                  throw error;
                }
                if(Array.isArray(result)&&result.length===0)return [row('PENDING','A V8 retornou uma resposta vazia, sem ofertas para esta condição.',{data:{calculationDiagnostics:[calculationDiagnostic('v8',financialInput,term,'API_ZERO_OFFERS',result[responseHttpStatus])]}})];
                const amount = number(result.disbursement_amount), installment = number(result.installment_value);
                if (!uuid(result.id_simulation) || !amount || amount <= 0 || !installment || installment <= 0 || installment > margin || !input.autoConditions&&input.mode==='Payment'&&installment>input.value+0.005 || Number(result.number_of_installments) !== term) throw new V8CltError(200, 'SIMULATION_SCHEMA');
                const contractAmount = number(result.issue_amount);
                if (result.simulation_config_id !== undefined && result.simulation_config_id !== table.id) throw new V8CltError(200, 'CONFIG_MISMATCH');
                const rawRate = number(result.monthly_interest_rate);
                const rawCet = ['cet', 'monthly_cet', 'annual_cet', 'cet_monthly', 'cet_annual', 'cet_mensal', 'cet_anual'].filter(k => number(result[k]) !== undefined).map(k => ({ field: k, value: result[k] }));
                return [row('OFFER', 'Oferta calculada pela V8.', { state: 'OFFER', table: typeof result.simulation_config_slug === 'string' ? result.simulation_config_slug.slice(0, 100) : typeof table.slug === 'string' ? table.slug.slice(0, 100) : 'V8 CLT', amount, contractAmount: contractAmount && contractAmount > 0 ? contractAmount : undefined, installment, term, simulationId: result.id_simulation, data: { calculationDiagnostics:[calculationDiagnostic('v8',financialInput,term,'OFFER',result[responseHttpStatus],1,1)],v8: { consultId: consult.id, promoterId, status: 'SUCCESS', rawCet, operationAmount: number(result.operation_amount), issueAmount: contractAmount, disbursedIssueAmount: number(result.disbursed_issue_amount), requestedMode:financialInput.mode,requestedValue:financialInput.value,requestedProvider: 'QI', returnedProvider: typeof result.provider === 'string' ? result.provider.slice(0, 50) : undefined, simulationConfigId: table.id, isInsured: typeof result.is_insured === 'boolean' ? result.is_insured : undefined, insuranceAmount: number(result.insurance_amount), monthlyInterestRate: rawRate, firstInstallmentDate: typeof result.first_installment_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(result.first_installment_date) ? result.first_installment_date.slice(0, 10) : undefined, iofAmount: number(result.iof_amount) ?? number(result.disbursement_option?.iof_amount), calculatedAt: new Date().toISOString(), rawMonthlyRate: rawRate } } })];
                });
                rows.push(...operation.map(quote=>quote.state==='OFFER'?{...quote,data:{...(quote.data as Record<string,unknown>||{}),v8:{...(quote.data as any)?.v8,requestedMode:financialInput.mode,requestedValue:financialInput.value}}}:quote));
              } catch (error) { const diagnostic=calculationDiagnostic('v8',financialInput,term,error instanceof V8CltError&&[400,422].includes(error.status)&&error.code!=='PERMISSION_DENIED'?'BANK_REJECTED':error instanceof V8CltError&&error.code==='SIMULATION_SCHEMA'?'BACKEND_DISCARDED':'API_ERROR',error instanceof V8CltError?error.status:undefined,error instanceof V8CltError&&error.code==='SIMULATION_SCHEMA'?1:0); const failed=this.failure(error, tenantId, promoterId);rows.push({...failed,data:{...(failed.data as Record<string,unknown>||{}),calculationDiagnostics:[diagnostic]}});return rows; }
            }
          }
          if (!attempted) rows.push(row('PENDING', 'A V8 não retornou configurações para o prazo escolhido.'));
        }
      } catch (error) { rows.push(this.failure(error, tenantId, promoterId)); }
    }
    return rows;
  }

  private static async createConsultationOnce(db: any, tenantId: string, promoterId: string, cpf: string, body: unknown) {
    // Independent of browser UUID, mutable form data and operator. The tenant/connection/
    // case reservation is encrypted and committed before a non-idempotent bank POST.
    const fingerprint = journeyFingerprint(['v8-consult', tenantId, promoterId, cpf]);
    const id = `v8-consult:${fingerprint}`, store = new CltJourneyStore(db, tenantId, `bank:v8-clt:${promoterId}`);
    const cached = await store.read(id);
    if (cached) {
      if (cached.record.phase === 'DONE') return cached.record.snapshot.results.v8.rows;
      throw new V8CltError(0, 'CONSULT_UNCERTAIN');
    }
    const record: JourneyRecord = { fingerprint, phase: 'READY', deadline: Date.now() + 50000, snapshot: { executionId: id, running: true, banks: [{ id: 'v8', name: 'V8 DIGITAL' }], results: { v8: { status: 'QUERYING', rows: [] } } } };
    await store.create(id, record);
    const saved = await store.read(id);
    if (!saved || saved.record.phase !== 'READY') throw new V8CltError(0, 'CONSULT_UNCERTAIN');
    record.phase = 'RUNNING';
    let raw: string;
    try { raw = await store.compareAndSet(id, saved.raw, record); }
    catch { throw new V8CltError(0, 'CONSULT_UNCERTAIN'); }
    try {
      const created = await this.request(db, tenantId, promoterId, '/private-consignment/consult', body);
      if (!uuid(created.id)) throw new V8CltError(200, 'CONSULT_SCHEMA');
      const result = row('AUTHORIZATION_REQUIRED', 'Consulta V8 criada. Autorize a consulta pela API V8 para prosseguir.', { data: { v8: { consultId: created.id, promoterId, status: 'WAITING_CONSENT' } } });
      record.phase = 'DONE'; record.snapshot.running = false; record.snapshot.results.v8 = { status: 'RETURNED', rows: [result] };
      await store.compareAndSet(id, raw, record);
      return [result];
    } catch (error) {
      record.phase = 'UNKNOWN'; record.snapshot.running = false; record.snapshot.results.v8 = { status: 'UNKNOWN', rows: [] };
      await store.compareAndSet(id, raw, record).catch(() => {});
      throw Object.assign(error instanceof Error?error:Error('CONSULT_UNCERTAIN'),{writeUncertain:true});
    }
  }

  static async ownsConsult(db: any, tenant: string, promoter: string, cpf: string, consult: string) {
    const fingerprint = journeyFingerprint(['v8-consult', tenant, promoter, cpf]);
    const saved = await new CltJourneyStore(db, tenant, `bank:v8-clt:${promoter}`).read(`v8-consult:${fingerprint}`);
    return saved?.record.phase === 'DONE' && (saved.record.snapshot.results.v8.rows[0]?.data as any)?.v8?.consultId === consult;
  }

  static consultationPayload(input: ProductSimulationInput) {
    const birth = input.v8BirthDate || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !Number.isFinite(Date.parse(birth)) || new Date(birth).toISOString().slice(0, 10) !== birth || Date.parse(birth) >= Date.now() || !['male', 'female'].includes(input.v8Gender || '') || !input.v8Email || input.v8Email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.v8Email) || !/^\d{10,11}$/.test(input.phone)) return undefined;
    return { borrowerDocumentNumber: input.cpf, gender: input.v8Gender, birthDate: birth, signerName: input.name, signerEmail: input.v8Email, signerPhone: { phoneNumber: input.phone.slice(2), countryCode: '55', areaCode: input.phone.slice(0, 2) }, provider: 'QI' };
  }
  // Pure contract builder. The real POST also requires operational scope and a reviewed contract.
  static simulationPayload(consult: any, config: any, term: number, input: ProductSimulationInput) {
    const automatic=input.autoConditions===true&&(input.value==null||input.value===0);
    const margin = number(consult.availableMarginValue), value = automatic ? cltPaymentLimit(margin) : input.value;
    if (consult.status !== 'SUCCESS' || String(consult.documentNumber || '').replace(/\D/g, '') !== input.cpf || !uuid(consult.id) || !uuid(config.id) || !config.number_of_installments?.map(Number).includes(term) || !Number.isInteger(term) || term <= 0 || term > 120 || !margin || margin <= 0 || !value || !Number.isFinite(value) || value <= 0 || ((automatic || input.mode === 'Payment') && value > margin)) throw new V8CltError(0, 'SIMULATION_PARAMETERS');
    return { consult_id: consult.id, config_id: config.id, ...(automatic || input.mode === 'Payment' ? { installment_face_value: value } : { disbursed_amount: value }), number_of_installments: term, provider: 'QI' };
  }

  private static failure(error: unknown, tenantId: string, promoterId: string) {
    const code = error instanceof V8CltError ? error.code : 'CONNECTION';
    logger.warn({ tenantId, promoterId, provider: 'V8', code, httpStatus: error instanceof V8CltError ? error.status : undefined }, '[CLT] V8 consultation unavailable');
    const uncertain=code==='CONSULT_UNCERTAIN'||(error as any)?.writeUncertain===true;
    if(error instanceof V8CltError&&[400,422].includes(error.status)&&error.code!=='PERMISSION_DENIED')return row('PENDING','A V8 rejeitou esta condição. Outras configurações elegíveis continuam sendo verificadas.');
    return row('TECHNICAL_ERROR', code === 'CONSULT_UNCERTAIN' ? 'Já existe uma criação V8 em andamento ou com resultado incerto. Confira a consulta na V8; o POST não será repetido.' : code === 'PERMISSION_DENIED' ? 'A V8 não liberou as permissões CLT desta conexão. Solicite a habilitação ao suporte V8.' : error instanceof V8CltError&&error.officialReason?`V8: ${error.officialReason}`:'Não foi possível concluir a consulta CLT V8. Atualize os dados ou confira a conexão com o administrador.',uncertain?{data:{writeUncertain:true}}:{});
  }
}
