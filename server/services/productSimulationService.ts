import {nossaAuthorization,rememberNossaAuthorization} from './nossaCltAuthorization.js';
import {canonicalNossaInstitution} from '../../src/lib/cltInstitution.js';
import {currentIntegrationPromoter} from './bankPromoterConfig.js';
import {calculateVctexConditions,observeVctexConditions} from './vctexCltCalculation.js';
import type { PrismaClient } from '@prisma/client';
import { NossaFintechService } from './nossaFintechService';
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
  cpf: string; name: string; phone: string; employerDocument?: string; factaRegistration?: string; v8ConsultId?: string; v8PromoterId?: string; v8ConfigId?: string;
  term: number; value: number; mode: 'Payment' | 'Liquid'; eligibility: boolean;
  bmgActorId?: string;
  autoConditions?: boolean;
  v8BirthDate?: string; v8Gender?: 'male' | 'female'; v8Email?: string;
  journeyId?: string; automaticAuthorization?: boolean; observeOnly?: boolean; calculationKey?: string;
};
export type ProductSimulationRow = {
  origin?:{providerId:string;subInstitutionId?:string;connectionId?:string;consultationId?:string;executionId?:string};
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
    const failure = (provider: string, institution: string, error: any,origin?:ProductSimulationRow['origin']) => {
      if(provider==='FACTA'&&product==='CLT'){rows.push(FactaSimulationService.failure(error));return;}
      if(provider==='BMG'&&product==='CLT'&&action==='REFRESH'&&error?.writeUncertain){rows.push({provider:'BMG',institution:'BMG',state:'ERROR',outcome:'TECHNICAL_ERROR',message:'Envio SMS BMG incerto. Atualize a autorização; nenhum novo SMS será enviado automaticamente.',data:{writeUncertain:true,authorization:{status:'UNKNOWN',source:'BMG_SMS_REQUEST'}}});return;}
      const detail = error?.writeUncertain?'Resultado incerto após envio à instituição. Atualize o estado antes de outra operação; nenhuma solicitação será repetida automaticamente.':/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(error?.message||'')?'Falha de comunicação com a instituição. Atualize a consulta; as demais instituições continuam disponíveis.':error?.message || 'Não foi possível consultar esta instituição.';
      if(product==='CLT'&&missingCltAuthorization(detail)){rows.push({provider,institution,origin,state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',data:{authorization:{status:'MISSING'},writeUncertain:!!error?.writeUncertain,trackingUnsupported:provider==='FINANTO'},message:detail});return;}
      const j17Timeout = provider === 'Nossa Fintech' && institution === 'J17' && /curl error 28|connection timed out|timeout|timedout/i.test(detail);
      rows.push({ provider, institution,origin, state: 'ERROR', data: error?.writeUncertain?{writeUncertain:true}:undefined, message: j17Timeout
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
      const catalogue=array(await nossaCall('GET','/clt-loan/v1/banking-institutions')).filter((item):item is string=>typeof item==='string');
      const uniqueInstitutions=new Map<string,string>();for(const service of catalogue){const id=canonicalNossaInstitution(service)||'service:'+service;if(!uniqueInstitutions.has(id))uniqueInstitutions.set(id,service);}
      const institutions=[...uniqueInstitutions.values()];
      if (!institutions.length) rows.push({ provider: 'Nossa Fintech', institution: 'CLT', state: 'PENDING', message: 'Nenhuma instituição CLT disponível para esta empresa.' });
      await Promise.all(institutions.map(async service => {
        const origin={providerId:'nossa',subInstitutionId:canonicalNossaInstitution(service)||'service:'+service,connectionId:currentIntegrationPromoter()};
        const addRows=(...values:ProductSimulationRow[])=>rows.push(...values.map(row=>({...row,origin})));
        try {
          const identity = { document_number: input.cpf, service_type: service };
          const requestAuthorization = async (confirmedMissing=false) => {
            const send = () => nossaCall('POST', '/clt-loan/v1/request-authorization', { ...identity, person_name: input.name, country_code: '55', area_code: input.phone.slice(0, 2), phone_number: input.phone.slice(2), notification_method: 'sms' });
            // Preserve historical reservation keys: changing them would bypass prior UNKNOWN writes.
            return input.journeyId ? cltBankOnce(prisma, tenantId, 'nossa', ['AUTHORIZE', input.cpf, service], send,{root:input.journeyId,confirmedMissing}) : send();
          };
          // Always re-check official state, including explicit AUTHORIZE. Never replace a valid consent.
          let rawAuthorization: any;
          try { rawAuthorization = await nossaCall('POST', '/clt-loan/v1/check-authorization', identity); }
          catch (error) {
            if(!missingCltAuthorization(error instanceof Error?error.message:'')){
              addRows({provider:'Nossa Fintech',institution:service,state:'ERROR',outcome:'TECHNICAL_ERROR',data:{authorization:{status:'UNCONFIRMED',source:'API',observedAt:new Date().toISOString()}},message:'Estado da autorização não confirmado pela API. Nenhum novo link foi solicitado.'});return;
            }
            rawAuthorization={status:'NOT_FOUND'};
          }
          let authorization=await rememberNossaAuthorization(prisma,tenantId,input.bmgActorId,identity,nossaAuthorization(rawAuthorization,identity));
          const missing=['NOT_FOUND','NOT_REQUESTED','NONE','EXPIRED'].includes(authorization.status);
          let requested=false;
          if(missing && !input.observeOnly && (input.automaticAuthorization||action==='AUTHORIZE')) {
            const requestedResult=await requestAuthorization(true);
            authorization=await rememberNossaAuthorization(prisma,tenantId,input.bmgActorId,identity,{...nossaAuthorization(requestedResult,identity),status:'REQUESTED'},'REQUEST');requested=true;
          }
          if(authorization.status!=='AUTHORIZED'){
            const rejected=['REJECTED','DENIED'].includes(authorization.status);
            addRows({provider:'Nossa Fintech',institution:service,state:'PENDING',outcome:rejected?'INELIGIBLE':'AUTHORIZATION_REQUIRED',link:authorization.authorization_link,
              data:{authorization:{status:authorization.status,mechanism:'BANK_CHANNEL',source:authorization.source,observedAt:authorization.observedAt,previousStatus:authorization.previousStatus,authorizationId:authorization.authorizationId}},
              message:rejected?'Autorização recusada pelo cliente ou instituição.':authorization.status==='EXPIRED'?'Autorização expirada. Uma nova solicitação exige ação explícita.':authorization.status==='UNCONFIRMED'?'Estado não confirmado. A API não retornou um estado de autorização reconhecido; nenhum novo link foi solicitado.':requested?'Solicitação registrada. Aguardando aceite do cliente no canal da instituição.':'Aguardando autorização do cliente.'});return;
          }
          const employers = input.employerDocument ? [{ employer_cnpj: input.employerDocument }] : array(await nossaCall('POST', '/clt-loan/v1/check-employee-enrollment', identity));
          if (!employers.length) addRows({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: 'Nenhum vínculo empregatício elegível.' });
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
            catch (error) { failure('Nossa Fintech', service, error,origin); continue; }
            if (action !== 'SIMULATE') {
              const restrictions = cltResponseReasons(margin);
              addRows({ provider: 'Nossa Fintech', institution: service, state: margin?.can_continue===false?'PENDING':'DATA', outcome:margin?.can_continue===false?'INELIGIBLE':undefined, message: margin?.can_continue === false ? restrictions.join(' · ') || 'Vínculo não elegível. O banco não informou o motivo da restrição.' : 'Dados do vínculo e margem atualizados.', data: { authorization, employment: employer, margin, restrictions } });
              continue;
            }
            if (margin?.can_continue === false || cltResponseReasons(margin).length > 0 || !margin?.margin_key) {
              addRows({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: cltResponseReasons(margin).join(' · ') || `Sem margem elegível para o vínculo ${cnpj}. O banco não informou o motivo.` }); continue;
            }
            const tables = array(await nossaCall('GET', `/clt-loan/v1/list-rebates?service_type=${encodeURIComponent(service)}&margin_key=${encodeURIComponent(margin.margin_key)}`));
            const requested = input.autoConditions ? cltPaymentLimit(margin.available_balance, margin.utilizable_balance) : input.value;
            if(input.mode==='Payment'&&requested>(cltPaymentLimit(margin.available_balance,margin.utilizable_balance)||0)){addRows({provider:'Nossa Fintech',institution:service,state:'PENDING',outcome:'INELIGIBLE',message:'A parcela solicitada supera a margem oficial deste vínculo.'});continue;}
            if (!requested) { addRows({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', outcome: 'MISSING_DATA', message: 'A instituição não retornou limite de parcela válido. Nenhuma simulação foi enviada.' }); continue; }
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
                  addRows({ provider: 'Nossa Fintech', institution: service, table: table.name, state: 'PENDING', message: 'A API retornou outro prazo para esta tabela. Compare todos os prazos para visualizar essa condição.' }); continue;
                }
                if((input.autoConditions||input.mode==='Payment')&&(positive(result.schedule?.[0]?.payment)||0)>requested+0.005)throw Error('A instituição retornou parcela superior ao limite solicitado. A oferta não foi utilizada.');
                addRows({ provider: 'Nossa Fintech', institution: service, table: `${table.name || table.cod_tabela} · ${cnpj}`, state: amount ? 'OFFER' : 'PENDING', amount, installment: positive(result.schedule?.[0]?.payment), term: positive(result.num_periods), rate: positive(result.interest_rate) ? Number(result.interest_rate) * 100 : undefined, simulationId: result.simulation_key, data: result, message: amount ? undefined : 'A instituição não retornou valor liberado válido.' });
                await publishRows();
              } catch (error) { failure('Nossa Fintech', service, error,origin); }
            }
            if (!seen.size) addRows({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: 'Nenhuma tabela elegível para este vínculo e prazo.' });
          }
        } catch (error) { failure('Nossa Fintech', service, error,origin); }
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
      if(input.value>0){rows.push({provider:'BMG',institution:'BMG',state:'PENDING',outcome:'UNSUPPORTED',message:'BMG: o contrato CLT implementado consulta ofertas sem parâmetro de parcela ou valor. O banco não receberá um parâmetro inventado; use o fluxo específico.'});return;}
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
      ...(product==='CLT'&&action==='REFRESH'&&providers?.includes('vctex')?[observeVctexConditions(prisma,tenantId,input).then(found=>{configured=true;rows.push(...found);}).catch(error=>failure('VCTEX DIGITAL','VCTEX DIGITAL',error)).then(publishRows)]:[]),
      ...(product==='CLT'&&action==='SIMULATE'&&providers?.includes('vctex')?[calculateVctexConditions(prisma,tenantId,input).then(found=>{configured=true;rows.push(...found);}).catch(error=>failure('VCTEX DIGITAL','VCTEX DIGITAL',error)).then(publishRows)]:[]),
      ...(!providers || providers.includes('nossa') ? [nossa().catch(error => failure('Nossa Fintech', product, error)).then(publishRows)] : []),
      ...(!providers || providers.includes('facta') ? [facta().catch(error => failure('FACTA', product==='CLT'?'FACTA':product, error)).then(publishRows)] : []),
      ...(!providers || providers.includes('bmg') ? [bmg().catch(error => failure('BMG', 'BMG', error)).then(publishRows)] : []),
      ...(!providers || providers.includes('v8') ? [v8().catch(() => { rows.push({ provider: 'V8 DIGITAL', institution: 'V8 · QI', state: 'ERROR', outcome: 'TECHNICAL_ERROR', message: 'Não foi possível consultar as conexões V8 desta empresa.' }); return true; }).then(async changed => { if (changed) await publishRows(); })] : []),
    ]);
    normalizeRows();
    return { rows, message: rows.length ? undefined : configured ? 'Nenhuma condição elegível retornada para os dados informados.' : 'Nenhuma integração habilitada e configurada para este produto.' };
  }
}
