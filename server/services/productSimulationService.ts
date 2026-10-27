import type { PrismaClient } from '@prisma/client';
import { NossaFintechService } from './nossaFintechService';
import { FinantoService } from './finantoService';
import { FactaBankService } from './factaBankService';
import { FactaSimulationService } from './factaSimulationService';
import { BmgBankService } from './bmgBankService.js';
import { cltResponseReasons } from '../../src/lib/cltRestrictions';
import { V8CltSimulationService } from './v8CltSimulationService.js';
import { cltOutcome, cltPublicMessage, type CltOutcome } from '../../src/lib/cltSimulationOutcome.js';
import { logger } from '../logger.js';

export type ProductSimulationInput = {
  cpf: string; name: string; phone: string; employerDocument?: string; factaRegistration?: string; v8ConsultId?: string; v8PromoterId?: string;
  term: number; value: number; mode: 'Payment' | 'Liquid'; eligibility: boolean;
  bmgActorId?: string;
};
export type ProductSimulationRow = {
  provider: string; institution: string; table?: string; state: 'OFFER' | 'PENDING' | 'ERROR' | 'DATA';
  message?: string; link?: string; amount?: number; contractAmount?: number; installment?: number; term?: number; rate?: number;
  simulationId?: string; data?: unknown;
  outcome?: CltOutcome;
};
const unwrap = (value: any) => value?.data && !value.key && (value.success !== undefined || value.status === undefined) ? value.data : value;
const array = (value: any): any[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const positive = (value: unknown) => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
const safeLink = (value: unknown) => typeof value === 'string' && /^https:\/\//i.test(value) ? value : undefined;

export class ProductSimulationService {
  static async run(prisma: PrismaClient, tenantId: string, product: 'FGTS' | 'CLT', action: 'SIMULATE' | 'AUTHORIZE' | 'REFRESH', input: ProductSimulationInput, onRows?: (rows: ProductSimulationRow[]) => Promise<void>, providers?: readonly string[]) {
    const factaInput = input;
    // FACTA can return an eight-digit employer registration. Other providers
    // require a full CNPJ, so discover their employment records automatically.
    if (product === 'CLT' && input.employerDocument?.length === 8) input = { ...input, employerDocument: undefined };
    const rows: ProductSimulationRow[] = [];
    let configured = false;
    const failure = (provider: string, institution: string, error: any) => {
      const detail = error?.message || 'Não foi possível consultar esta instituição.';
      const j17Timeout = provider === 'Nossa Fintech' && institution === 'J17' && /curl error 28|connection timed out|timeout|timedout/i.test(detail);
      rows.push({ provider, institution, state: 'ERROR', message: j17Timeout
        ? 'J17 não respondeu à Nossa Fintech dentro do prazo. Tente novamente mais tarde. As demais instituições continuam disponíveis.'
        : detail });
    };
    const nossaCall = async (method: string, endpoint: string, body?: unknown) => {
      const result = await NossaFintechService.request(prisma, tenantId, method, endpoint, body);
      const payload = result.data as any;
      if (!result.success || payload?.success === false || payload?.error) throw new Error([...new Set([payload?.message, ...cltResponseReasons(payload), typeof payload?.error === 'string' ? payload.error : null].filter(value => typeof value === 'string' && value.trim()))].join(' · ') || `Consulta indisponível (${result.status}).`);
      const data = unwrap(payload);
      if (endpoint === '/clt-loan/v1/get-margin' && data?.can_continue === false) {
        const reasons = cltResponseReasons(payload);
        if (!reasons.length && typeof payload?.message === 'string' && !/sucesso/i.test(payload.message)) reasons.push(payload.message);
        if (reasons.length) return { ...data, restrictions: reasons };
      }
      return data;
    };
    const finantoCall = async (endpoint: string, body: unknown) => {
      const result = await FinantoService.request(prisma, tenantId, 'POST', endpoint, body);
      const payload = result.data as any;
      if (!result.success || payload?.messages?.length) throw new Error(cltResponseReasons(payload).join(' · ') || payload?.message || 'FINANTO não concluiu a consulta.');
      return payload;
    };
    const nossa = async () => {
      const config = await NossaFintechService.getConfig(prisma, tenantId);
      if (!config.enabled || !config.isConfigured) return;
      configured = true;
      if (product === 'FGTS') {
        await Promise.all(['qi', 'bmp', 'j17'].map(async service => {
          const institution = ({ qi: 'QI Tech', bmp: 'BMP', j17: 'J17' })[service]!;
          try {
            const balance = await nossaCall('POST', '/nossa/v1/balance', { cpf: input.cpf, service_type: service });
            if (balance?.status !== 'completed' || balance?.eligible !== true || !balance?.key) {
              rows.push({ provider: 'Nossa Fintech', institution, state: 'PENDING', message: balance?.message || 'Consulta de saldo pendente ou sem autorização/elegibilidade. Autorize a instituição no aplicativo FGTS e consulte novamente.' });
              return;
            }
            const body = { cpf: input.cpf, key: balance.key, number_of_installments: input.term, eligibility: input.eligibility, service_type: service };
            const tables = array(await nossaCall('POST', '/nossa/v2/simulation', body));
            const products = [...new Set(tables.map(table => Number(table.cod_produto)).filter(code => Number.isInteger(code) && code > 0))];
            if (!products.length) rows.push({ provider: 'Nossa Fintech', institution, state: 'PENDING', message: 'Nenhuma tabela FGTS elegível retornada.' });
            for (const code of products) {
              try {
                const result = await nossaCall('POST', '/nossa/v1/simulation', { ...body, cod_produto: code });
                const table = tables.find(item => String(item.cod_tabela) === String(result.cod_tabela)) || tables.find(item => Number(item.cod_produto) === code);
                const amount = positive(result.disbursed_issue_amount);
                rows.push({ provider: 'Nossa Fintech', institution, table: table?.name || `Produto ${code}`, state: amount ? 'OFFER' : 'PENDING', amount, term: positive(result.number_of_valid_installments), simulationId: result.key, data: result, message: amount ? undefined : 'A instituição não retornou valor liberado válido.' });
              } catch (error) { failure('Nossa Fintech', institution, error); }
            }
          } catch (error) { failure('Nossa Fintech', institution, error); }
        }));
        return;
      }
      const institutions = [...new Set(array(await nossaCall('GET', '/clt-loan/v1/banking-institutions')).filter(item => typeof item === 'string'))];
      if (!institutions.length) rows.push({ provider: 'Nossa Fintech', institution: 'CLT', state: 'PENDING', message: 'Nenhuma instituição CLT disponível para esta empresa.' });
      await Promise.all(institutions.map(async service => {
        try {
          const identity = { document_number: input.cpf, service_type: service };
          const authorization = await nossaCall('POST', action === 'AUTHORIZE' ? '/clt-loan/v1/request-authorization' : '/clt-loan/v1/check-authorization', action === 'AUTHORIZE' ? {
            ...identity, person_name: input.name, country_code: '55', area_code: input.phone.slice(0, 2), phone_number: input.phone.slice(2), notification_method: 'sms',
          } : identity);
          if (action === 'AUTHORIZE' || authorization?.status !== 'AUTHORIZED') {
            rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', link: safeLink(authorization?.authorization_link), message: authorization?.status === 'AUTHORIZED' ? 'Cliente autorizado. Clique em simular para consultar as condições.' : 'Aguardando autorização do cliente.' });
            return;
          }
          const employers = input.employerDocument ? [{ employer_cnpj: input.employerDocument }] : array(await nossaCall('POST', '/clt-loan/v1/check-employee-enrollment', identity));
          if (!employers.length) rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: 'Nenhum vínculo empregatício elegível.' });
          for (const employer of employers) {
            const cnpj = String(employer.employer_cnpj || '').replace(/\D/g, '');
            if (cnpj.length !== 14) continue;
            let margin: any;
            try {
              margin = await nossaCall('POST', '/clt-loan/v1/get-margin', { ...identity, employer_document: cnpj });
              if (!margin || typeof margin !== 'object' || Array.isArray(margin) || !['margin_key', 'available_balance', 'utilizable_balance', 'base_margin_value', 'can_continue'].some(key => Object.prototype.hasOwnProperty.call(margin, key))) {
                throw new Error('A Nossa Fintech retornou uma resposta incompatível com a consulta de margem CLT. A resposta não foi utilizada. Contate o suporte da integração.');
              }
              // Compare only identifiers actually returned by the API. Some documented
              // responses contain a shortened employer document, not a complete CNPJ.
              const requestedCpf = input.cpf.replace(/\D/g, '');
              const returnedCpf = String(margin?.document || '').replace(/\D/g, '');
              const returnedEmployer = String(margin?.employer?.document || '').replace(/\D/g, '');
              if (requestedCpf.length === 11 && returnedCpf && returnedCpf !== requestedCpf) {
                throw new Error('A Nossa Fintech retornou dados de um CPF diferente do consultado. A resposta não foi utilizada. Consulte novamente e, se persistir, contate o suporte da integração.');
              }
              if (returnedEmployer.length === 14 && returnedEmployer !== cnpj) {
                throw new Error('A Nossa Fintech retornou margem de outro vínculo empregatício. A resposta não foi utilizada. Consulte novamente e, se persistir, contate o suporte da integração.');
              }
            }
            catch (error) { failure('Nossa Fintech', service, error); continue; }
            if (action === 'REFRESH') {
              const restrictions = cltResponseReasons(margin);
              rows.push({ provider: 'Nossa Fintech', institution: service, state: 'DATA', message: margin?.can_continue === false ? restrictions.join(' · ') || 'Vínculo não elegível. O banco não informou o motivo da restrição.' : 'Dados do vínculo e margem atualizados.', data: { authorization, employment: employer, margin, restrictions } });
              continue;
            }
            if (margin?.can_continue === false || cltResponseReasons(margin).length > 0 || !margin?.margin_key) {
              rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: cltResponseReasons(margin).join(' · ') || `Sem margem elegível para o vínculo ${cnpj}. O banco não informou o motivo.` }); continue;
            }
            const tables = array(await nossaCall('GET', `/clt-loan/v1/list-rebates?service_type=${encodeURIComponent(service)}&margin_key=${encodeURIComponent(margin.margin_key)}`));
            const seen = new Set<string>();
            for (const table of tables) {
              const term = Number(table.number_of_installments);
              // The documented request identifies the condition by table code.
              const key = String(table.cod_tabela);
              if (!table.cod_tabela || (input.term && term !== input.term) || seen.has(key)) continue;
              seen.add(key);
              try {
                const result = await nossaCall('POST', '/clt-loan/v1/simulate-loan', { margin_key: margin.margin_key, simulation_type: input.mode, employer_document: cnpj, requested_amount: input.value, service_type: service, cod_tabela: String(table.cod_tabela) });
                const amount = positive(result.disbursement_amount);
                if (input.term && Number(result.num_periods) !== input.term) {
                  rows.push({ provider: 'Nossa Fintech', institution: service, table: table.name, state: 'PENDING', message: 'A API retornou outro prazo para esta tabela. Compare todos os prazos para visualizar essa condição.' }); continue;
                }
                rows.push({ provider: 'Nossa Fintech', institution: service, table: `${table.name || table.cod_tabela} · ${cnpj}`, state: amount ? 'OFFER' : 'PENDING', amount, installment: positive(result.schedule?.[0]?.payment), term: positive(result.num_periods), rate: positive(result.interest_rate) ? Number(result.interest_rate) * 100 : undefined, simulationId: result.simulation_key, data: result, message: amount ? undefined : 'A instituição não retornou valor liberado válido.' });
                await publishRows();
              } catch (error) { failure('Nossa Fintech', service, error); }
            }
            if (!seen.size) rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: 'Nenhuma tabela elegível para este vínculo e prazo.' });
          }
        } catch (error) { failure('Nossa Fintech', service, error); }
        finally { await publishRows(); }
      }));
    };
    const finanto = async () => {
      if (product !== 'CLT') return;
      const config = await FinantoService.getConfig(prisma, tenantId);
      if (!config.enabled || !config.isConfigured) return;
      configured = true;
      if (action === 'AUTHORIZE') {
        const term = await finantoCall('/v3/authorization-terms', { type: { code: 'auth_loan_private_payroll_term', name: 'Termo de Autorização para Empréstimo de Consignado Privado' }, identity: input.cpf, signer: { type: { code: 'person', name: 'Pessoa' }, name: input.name, identity: input.cpf, phone: input.phone } });
        rows.push({ provider: 'FINANTO', institution: 'CLT', state: 'PENDING', link: safeLink(term.url || term.signature?.url), message: 'Termo criado. O cliente deve assinar pelo canal da instituição antes de simular.', simulationId: term.id });
        return;
      }
      await Promise.all([{ code: 950002, name: 'QI Tech' }, { code: 950703, name: '321 Bank' }].map(async provider => {
        try {
          const simulation = await finantoCall(`/v3/loan-private-payroll-simulations/providers/${provider.code}`, { borrower: { name: input.name, identity: input.cpf, phone: input.phone }, step: { code: 1, name: 'Simulação de Proposta' }, originCode: 3 });
          if (action === 'REFRESH') {
            const restrictions = cltResponseReasons(simulation);
            const hasItems = array(simulation.items).length > 0;
            rows.push({ provider: 'FINANTO', institution: provider.name, state: 'DATA', simulationId: simulation.id, message: restrictions.join(' · ') || (simulation.eligible === false ? 'Cliente não elegível. O banco não informou o motivo da restrição.' : hasItems ? 'Dados e condições disponíveis atualizados.' : 'Nenhuma condição de crédito retornada. O banco não informou o motivo.'), data: { borrower: simulation.borrower, items: simulation.items, eligible: simulation.eligible, messages: simulation.messages, restrictions } });
            return;
          }
          if (simulation.eligible === false || cltResponseReasons(simulation).length > 0) {
            rows.push({ provider: 'FINANTO', institution: provider.name, state: 'PENDING', message: cltResponseReasons(simulation).join(' · ') || 'Cliente não elegível. O banco não informou o motivo da restrição.' });
            return;
          }
          const items = array(simulation.items).filter(item => (!input.term || Number(item.term) === input.term) && (!input.employerDocument || item.employerDocument === input.employerDocument));
          if (!items.length) rows.push({ provider: 'FINANTO', institution: provider.name, state: 'PENDING', message: 'Nenhuma condição elegível. Confira autorização, vínculo e prazo.' });
          for (const item of items) {
            try {
              const result = await finantoCall(`/v3/loan-private-payroll-simulations/${encodeURIComponent(simulation.id)}/calculation`, {
                type: input.mode === 'Payment' ? 1 : 2, identity: input.cpf, ruleId: item.rule?.id || item.ruleId, term: Number(item.term), rate: Number(item.rate),
                ...(input.mode === 'Payment' ? { installmentValue: input.value } : { disbursementValue: input.value }),
                registrationNumber: item.registrationNumber, employerDocument: item.employerDocument, employerName: item.employerName, hasInsurance: Boolean(item.hasInsurance), isInitialCalculation: true, selected: true,
              });
              const amount = positive(result.netValue);
              rows.push({ provider: 'FINANTO', institution: provider.name, table: item.rule?.name || item.ruleId, state: amount ? 'OFFER' : 'PENDING', amount, installment: positive(result.installmentValue), term: positive(result.term), rate: positive(result.rate), simulationId: simulation.id, data: result, message: amount ? undefined : 'A instituição não retornou valor líquido válido.' });
              await publishRows();
            } catch (error) { failure('FINANTO', provider.name, error); }
          }
        } catch (error) { failure('FINANTO', provider.name, error); }
        finally { await publishRows(); }
      }));
    };
    const facta = async () => {
      const config = await FactaBankService.getTenantConfig(prisma, tenantId);
      if (!config.isConfigured || !config.simulationEnabled) return;
      configured = true;
      rows.push(...await FactaSimulationService.product(prisma, tenantId, product, action, factaInput));
    };
    const bmg = async () => {
      if (product !== 'CLT' || action !== 'SIMULATE' || !input.bmgActorId) return;
      rows.push(...await BmgBankService.offers(prisma, tenantId, input.bmgActorId, { ...input, product }));
    };
    const v8 = async () => {
      if (product !== 'CLT') return false;
      const v8Rows = await V8CltSimulationService.run(prisma, tenantId, action, input);
      if (!v8Rows.length) return false;
      configured = true;
      rows.push(...v8Rows);
      return true;
    };
    const normalizeRows = () => {
      if (product !== 'CLT') return;
      for (const item of rows) {
        item.outcome = cltOutcome(item);
        const safe = cltPublicMessage(item.message);
        if (safe !== item.message) logger.warn({ tenantId, provider: item.provider, outcome: item.outcome, code: 'PROVIDER_MESSAGE_SANITIZED' }, '[CLT] Provider response redacted');
        item.message = safe;
      }
    };
    const publishRows = async () => { normalizeRows(); if (onRows) await onRows([...rows]); };
    await Promise.all([
      ...(!providers || providers.includes('nossa') ? [nossa().catch(error => failure('Nossa Fintech', product, error)).then(publishRows)] : []),
      ...(!providers || providers.includes('finanto') ? [finanto().catch(error => failure('FINANTO', product, error)).then(publishRows)] : []),
      ...(!providers || providers.includes('facta') ? [facta().catch(error => failure('FACTA', product, error)).then(publishRows)] : []),
      ...(!providers || providers.includes('bmg') ? [bmg().catch(error => failure('BMG', 'BMG', error)).then(publishRows)] : []),
      ...(!providers || providers.includes('v8') ? [v8().catch(() => { rows.push({ provider: 'V8 DIGITAL', institution: 'V8 · QI', state: 'ERROR', outcome: 'TECHNICAL_ERROR', message: 'Não foi possível consultar as conexões V8 desta empresa.' }); return true; }).then(async changed => { if (changed) await publishRows(); })] : []),
    ]);
    normalizeRows();
    return { rows, message: rows.length ? undefined : configured ? 'Nenhuma condição elegível retornada para os dados informados.' : 'Nenhuma integração habilitada e configurada para este produto.' };
  }
}
