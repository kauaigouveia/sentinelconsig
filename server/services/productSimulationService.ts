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
import { cltPaymentLimit } from './cltFinancialPolicy.js';
import { cltBankOnce, missingCltAuthorization } from './cltBankOperation.js';
import { isJourneyExecution } from './cltJourneyDeadline.js';

export type ProductSimulationInput = {
  cpf: string; name: string; phone: string; employerDocument?: string; factaRegistration?: string; v8ConsultId?: string; v8PromoterId?: string;
  term: number; value: number; mode: 'Payment' | 'Liquid'; eligibility: boolean;
  bmgActorId?: string;
  autoConditions?: boolean;
  v8BirthDate?: string; v8Gender?: 'male' | 'female'; v8Email?: string;
  journeyId?: string; automaticAuthorization?: boolean; observeOnly?: boolean; calculationKey?: string;
};
export type ProductSimulationRow = {
  provider: string; institution: string; table?: string; state: 'OFFER' | 'PENDING' | 'ERROR' | 'DATA';
  message?: string; link?: string; amount?: number; contractAmount?: number; installment?: number; term?: number; rate?: number;
  simulationId?: string; data?: unknown; cetMonthly?: number; cetAnnual?: number;
  outcome?: CltOutcome;
};
const unwrap = (value: any) => value?.data && !value.key && (value.success !== undefined || value.status === undefined) ? value.data : value;
const array = (value: any): any[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const positive = (value: unknown) => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
const safeLink = (value: unknown) => typeof value === 'string' && /^https:\/\//i.test(value) ? value : undefined;

export class ProductSimulationService {
  static async run(prisma: PrismaClient, tenantId: string, product: 'FGTS' | 'CLT', action: 'SIMULATE' | 'AUTHORIZE' | 'REFRESH' | 'CREATE_CONSULT', input: ProductSimulationInput, onRows?: (rows: ProductSimulationRow[]) => Promise<void>, providers?: readonly string[]) {
    if(product==='CLT'&&!isJourneyExecution()) input={...input,journeyId:undefined,automaticAuthorization:false,observeOnly:false,calculationKey:undefined};
    if (action === 'CREATE_CONSULT') return { rows: product === 'CLT' && providers?.length === 1 && providers[0] === 'v8' ? await V8CltSimulationService.run(prisma, tenantId, action, input) : [], message: undefined };
    const factaInput = input;
    // FACTA can return an eight-digit employer registration. Other providers
    // require a full CNPJ, so discover their employment records automatically.
    if (product === 'CLT' && input.employerDocument?.length === 8) input = { ...input, employerDocument: undefined };
    const rows: ProductSimulationRow[] = [];
    let configured = false;
    const failure = (provider: string, institution: string, error: any) => {
      const detail = error?.writeUncertain?'Resultado incerto após envio à instituição. Atualize o estado antes de outra operação; nenhuma solicitação será repetida automaticamente.':/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(error?.message||'')?'Falha de comunicação com a instituição. Atualize a consulta; as demais instituições continuam disponíveis.':error?.message || 'Não foi possível consultar esta instituição.';
      if(product==='CLT'&&missingCltAuthorization(detail)){rows.push({provider,institution,state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',data:{authorization:{status:'MISSING'},writeUncertain:!!error?.writeUncertain,trackingUnsupported:provider==='FINANTO'},message:detail});return;}
      const j17Timeout = provider === 'Nossa Fintech' && institution === 'J17' && /curl error 28|connection timed out|timeout|timedout/i.test(detail);
      rows.push({ provider, institution, state: 'ERROR', data: error?.writeUncertain?{writeUncertain:true}:undefined, message: j17Timeout
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
      if (!result.success || payload?.messages?.length && typeof payload?.eligible !== 'boolean') throw new Error(cltResponseReasons(payload).join(' · ') || payload?.message || 'FINANTO não concluiu a consulta.');
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
          const requestAuthorization = async (confirmedMissing=false) => {
            const send = () => nossaCall('POST', '/clt-loan/v1/request-authorization', { ...identity, person_name: input.name, country_code: '55', area_code: input.phone.slice(0, 2), phone_number: input.phone.slice(2), notification_method: 'sms' });
            return input.journeyId ? cltBankOnce(prisma, tenantId, 'nossa', ['AUTHORIZE', input.cpf, service], send,{root:input.journeyId,confirmedMissing}) : send();
          };
          let authorization: any;
          if (action === 'AUTHORIZE') authorization = await requestAuthorization();
          else try { authorization = await nossaCall('POST', '/clt-loan/v1/check-authorization', identity); }
          catch (error) { if (!missingCltAuthorization(error instanceof Error ? error.message : '')) throw error; authorization = { status: 'NOT_FOUND' }; }
          const missing = ['NOT_FOUND','NOT_REQUESTED','NONE'].includes(authorization?.status);
          let requested = action === 'AUTHORIZE';
          if (missing && input.automaticAuthorization && !input.observeOnly) { authorization = await requestAuthorization(true); requested = true; }
          if (requested || authorization?.status !== 'AUTHORIZED') {
            const rejected = ['REJECTED','DENIED'].includes(authorization?.status);
            rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', outcome: rejected ? 'INELIGIBLE' : 'AUTHORIZATION_REQUIRED', link: safeLink(authorization?.authorization_link), data: { authorization: { status: rejected ? 'REJECTED' : requested ? 'REQUESTED' : 'PENDING', mechanism: 'BANK_CHANNEL' } }, message: rejected ? 'Autorização recusada pelo cliente ou instituição.' : requested ? authorization?.operationCached?'Solicitação anterior já registrada. Nenhum novo envio foi realizado; aguardando aceite do cliente.':'Solicitação enviada. Aguardando aceite do cliente no canal da instituição.' : 'Aguardando autorização do cliente.' });
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
              rows.push({ provider: 'Nossa Fintech', institution: service, state: margin?.can_continue===false?'PENDING':'DATA', outcome:margin?.can_continue===false?'INELIGIBLE':undefined, message: margin?.can_continue === false ? restrictions.join(' · ') || 'Vínculo não elegível. O banco não informou o motivo da restrição.' : 'Dados do vínculo e margem atualizados.', data: { authorization, employment: employer, margin, restrictions } });
              continue;
            }
            if (margin?.can_continue === false || cltResponseReasons(margin).length > 0 || !margin?.margin_key) {
              rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: cltResponseReasons(margin).join(' · ') || `Sem margem elegível para o vínculo ${cnpj}. O banco não informou o motivo.` }); continue;
            }
            const tables = array(await nossaCall('GET', `/clt-loan/v1/list-rebates?service_type=${encodeURIComponent(service)}&margin_key=${encodeURIComponent(margin.margin_key)}`));
            const requested = input.autoConditions ? cltPaymentLimit(margin.available_balance, margin.utilizable_balance) : input.value;
            if (!requested) { rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', outcome: 'MISSING_DATA', message: 'A instituição não retornou limite de parcela válido. Nenhuma simulação foi enviada.' }); continue; }
            const seen = new Set<string>();
            for (const table of tables) {
              const term = Number(table.number_of_installments);
              // The documented request identifies the condition by table code.
              const key = String(table.cod_tabela);
              if (!table.cod_tabela || (input.term && term !== input.term) || seen.has(key)) continue;
              seen.add(key);
              try {
                const calculate = () => nossaCall('POST', '/clt-loan/v1/simulate-loan', { margin_key: margin.margin_key, simulation_type: input.autoConditions ? 'Payment' : input.mode, employer_document: cnpj, requested_amount: requested, service_type: service, cod_tabela: String(table.cod_tabela) });
                const result = input.journeyId ? await cltBankOnce(prisma,tenantId,'nossa',['CALCULATE',input.journeyId,input.bmgActorId,input.cpf,service,cnpj,String(table.cod_tabela),requested,input.mode],calculate) : await calculate();
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
      let pendingTerm: Promise<any> | undefined;
      const ensureTerm = (confirmedMissing=false) => pendingTerm ||= (async()=>{const createTerm=()=>finantoCall('/v3/authorization-terms',{type:{code:'auth_loan_private_payroll_term',name:'Termo de Autorização para Empréstimo de Consignado Privado'},identity:input.cpf,signer:{type:{code:'person',name:'Pessoa'},name:input.name,identity:input.cpf,phone:input.phone}});return input.journeyId?cltBankOnce(prisma,tenantId,'finanto',['AUTHORIZE',input.cpf],createTerm,{root:input.journeyId,confirmedMissing}):createTerm();})();
      if(action==='AUTHORIZE'){const term=await ensureTerm();rows.push({provider:'FINANTO',institution:'CLT',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',link:safeLink(term.url||term.signature?.url),simulationId:term.id,data:{authorization:{status:'REQUESTED'},trackingUnsupported:true},message:'Solicitação enviada. O cliente deve assinar o termo no canal da instituição.'});return;}
      if(input.observeOnly){rows.push({provider:'FINANTO',institution:'CLT',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',data:{trackingUnsupported:true},message:'FINANTO: acompanhamento sem novo POST ainda depende de endpoint de leitura ou webhook de autorização validado. Nenhuma solicitação foi repetida.'});return;}
      await Promise.all([{ code: 950002, name: 'QI Tech' }, { code: 950703, name: '321 Bank' }].map(async provider => {
        try {
          const create = () => finantoCall(`/v3/loan-private-payroll-simulations/providers/${provider.code}`, { borrower: { name: input.name, identity: input.cpf, phone: input.phone }, step: { code: 1, name: 'Simulação de Proposta' }, originCode: 3 });
          const simulation = input.journeyId ? await cltBankOnce(prisma, tenantId, 'finanto', ['CONSULT',input.journeyId,input.bmgActorId,input.cpf,provider.code],create) : await create();
          if (action === 'REFRESH') {
            const restrictions = cltResponseReasons(simulation);
            const hasItems = array(simulation.items).length > 0;
            rows.push({ provider: 'FINANTO', institution: provider.name, state: simulation.eligible===false?'PENDING':'DATA', outcome:simulation.eligible===false?'INELIGIBLE':undefined, simulationId: simulation.id, message: restrictions.join(' · ') || (simulation.eligible === false ? 'Cliente não elegível. O banco não informou o motivo da restrição.' : hasItems ? 'Dados e condições disponíveis atualizados.' : 'Nenhuma condição de crédito retornada. O banco não informou o motivo.'), data: { borrower: simulation.borrower, items: simulation.items, eligible: simulation.eligible, messages: simulation.messages, restrictions } });
            return;
          }
          if (simulation.eligible === false || cltResponseReasons(simulation).length > 0) {
            rows.push({ provider: 'FINANTO', institution: provider.name, state: 'PENDING', message: cltResponseReasons(simulation).join(' · ') || 'Cliente não elegível. O banco não informou o motivo da restrição.' });
            return;
          }
          const items = array(simulation.items).filter(item => (!input.term || Number(item.term) === input.term) && (!input.employerDocument || item.employerDocument === input.employerDocument));
          if (!items.length) rows.push({ provider: 'FINANTO', institution: provider.name, state: 'PENDING', message: 'Nenhuma condição elegível. Confira autorização, vínculo e prazo.' });
          for (const item of items) {
            const requested = input.autoConditions ? cltPaymentLimit(item.maxInstallmentValue) : input.value;
            if (!requested || input.autoConditions && (!Number.isFinite(Number(item.rate)) || Number(item.rate) <= 0 || !Number.isInteger(Number(item.term)) || Number(item.term) <= 0 || !(item.rule?.id || item.ruleId))) {
              rows.push({ provider: 'FINANTO', institution: provider.name, state: 'PENDING', outcome: 'MISSING_DATA', message: 'A FINANTO não retornou parcela máxima, taxa, regra e prazo válidos. Nenhum cálculo foi enviado.' }); continue;
            }
            try {
              const result = await finantoCall(`/v3/loan-private-payroll-simulations/${encodeURIComponent(simulation.id)}/calculation`, {
                type: input.autoConditions || input.mode === 'Payment' ? 1 : 2, identity: input.cpf, ruleId: item.rule?.id || item.ruleId, term: Number(item.term), rate: Number(item.rate),
                ...(input.autoConditions || input.mode === 'Payment' ? { installmentValue: requested } : { disbursementValue: requested }),
                registrationNumber: item.registrationNumber, employerDocument: item.employerDocument, employerName: item.employerName, hasInsurance: Boolean(item.hasInsurance), isInitialCalculation: true, selected: true,
              });
              const amount = positive(result.netValue);
              rows.push({ provider: 'FINANTO', institution: provider.name, table: item.rule?.name || item.ruleId, state: amount ? 'OFFER' : 'PENDING', amount, installment: positive(result.installmentValue), term: positive(result.term), rate: positive(result.rate), simulationId: simulation.id, data: result, message: amount ? undefined : 'A instituição não retornou valor líquido válido.' });
              await publishRows();
            } catch (error) { if(input.automaticAuthorization&&!input.observeOnly&&missingCltAuthorization(error instanceof Error?error.message:'')){try{const term=await ensureTerm(true);rows.push({provider:'FINANTO',institution:provider.name,state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',link:safeLink(term.url||term.signature?.url),data:{authorization:{status:'REQUESTED'},trackingUnsupported:true},message:'Solicitação enviada. Aguardando assinatura do cliente; acompanhamento por leitura ainda depende de contrato confirmado.'});}catch(requestError){failure('FINANTO',provider.name,requestError);}}else failure('FINANTO', provider.name, error); }
          }
        } catch (error) { if(input.automaticAuthorization&&!input.observeOnly&&missingCltAuthorization(error instanceof Error?error.message:'')){try{const term=await ensureTerm(true);rows.push({provider:'FINANTO',institution:provider.name,state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',link:safeLink(term.url||term.signature?.url),data:{authorization:{status:'REQUESTED'},trackingUnsupported:true},message:'Solicitação enviada. Aguardando assinatura do cliente; acompanhamento por leitura ainda depende de contrato confirmado.'});}catch(requestError){failure('FINANTO',provider.name,requestError);}}else failure('FINANTO', provider.name, error); }
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
      if (product !== 'CLT' || !input.bmgActorId) return;
      if(action==='REFRESH') {const authorization=await BmgBankService.cltAuthorization(prisma,tenantId,input.bmgActorId,input,!!input.automaticAuthorization&&!input.observeOnly);rows.push({provider:'BMG',institution:'BMG',state:authorization.ready?'DATA':'PENDING',outcome:authorization.status==='APPROVED'&&!authorization.ready?'INELIGIBLE':authorization.ready?'PENDING':'AUTHORIZATION_REQUIRED',data:{authorization},message:authorization.ready?'Autorização aprovada. Elegibilidade confirmada.':authorization.status==='APPROVED'?authorization.reason||'Cliente não elegível no BMG.':authorization.status==='WAITING_OTP'?'Solicitação enviada. Aguardando SMS/OTP do cliente.':'Autorização SMS ausente ou expirada. Use a recuperação no cartão BMG.'});return;}
      if(action!=='SIMULATE')return;
      rows.push(...await BmgBankService.offers(prisma, tenantId, input.bmgActorId, { ...input, product }));
    };
    const v8 = async () => {
      if (product !== 'CLT') return false;
      const v8Rows = await V8CltSimulationService.run(prisma, tenantId, action, input);
      if(action==='REFRESH'&&input.automaticAuthorization&&!input.observeOnly&&v8Rows.some(r=>r.outcome==='AUTHORIZATION_REQUIRED'||(r.data as any)?.v8?.nextAction==='CREATE_CONSULT')&&!v8Rows.some(r=>(r.data as any)?.v8?.consultId)) {
        rows.push(...await V8CltSimulationService.run(prisma,tenantId,'CREATE_CONSULT',input));configured=true;return true;
      }
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
