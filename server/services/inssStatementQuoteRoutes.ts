import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { isValidCpf } from '../../src/lib/utils.js';
import { ageAt } from '../../src/lib/inssEligibility.js';
import { hasPermission } from '../../src/lib/permissions.js';
import type { Role } from '../../src/types/index.js';
import { PartnerSimulationService } from './partnerSimulationService.js';
import { paidFromTerms, portabilityEligibility } from '../../src/lib/portabilityEligibility.js';
import { inssProjectedMargin, INSS_PROJECTED_2027 } from '../../src/lib/inssProjectedMargin.js';

// Consulta de condições, sem registro de proposta ou contratação.
 // PROJECTED_NEW é um cenário explicitamente hipotético de cálculo das APIs
 // (parcela adicional), jamais é representado como margem averbável/vigente.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 40,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Limite de consultas do extrato atingido. Tente novamente mais tarde.' },
});
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const validTerm = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 120;
const safeText = (v: unknown, max = 100) => typeof v === 'string' ? v.trim().slice(0, max) : '';

export function registerInssStatementQuoteRoutes(
  app: Express, prisma: PrismaClient, getSession: (req: Request) => Promise<any>,
) {
  app.post('/api/inss/statement/quote', limiter, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = await getSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Sessão expirada.' });
    if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'simulations.create'))
      return res.status(403).json({ error: 'Sem permissão para simular.' });
    const tenantId = session.effectiveTenantId || session.user.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Selecione a empresa ativa.' });

    const raw = req.body || {};
    if (raw.confirmedClientAuthorization !== true)
      return res.status(400).json({ error: 'Confirme a autorização do cliente antes de consultar as instituições.' });
    if (!['NEW', 'PORT_REFIN', 'PROJECTED_NEW'].includes(raw.operation) ||
        !['YES', 'NO'].includes(raw.illiterate) ||
        typeof raw.loanBlocked !== 'boolean' ||
        typeof raw.legalRepresentative !== 'boolean')
      return res.status(400).json({ error: 'Modalidade ou confirmação obrigatória inválida.' });

    const cpf = safeText(raw.cpf, 20).replace(/\D/g, '');
    const benefitNumber = safeText(raw.benefitNumber, 25).replace(/\D/g, '');
    const birthDate = safeText(raw.birthDate, 10);
    const benefitType = raw.benefitType;
    const term = raw.term;
    const income = raw.income;
    const margin = raw.loanMargin;
    if (!isValidCpf(cpf) || !/^\d{8,20}$/.test(benefitNumber) ||
        ageAt(birthDate) === null || !Number.isInteger(benefitType) || benefitType <= 0 ||
        !validTerm(term) || (income !== null && income !== undefined && !positive(income)))
      return res.status(400).json({ error: 'Confira CPF, benefício, nascimento, espécie, renda e prazo.' });
    if (raw.loanBlocked) return res.json({ offers: [], notices: ['Benefício bloqueado para empréstimos no extrato.'] });
    if (raw.operation === 'NEW' && !positive(margin))
      return res.json({ offers: [], notices: ['Margem atual insuficiente para empréstimo novo.'] });
    const projectedScenario=raw.operation==='PROJECTED_NEW';
    const projection=projectedScenario?inssProjectedMargin(income,margin,raw.loanBlocked):null;
    if(projectedScenario&&(!projection||projection.loanBlocked||raw.forecastYear!==INSS_PROJECTED_2027.forecastYear))
      return res.status(422).json({error:'Cenário futuro não aplicável: confira renda do extrato, bloqueio e ano da projeção.'});

    const contract = raw.operation === 'PORT_REFIN' ? raw.contract : null;
    if (raw.operation === 'PORT_REFIN' && (
      !contract || typeof contract !== 'object' ||
      !/^\d{1,3}$/.test(contract.originBank) ||
      !safeText(contract.contractNumber, 100) ||
      !validTerm(contract.originalTerm) || !validTerm(contract.remainingTerm) ||
      contract.remainingTerm > contract.originalTerm ||
      !positive(contract.debt) || !positive(contract.installment)
    )) return res.status(400).json({ error: 'Confira banco, contrato, saldo, parcela e prazos da portabilidade.' });

    const input = {
      product: 'INSS',
      operation: projectedScenario ? 'NEW' : raw.operation,
      projectedScenario: projectedScenario ? 'FORECAST_2027' : undefined,
      nonBindingQuoteOnly: true,
      onlyAdditionalPortBanks: raw.operation==='PORT_REFIN' && raw.onlyAdditionalPortBanks===true,
      cpf,
      name: safeText(raw.name, 200),
      phone: '',
      birthDate,
      benefitNumber,
      benefitType,
      mode: 'Payment',
      term,
      // O valor hipotético de R$42 é solicitado somente como cálculo de parcela,
      // identificado como FUTURO: não altera a margem atual declarada.
      value: projectedScenario ? INSS_PROJECTED_2027.addedInstallment : raw.operation === 'NEW' ? margin : contract.installment,
      income: income || undefined,
      legalRepresentative: raw.legalRepresentative,
      illiterate: raw.illiterate === 'YES',
      negativeMarginAmount: typeof margin === 'number' && margin < 0 ? margin : undefined,
      benefitStartDate: safeText(raw.benefitStartDate, 10),
      originalBank: contract?.originBank,
      originalContract: contract?.contractNumber,
      originalTerm: contract?.originalTerm,
      remainingTerm: contract?.remainingTerm,
      originalInstallment: contract?.installment,
      debt: contract?.debt,
      eligibility: true,
      hasInsurance: false,
      bmgActorId: `user:${session.user.id}`,
    };

    try {
      const result = await PartnerSimulationService.run(prisma, tenantId, input, 'SIMULATE');
      const offers = (Array.isArray(result.rows) ? result.rows : [])
        .filter((row: any) => {
          if (row?.state !== 'OFFER' || !positive(Number(row.amount))) return false;
          if (!contract) return true;
          const paid = paidFromTerms(contract.originalTerm, contract.remainingTerm);
          const check = { product: 'INSS', operation: 'PORT_REFIN' };
          return !portabilityEligibility(String(row.provider || ''), contract.originBank, paid, check).blocked &&
            !portabilityEligibility(String(row.institution || ''), contract.originBank, paid, check).blocked;
        })
        .slice(0, 150)
        .map((row: any) => ({
          provider: safeText(row.provider || row.institution, 65) || 'Instituição não identificada',
          institution: safeText(row.institution || row.provider, 90),
          table: safeText(row.name || row.table || row.tableName || row.code, 120),
          amount: Number(row.amount),
          installment: positive(Number(row.installment)) ? Number(row.installment) : null,
          rate: positive(Number(row.rate)) ? Number(row.rate) : null,
          term: validTerm(Number(row.term)) ? Number(row.term) : null,
          source: row.quoteKind === 'ESTIMATE' ? 'PLANILHA' : 'API',
          review: projectedScenario || !!row.policyReview || row.quoteKind === 'ESTIMATE',
          ...(projectedScenario ? {scenario:'PROJECTED_2027',nonBinding:true,notAvailableMargin:true}:{}),
        }));
      const notices = (Array.isArray(result.rows) ? result.rows : [])
        .filter((row: any) => ['PENDING','ERROR'].includes(row?.state) && typeof row.message === 'string')
        .slice(0, 25)
        .map((row: any) => `${safeText(row.institution || row.provider, 40)}: ${safeText(row.message, 220)}`);
      if (typeof result.message === 'string' && result.message.trim()) notices.push(safeText(result.message, 700));
      return res.json({ offers, notices, operation: raw.operation, ...(projectedScenario ? {
        scenario:'PROJECTED_2027',installment:INSS_PROJECTED_2027.addedInstallment,
        officialMarginAvailable:false,
        warning:'Cálculo hipotético de parcela futura. Não é margem Dataprev liberada, proposta ou aprovação.'
      }:{}), contractNumberSuffix: contract ? String(contract.contractNumber).slice(-4) : undefined });
    } catch {
      return res.status(502).json({ error: 'Não foi possível concluir a consulta bancária. Verifique a conexão e tente novamente.' });
    }
  });
}
