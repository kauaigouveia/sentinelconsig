import type { PrismaClient } from '@prisma/client';
import { FactaSimulationService, type FactaInssInput } from './factaSimulationService.js';
import { FactaBankService } from './factaBankService.js';
import { C6SimulationService } from './c6SimulationService.js';
import { decodeDaycoval } from './daycovalWorkbook.js';
import { SPREADSHEET_MODELS, calculatePortRefin, type SpreadsheetBank } from './portRefinWorkbooks.js';
import { BmgBankService } from './bmgBankService.js';
import { ProductSimulationService } from './productSimulationService.js';
import { NossaFintechService } from './nossaFintechService.js';
import { FinantoService } from './finantoService.js';
import { partnerHappySimulation } from './partnerHappySimulation.js';
import { nossaFintechTableRate, finantoAgeError, finantoBenefitError, finantoInstallmentError, finantoRuleItem, finantoRefinancingChoices, finantoCashOut, finantoCashOutError, finantoTableLabel } from '../../src/lib/inssEligibility.js';
import { getNossaFintechNovoOptions, getNossaFintechTroco } from '../../src/lib/nossaFintech.js';

const items = (value: any): any[] => Array.isArray(value?.items) ? value.items : Array.isArray(value?.data?.items) ? value.data.items : [];
export class PartnerSimulationService {
  static async run(prisma: PrismaClient, tenantId: string, input: any, action: 'SIMULATE' | 'REFRESH' | 'AUTHORIZE', onRows?: (rows: any[]) => Promise<void>) {
    if (input.product !== 'INSS') {
      let productRows: any[] = [], happyRows: any[] = [];
      const [result] = await Promise.all([
        ProductSimulationService.run(prisma, tenantId, input.product, action, input, async rows => { productRows = rows; if (onRows) await onRows([...productRows, ...happyRows]); }),
        partnerHappySimulation(prisma, tenantId, input, action).catch(error => [{ provider: 'HAPPY', institution: 'HAPPY / BYX', state: 'ERROR', message: error.message }]).then(async rows => { happyRows = rows; if (onRows) await onRows([...productRows, ...happyRows]); }),
      ]);
      result.rows.push(...happyRows);
      if (result.rows.some(row => row.state === 'OFFER')) result.message = '';
      return result;
    }
    if (action !== 'SIMULATE') return { rows: await partnerHappySimulation(prisma, tenantId, input, action), message: '' };
    const offers: any[] = [], notes: string[] = [];
    const collect = async (provider: string, run: () => Promise<void>) => {
      try { await run(); } catch (error: any) { notes.push(`${provider}: ${error.message}`); }
      if (onRows) await onRows([...offers]);
    };
    await Promise.all([
      collect('HAPPY', async () => { offers.push(...await partnerHappySimulation(prisma, tenantId, input, action)); }),
      collect('FACTA', async () => {
        const config = await FactaBankService.getTenantConfig(prisma, tenantId);
        if (!config.isConfigured || !config.simulationEnabled) return;
        const result = await FactaSimulationService.inss(prisma, tenantId, { ...input, mode: input.mode === 'Payment' ? 'INSTALLMENT' : 'AMOUNT' } as FactaInssInput);
        offers.push(...result.offers.map(offer => ({ ...offer, provider: 'FACTA', institution: 'FACTA', state: offer.amount ? 'OFFER' : 'PENDING' })));
        if (result.message) notes.push(`FACTA: ${result.message}`);
      }),
      collect('C6', async () => { if (['PORT','PORT_REFIN'].includes(input.operation)) return; offers.push(...await C6SimulationService.inss(prisma, tenantId, input)); }),
      ...(Object.keys(SPREADSHEET_MODELS) as SpreadsheetBank[]).map(bank => collect(SPREADSHEET_MODELS[bank].label, async () => {
        if (input.operation !== 'PORT_REFIN') return;
        const config = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: SPREADSHEET_MODELS[bank].key } } });
        if (!config) return;
        const book = decodeDaycoval(config.configValue); if (book.enabled === false) return;
        if (bank === 'PARANA') { notes.push('Paraná: simule em PORT + REFIN · Planilhas para informar a quantidade de contratos e o enquadramento de margem.'); return; }
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const result = calculatePortRefin(bank, book, { birthDate: input.birthDate, benefitType: input.benefitType, simulationDate: date, term: bank === 'C6' ? 108 : input.term, refinanceRate: input.rate, contracts: [{ balance: input.debt, installment: input.originalInstallment, remaining: input.remainingTerm }], additionalMargin: Math.max(0, Number(input.value) - Number(input.originalInstallment)) });
        offers.push(...result.offers.filter(offer => offer.eligible && offer.amount > 0).map(offer => ({ ...offer, name: offer.tableName, code: offer.tableId, institution: bank, state: 'OFFER', spreadsheetVersion: result.version, spreadsheet: { bank, ...result } })));
      })),
      collect('BMG', async () => { if (input.bmgActorId) offers.push(...await BmgBankService.offers(prisma, tenantId, input.bmgActorId, input)); }),
      collect('Nossa Fintech', async () => {
        const config = await NossaFintechService.getConfig(prisma, tenantId);
        if (!config.enabled || !config.isConfigured) return;
        if (!['NEW', 'PORT_REFIN'].includes(input.operation)) { notes.push('Nossa Fintech: modalidade disponível neste fluxo somente para Novo e Portabilidade + Refin.'); return; }
        const result = input.operation === 'NEW'
          ? await NossaFintechService.simulateInssNovoAcrossTables(prisma, tenantId, { numberOfInstallments: input.term, mode: input.mode === 'Payment' ? 'INSTALLMENT' : 'AMOUNT', value: input.value, legalRepresentative: !!input.legalRepresentative, birthDate: input.birthDate, benefitType: input.benefitType })
          : await NossaFintechService.simulatePortabilityAcrossTables(prisma, tenantId, { numberOfInstallments: input.term, lastDueBalance: input.debt, installmentFaceValue: input.originalInstallment, openedInstallmentNumber: input.remainingTerm, legalRepresentative: !!input.legalRepresentative, birthDate: input.birthDate, benefitType: input.benefitType, refinancingRate: input.rate });
        if (!result.success) throw new Error((result.data as any)?.message || 'Não foi possível consultar as condições.');
        const data = result.data as any;
        if (data.message) notes.push(`Nossa Fintech: ${data.message}`);
        for (const row of data.results || []) {
          if (!row.success) continue;
          const options = input.operation === 'NEW' ? getNossaFintechNovoOptions(row.data) : [null];
          for (const option of options) {
            const amount = option ? Number(option.disbursed_issue_amount) : getNossaFintechTroco(row.data);
            if (!(Number(amount) > 0)) continue;
            offers.push({ provider: 'Nossa Fintech', institution: 'Nossa Fintech', state: 'OFFER', code: String(option?.cod_tabela || row.table?.cod_tabela || row.table?.cod_produto || ''), name: option?.table_name || row.table?.nome_tabela || row.table?.name || 'INSS', amount: Number(amount), contractAmount: option?.issue_amount ? Number(option.issue_amount) : undefined, installment: Number(option?.installment_face_value ?? option?.installment_amount ?? (input.mode === 'Payment' ? input.value : 0)) || undefined, term: Number(option?.number_of_installments || input.term), rate: option?.interest_rate?.monthly_rate != null ? Number(option.interest_rate.monthly_rate) * 100 : Number(option?.monthly_interest_rate ?? option?.monthly_rate ?? nossaFintechTableRate(row.table || {})) || undefined });
          }
        }
      }),
      collect('FINANTO', async () => {
        const config = await FinantoService.getConfig(prisma, tenantId);
        if (!config.enabled || !config.isConfigured) return;
        const ageError = finantoAgeError(input.birthDate, input.term);
        if (ageError) throw new Error(ageError);
        const call = async (endpoint: string, body: any) => {
          const result = await FinantoService.request(prisma, tenantId, 'POST', endpoint, body);
          const payload = result.data as any;
          if (!result.success || payload?.messages?.length) throw new Error(payload?.messages?.map((msg: any) => msg.text).join(' ') || payload?.message || 'Consulta indisponível.');
          return payload;
        };
        const operation = ({ NEW: 1, PORT: 2, REFIN: 3, PORT_REFIN: 4 } as any)[input.operation];
        const products = items(await call('/v3/loan-products/search/basic', { type: { code: { eq: 20 } }, operation: { code: { eq: operation } } })).filter(item => Number(item.type?.code ?? item.typeCode) === 20);
        const ids = new Set(products.map(item => String(item.id)));
        if (!ids.size) { notes.push('FINANTO: nenhum produto disponível para a modalidade.'); return; }
        const rules: any[] = [];
        for (let offset = 0; offset < 2000; offset += 20) {
          const page = items(await call('/v3/loan-product-rules/search/basic', { offset, limit: 20, operation: { code: { eq: operation } } }));
          rules.push(...page.filter(rule => ids.has(String(rule.product?.id))));
          if (page.length < 20) break;
        }
        const jobs = rules.flatMap(rule => {
          if (finantoBenefitError(rule.name || '', input.benefitType) || (['PORT', 'PORT_REFIN'].includes(input.operation) && finantoInstallmentError(rule.name || '', input.originalInstallment))) return [];
          const rates = input.rate ? [input.rate] : [...new Set<number>((rule.items || []).map((item: any) => Number(item.rate || item.maxRate)).filter((rate: number) => rate > 0))];
          const choices = input.operation === 'PORT_REFIN' ? finantoRefinancingChoices(rule, input.term, input.rate) : rates.flatMap(rate => finantoRuleItem(rule, input.term, rate) ? [{ rate }] : []);
          return choices.map(choice => ({ rule, choice }));
        });
        for (let index = 0; index < jobs.length; index += 4) {
          await Promise.all(jobs.slice(index, index + 4).map(async ({ rule, choice }) => {
            try {
              let originContracts: any[] | undefined;
              if (input.operation === 'REFIN') {
                const eligible = items(await call('/v3/loan-inss-simulations/refinanceable-contracts', { identity: input.cpf, benefit: input.benefitNumber, ruleId: rule.id }));
                if (!eligible.length) return;
                const selected = eligible[0];
                originContracts = [{ lenderCode: selected.lenderCode, contractNumber: selected.contractNumber, dueBalanceValue: Number(selected.dueBalanceValue), installmentValue: Number(selected.installmentValue), installmentsRemaining: Number(selected.installmentsRemaining) }];
              }
              const factor = (1 - Math.pow(1 + choice.rate / 100, -input.term)) / (choice.rate / 100);
              const originContract = ['PORT', 'PORT_REFIN'].includes(input.operation) ? { lenderCode: Number(input.originalBank), contractNumber: input.originalContract, term: input.originalTerm, installmentsRemaining: input.remainingTerm, installmentValue: input.originalInstallment, dueBalanceValue: input.debt } : undefined;
              const data = await call('/v3/loan-inss-simulations/calculation', {
                ruleId: rule.id, hasInsurance: !!input.hasInsurance, rate: choice.rate, term: originContract?.installmentsRemaining || input.term,
                installmentValue: input.operation === 'NEW' ? input.mode === 'Payment' ? input.value : input.value / factor : originContract?.installmentValue || 0,
                ...(input.operation === 'NEW' ? { loanValue: input.mode === 'Payment' ? input.value * factor : input.value } : originContract ? { loanValue: input.debt } : {}),
                ...(originContract ? { originContract } : {}), ...(originContracts ? { originContracts } : {}),
                ...(input.operation === 'PORT_REFIN' ? { issueAmount: input.debt, refinancing: { term: input.term, rate: choice.rate, installmentValue: input.value } } : {}),
              });
              if (finantoCashOutError(rule.name || '', data)) return;
              const amount = finantoCashOut(data);
              if (amount && amount > 0) offers.push({ provider: 'FINANTO', institution: data.lender?.name || data.fund?.name || 'FINANTO', state: 'OFFER', code: String(rule.code || rule.id), name: finantoTableLabel(rule), amount, contractAmount: data.loanValue, installment: data.installmentValue || input.value, term: input.term, rate: choice.rate });
            } catch (error: any) { notes.push(`FINANTO (${rule.name}): ${error.message}`); }
          }));
        }
      }),
    ]);
    return { rows: offers, message: notes.join(' · ') || (!offers.length ? 'Nenhuma oferta retornada para os dados informados.' : '') };
  }
}
