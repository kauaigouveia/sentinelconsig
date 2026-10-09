import type { PrismaClient } from '@prisma/client';
import { NossaFintechService } from './nossaFintechService';
import { FinantoService } from './finantoService';

export type ProductSimulationInput = {
  cpf: string; name: string; phone: string; employerDocument?: string;
  term: number; value: number; mode: 'Payment' | 'Liquid'; eligibility: boolean;
};
export type ProductSimulationRow = {
  provider: string; institution: string; table?: string; state: 'OFFER' | 'PENDING' | 'ERROR';
  message?: string; link?: string; amount?: number; installment?: number; term?: number; rate?: number;
  simulationId?: string; data?: unknown;
};
const unwrap = (value: any) => value?.data && !value.key && (value.success !== undefined || value.status === undefined) ? value.data : value;
const array = (value: any): any[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const positive = (value: unknown) => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
const safeLink = (value: unknown) => typeof value === 'string' && /^https:\/\//i.test(value) ? value : undefined;

export class ProductSimulationService {
  static async run(prisma: PrismaClient, tenantId: string, product: 'FGTS' | 'CLT', action: 'SIMULATE' | 'AUTHORIZE', input: ProductSimulationInput) {
    const rows: ProductSimulationRow[] = [];
    let configured = false;
    const failure = (provider: string, institution: string, error: any) => rows.push({ provider, institution, state: 'ERROR', message: error?.message || 'Não foi possível consultar esta instituição.' });
    const nossaCall = async (method: string, endpoint: string, body?: unknown) => {
      const result = await NossaFintechService.request(prisma, tenantId, method, endpoint, body);
      const payload = result.data as any;
      if (!result.success || payload?.success === false || payload?.error) throw new Error(payload?.message || (typeof payload?.error === 'string' ? payload.error : null) || `Consulta indisponível (${result.status}).`);
      return unwrap(payload);
    };
    const finantoCall = async (endpoint: string, body: unknown) => {
      const result = await FinantoService.request(prisma, tenantId, 'POST', endpoint, body);
      const payload = result.data as any;
      if (!result.success || payload?.messages?.length) throw new Error(payload?.messages?.map((item: any) => item.text).join(' ') || 'FINANTO não concluiu a consulta.');
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
            const margin = await nossaCall('POST', '/clt-loan/v1/get-margin', { ...identity, employer_document: cnpj });
            if (margin?.can_continue === false || !margin?.margin_key) {
              rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: `Sem margem elegível para o vínculo ${cnpj}.` }); continue;
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
              } catch (error) { failure('Nossa Fintech', service, error); }
            }
            if (!seen.size) rows.push({ provider: 'Nossa Fintech', institution: service, state: 'PENDING', message: 'Nenhuma tabela elegível para este vínculo e prazo.' });
          }
        } catch (error) { failure('Nossa Fintech', service, error); }
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
            } catch (error) { failure('FINANTO', provider.name, error); }
          }
        } catch (error) { failure('FINANTO', provider.name, error); }
      }));
    };
    await Promise.all([nossa().catch(error => failure('Nossa Fintech', product, error)), finanto().catch(error => failure('FINANTO', product, error))]);
    return { rows, message: rows.length ? undefined : configured ? 'Nenhuma condição elegível retornada para os dados informados.' : 'Nenhuma integração habilitada e configurada para este produto.' };
  }
}
