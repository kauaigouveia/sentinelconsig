import type { PrismaClient } from '@prisma/client';
import { HappyBankService } from './happyBankService.js';
import { HappySimulationService } from './happySimulationService.js';

export async function partnerHappySimulation(prisma: PrismaClient, tenantId: string, input: any, action: string): Promise<any[]> {
  const config = await HappyBankService.getTenantConfig(prisma, tenantId);
  if (!config.ativo || !config.isConfigured || input.product === 'FGTS') return [];
  const pending = (message: string, link?: string) => [{ provider: 'HAPPY', institution: 'HAPPY / BYX', state: 'PENDING', message, ...(link && /^https:\/\//.test(link) ? { link } : {}) }];
  if (input.product === 'CLT') {
    if (action === 'AUTHORIZE') {
      await HappySimulationService.criarClienteClt(prisma, tenantId, { cpf: input.cpf, nome: input.name, telefone: input.phone }, input.partnerId);
    }
    const data = await HappySimulationService.consultarDataprevClt(prisma, tenantId, { cpf: input.cpf, nome: input.name, telefone: input.phone });
    if (!HappySimulationService.isCltApproved(data)) return pending(data.message || 'Aguarde a autorização do cliente na Happy.', data.url_consulta_autorizacao || undefined);
    if (action !== 'SIMULATE') return pending('Consulta Happy autorizada. Você já pode simular.');
    if (!data.id_cliente) return pending('Happy não informou o identificador do cliente autorizado.');
    const offers: any[] = [];
    for (const condition of data.valores_credito || []) {
      if (String(condition.status_motor).toUpperCase() !== 'APPROVED') continue;
      const terms = input.term ? [input.term] : [...new Set([condition.min_parcelas, ...[6, 12, 18, 24, 30, 36, 48, 60, 72, 84], condition.max_parcelas])];
      for (const term of terms.filter(term => Number.isInteger(term) && term >= condition.min_parcelas && term <= condition.max_parcelas)) {
        const result = await HappySimulationService.simularContratoClt(prisma, tenantId, { cliente_id: data.id_cliente, quantidade_parcelas: term, ...(input.mode === 'Payment' ? { valor_parcela: input.value } : { valor_solicitado: input.value }), taxa: condition.max_taxa, base_juros: condition.base_juros, chave_seguro: condition.chave_seguro });
        const amount = Number(result.valor_cliente ?? result.valor_liquido);
        if (Number.isFinite(amount) && amount > 0) offers.push({ provider: 'HAPPY', institution: 'HAPPY / BYX', state: 'OFFER', code: String(condition.base_juros), name: 'Crédito do trabalhador', amount, contractAmount: result.valor_principal, installment: result.valor_parcela, term: result.quantidade_parcelas || term, rate: result.taxa_nominal_am });
      }
    }
    return offers.length ? offers : pending('Happy não retornou valor liberado para as condições solicitadas.');
  }
  if (action === 'AUTHORIZE') {
    if (!input.name || !/^\d{10,11}$/.test(input.phone)) return pending('Informe nome e telefone para solicitar autorização Happy.');
    await HappySimulationService.criarClienteInss(prisma, tenantId, { nome: input.name, telefone: input.phone, cpf: input.cpf, dt_nascimento: input.birthDate, escolaridade: 1, tipo_produto: 1216171824, numero_beneficio: input.benefitNumber, representante_legal: input.legalRepresentative });
  }
  const consent = await HappySimulationService.consultarIn100(prisma, tenantId, { cpf: input.cpf, numero_beneficio: input.benefitNumber });
  if (consent.in100_autorizada !== true && consent.retornou_in100 !== true) return pending(consent.message || 'Happy requer autorização IN100 do cliente.', consent.url_formalizacao);
  if (action !== 'SIMULATE') return pending('IN100 Happy autorizada. Você já pode simular.');
  if (!['NEW', 'PORT_REFIN'].includes(input.operation)) return pending('Happy oferece neste fluxo Novo e Portabilidade + Refinanciamento.');
  if (input.operation === 'NEW' && input.mode !== 'Payment') return pending('Na Happy INSS, informe o valor da parcela para simular.');
  if (input.operation === 'PORT_REFIN' && (!input.happyPlan || !input.rate)) return pending('Para consultar Happy Port/Refin, selecione taxa e informe o plano Happy.');
  const result = input.operation === 'NEW'
    ? await HappySimulationService.simularMargemLivreInss(prisma, tenantId, { cpf: input.cpf, numero_beneficio: input.benefitNumber, valor_parcela: input.value, prazo: input.term })
    : await HappySimulationService.simularPortabilidadeRefinInss(prisma, tenantId, { cpf: input.cpf, saldo_devedor: input.debt, numero_parcelas: input.remainingTerm, valor_parcelas: input.originalInstallment, valor_parcelas_refin: input.value, numero_parcelas_refin: input.term, taxa_mensal_refin: input.rate, cd_beneficio_tipo: input.benefitType, id_externo_plano: input.happyPlan });
  const offers: any[] = [];
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || value.erro || value.error || value.success === false) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const amount = Number(value.valor_cliente ?? value.valor_liquido ?? value.valor_liberado);
    if (Number.isFinite(amount) && amount > 0) {
      offers.push({ provider: 'HAPPY', institution: 'HAPPY / BYX', state: 'OFFER', code: String(value.id_simulacao || value.id_externo_plano || 'HAPPY'), name: value.nome_plano || 'INSS Happy', amount, contractAmount: value.valor_principal ?? value.valor_bruto, installment: value.valor_parcela ?? value.valor_parcelas, term: value.prazo ?? value.quantidade_parcelas ?? input.term, rate: value.taxa_mensal ?? value.taxa_nominal_am });
    } else Object.values(value).forEach(visit);
  };
  visit(result);
  return offers.length ? offers : pending(result.message || result.mensagem || 'Happy não informou valor líquido na resposta da simulação.');
}
