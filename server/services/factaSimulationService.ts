import type { PrismaClient } from '@prisma/client';
import { FactaBankService } from './factaBankService';
import { factaFetch } from './factaTransport.js';
import type { ProductSimulationInput, ProductSimulationRow } from './productSimulationService';

export type FactaInssInput = {
  cpf: string; birthDate: string; benefitNumber: string; benefitType: number;
  operation: 'NEW' | 'PORT' | 'REFIN' | 'PORT_REFIN'; term: number;
  mode: 'AMOUNT' | 'INSTALLMENT'; value: number; rate?: number;
  debt?: number; originalTerm?: number; remainingTerm?: number; originalInstallment?: number;
  income?: number; contract?: string;
};
export type FactaOffer = { code: string; name: string; amount?: number; contractAmount?: number; installment?: number; term?: number; rate?: number; portabilityCode?: string };
export const factaNumber = (value: unknown): number | undefined => {
  if (value == null || value === '') return undefined;
  const text = String(value).trim();
  const number = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};
const date = (value: unknown) => {
  const text = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.split('-').reverse().join('/') : text;
};
const marginNumber = (value: unknown) => value === 0 || value === '0' || value === '0.00' || value === '0,00' ? 0 : factaNumber(value);
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const allowed = new Set(['/proposta/operacoes-disponiveis', '/proposta/contratos-refinanciamento', '/fgts/saldo', '/fgts/calculo', '/comercial/tabelas-coeficientes', '/solicita-autorizacao-consulta', '/consignado-trabalhador/autoriza-consulta', '/consignado-trabalhador/analise-politica-credito']);

export class FactaSimulationService {
  static async request(prisma: PrismaClient, tenantId: string, path: string, query: Record<string, unknown> = {}, body?: unknown, form = false, retry = true): Promise<any> {
    if (!allowed.has(path)) throw new Error('Método FACTA não permitido.');
    const config = await FactaBankService.getTenantConfig(prisma, tenantId);
    if (!config.isConfigured || !config.simulationEnabled) throw new Error('FACTA não está habilitada e configurada para simulações.');
    if (![FactaBankService.PRODUCTION_BASE_URL, FactaBankService.HOMOLOGATION_BASE_URL].includes(config.baseUrl)) throw new Error('Configure o endereço oficial da API FACTA.');
    const token = await FactaBankService.getToken(prisma, tenantId);
    const url = new URL(config.baseUrl + path);
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await factaFetch(url, {
        method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }) },
        body: body === undefined ? undefined : form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
      });
      // Only read requests can be safely repeated; authorization sends a message.
      if (response.status === 401 && retry && body === undefined) {
        FactaBankService.invalidateTokenCache(tenantId);
        return await this.request(prisma, tenantId, path, query, undefined, false, false);
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.erro === true || payload.erro === 'true' || payload.error) {
        throw new Error(payload?.mensagem || payload?.msg || payload?.message || `FACTA não concluiu a consulta (HTTP ${response.status}).`);
      }
      return payload;
    } catch (error: any) {
      if (error.name === 'AbortError') throw new Error('FACTA não respondeu dentro de 30 segundos. Consulte novamente.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  static offer(table: any): FactaOffer {
    return { code: String(table.codigoTabela || ''), name: String(table.tabela || 'Tabela sem nome'), amount: factaNumber(table.valor_liquido), contractAmount: factaNumber(table.contrato), installment: factaNumber(table.parcela), term: factaNumber(table.prazo), rate: factaNumber(table.taxa) };
  }

  static async inss(prisma: PrismaClient, tenantId: string, input: FactaInssInput): Promise<{ offers: FactaOffer[]; message?: string }> {
    const config = await FactaBankService.getTenantConfig(prisma, tenantId);
    if (!config.simulationEnabled || !config.isConfigured) return { offers: [] };
    const query: Record<string, unknown> = { produto: 'D', convenio: 3, averbador: 3, cpf: input.cpf, data_nascimento: date(input.birthDate), prazo: input.term, opcao_valor: input.mode === 'AMOUNT' ? 1 : 2, ...(input.mode === 'AMOUNT' ? { valor: input.value } : { valor_parcela: input.value }) };
    if (input.operation === 'REFIN') {
      if (!input.contract || !factaNumber(input.income)) throw new Error('Para refinanciar na FACTA, informe a renda e selecione um contrato elegível.');
      const contracts = await this.contracts(prisma, tenantId, input.cpf, input.benefitNumber);
      if (!contracts.some(item => item.code === input.contract)) throw new Error('O contrato selecionado não está elegível para refinanciamento FACTA neste benefício.');
      Object.assign(query, { tipo_operacao: 14, contratos_refin: input.contract, valor_renda: input.income });
    } else if (input.operation === 'PORT' || input.operation === 'PORT_REFIN') {
      if (![input.debt, input.originalTerm, input.remainingTerm, input.originalInstallment].every(value => factaNumber(value))) throw new Error('Informe saldo devedor, parcela atual e prazos do contrato de origem.');
      Object.assign(query, { tipo_operacao: '003500', opcao_valor: 2, valor_parcela: input.value, saldo_devedor: input.debt, prazo_original: input.originalTerm, prazo_restante: input.remainingTerm, valor_parcela_original: input.originalInstallment });
      delete query.valor;
    } else query.tipo_operacao = 13;
    const result = await this.request(prisma, tenantId, '/proposta/operacoes-disponiveis', query);
    const benefitEligible = (table: any) => {
      const name = String(table.tabela || '').toUpperCase();
      const species = name.match(/(?:ESP(?:ECIE|ÉCIE)?|BNF|BENEF[IÍ]CIO)\s*[:\-]?\s*(\d{1,2})(?!\d)/);
      if (species && Number(species[1]) !== input.benefitType) return false;
      const disability = [4, 5, 6, 11, 32, 33, 34, 51, 83, 92].includes(input.benefitType);
      if (/INVALIDEZ|INCAPACIDADE/.test(name) && !disability) return false;
      if (/LOAS|BPC/.test(name + ' ' + (table.grupos || '')) && ![87, 88].includes(input.benefitType)) return false;
      return true;
    };
    // The selected refinancing rate is not the rate of the debt being ported.
    const rateEligible = (table: any) => input.operation === 'PORT' || !input.rate || Math.abs((factaNumber(table.taxa) || 0) - input.rate) < 0.0001;
    const targetTerm = input.operation === 'PORT' ? input.remainingTerm : input.term;
    const termEligible = (table: any) => !targetTerm || factaNumber(table.prazo) === targetTerm;
    const eligible = (table: any) => benefitEligible(table) && rateEligible(table) && termEligible(table);
    // Production responses can assign several comma-separated groups to one table.
    const groupsOf = (table: any): string[] => [...new Set(String(table.grupos || '').split(',').map(group => group.trim().replace(/\s+/g, ' ').toUpperCase()).filter(Boolean))];
    let offers: FactaOffer[];
    if (input.operation === 'PORT_REFIN') {
      const ports = list(result.tabelas_portabilidade).filter(benefitEligible);
      offers = list(result.tabelas_refin_portabilidade).filter(eligible).flatMap(table => {
        const groups = new Set(groupsOf(table));
        return ports.filter(port => groupsOf(port).some(group => groups.has(group))).map(port => ({ ...this.offer(table), portabilityCode: String(port.codigoTabela), name: `${table.tabela} · portabilidade ${port.tabela}` }));
      });
    } else if (input.operation === 'PORT') {
      offers = list(result.tabelas_portabilidade).filter(eligible).map(table => this.offer(table));
    } else offers = list(result.tabelas).filter(eligible).map(table => this.offer(table));
    if (offers.length) return { offers };
    const returned = list(input.operation === 'PORT_REFIN' ? result.tabelas_refin_portabilidade : input.operation === 'PORT' ? result.tabelas_portabilidade : result.tabelas);
    const compatible = returned.filter(benefitEligible);
    const rateMatches = compatible.filter(rateEligible);
    const termMatches = rateMatches.filter(termEligible);
    const formatValues = (values: number[], suffix: string) => [...new Set(values)].sort((a, b) => a - b).map(value => `${value.toLocaleString('pt-BR')}${suffix}`).join(', ');
    if (!returned.length) {
      const bankMessage = [result.mensagem, result.msg, result.message].find(value => typeof value === 'string' && value.trim());
      return { offers, message: `A FACTA não retornou tabelas para esta operação e os dados informados.${bankMessage ? ` Retorno do banco: ${bankMessage.trim()}` : ''}` };
    }
    if (!compatible.length) return { offers, message: 'As tabelas retornadas pela FACTA têm restrições incompatíveis com a espécie do benefício selecionada.' };
    if (!rateMatches.length) {
      const rates = compatible.filter(termEligible).map(table => factaNumber(table.taxa)).filter((value): value is number => value != null);
      return { offers, message: `A FACTA retornou tabelas, mas nenhuma na taxa de ${input.rate?.toLocaleString('pt-BR')}% selecionada.${rates.length ? ` Taxas retornadas para ${targetTerm} meses: ${formatValues(rates, '%')}.` : ''}` };
    }
    if (!termMatches.length) {
      const terms = rateMatches.map(table => factaNumber(table.prazo)).filter((value): value is number => value != null);
      return { offers, message: `A FACTA retornou tabelas, mas nenhuma com prazo de ${targetTerm} meses.${terms.length ? ` Prazos retornados: ${formatValues(terms, ' meses')}.` : ''}` };
    }
    const returnedPorts = list(result.tabelas_portabilidade);
    const compatiblePorts = returnedPorts.filter(benefitEligible);
    const describeGroups = (tables: any[]) => [...new Set(tables.flatMap(table => groupsOf(table).length ? groupsOf(table) : ['(não informado)']))].join(', ') || '(nenhum)';
    const reason = !returnedPorts.length
      ? 'A FACTA retornou refinanciamento, mas a lista de portabilidade veio vazia.'
      : !compatiblePorts.length
        ? 'As tabelas de portabilidade retornadas foram descartadas por restrições de espécie do benefício.'
        : 'A FACTA retornou tabelas de refinanciamento, mas não uma tabela de portabilidade do mesmo grupo compatível com o benefício. Não foi possível combinar as condições.';
    return { offers, message: `${reason} Portabilidade: ${returnedPorts.length} tabelas retornadas, ${compatiblePorts.length} compatíveis com o benefício; grupos compatíveis: ${describeGroups(compatiblePorts)}. Refinanciamento no prazo e taxa solicitados: ${termMatches.length} tabelas; grupos: ${describeGroups(termMatches)}.` };
  }

  static async contracts(prisma: PrismaClient, tenantId: string, cpf: string, benefit: string) {
    const result = await this.request(prisma, tenantId, '/proposta/contratos-refinanciamento', { cpf, tipo_operacao: 14, averbador: 3, convenio: 3 });
    return Object.entries(result.lista_contratos_refin || {}).flatMap(([code, value]) => {
      const item = value as any;
      if (digits(item.matricula || item.dados?.matricula) !== digits(benefit)) return [];
      return [{ code, installment: factaNumber(item.valor_parcela), debt: factaNumber(item.saldo_devedor) }];
    });
  }

  static async product(prisma: PrismaClient, tenantId: string, product: 'CLT' | 'FGTS', action: 'SIMULATE' | 'AUTHORIZE' | 'REFRESH', input: ProductSimulationInput): Promise<ProductSimulationRow[]> {
    const rows: ProductSimulationRow[] = [];
    const row = (item: Omit<ProductSimulationRow, 'provider' | 'institution'>): ProductSimulationRow => ({ provider: 'FACTA', institution: 'FACTA', ...item });
    if (product === 'FGTS') {
      const balance = await this.request(prisma, tenantId, '/fgts/saldo', { cpf: input.cpf });
      const periods = Array.from({ length: 12 }, (_, i) => i + 1).filter(i => balance.retorno?.[`dataRepasse_${i}`]);
      if (!periods.some(i => factaNumber(balance.retorno?.[`valor_${i}`]))) return [row({ state: 'PENDING', message: balance.msg || 'Nenhum período de saldo disponível. Verifique a autorização no aplicativo FGTS.' })];
      const tables = await this.request(prisma, tenantId, '/comercial/tabelas-coeficientes', { averbador: 20095, tipo_operacao: 13 });
      const seen = new Set<string>();
      for (const table of list(tables.dados)) {
        const code = String(table.CD_TABELA_FF || '').trim();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        try {
          const result = await this.request(prisma, tenantId, '/fgts/calculo', {}, { cpf: input.cpf, tabela: code, ...(factaNumber(table.TX_MENSAL) ? { taxa: factaNumber(table.TX_MENSAL) } : {}), parcelas: periods.map(i => ({ [`dataRepasse_${i}`]: balance.retorno[`dataRepasse_${i}`], [`valor_${i}`]: i <= input.term ? factaNumber(balance.retorno[`valor_${i}`]) || 0 : 0 })) });
          const returnedCode = String(result.tabela || '').trim().match(/^(\d+)\s*-/)?.[1];
          if (returnedCode && returnedCode !== code) throw new Error('FACTA retornou outra tabela para o cálculo solicitado. A condição não foi utilizada.');
          const amount = factaNumber(result.valor_liquido);
          const approved = String(result.permitido || '').trim().toUpperCase() === 'SIM';
          rows.push(row({ table: result.tabela || table.TABELA, state: approved && amount ? 'OFFER' : 'PENDING', amount: approved ? amount : undefined, term: factaNumber(result.parcelas_selecionadas), rate: factaNumber(result.taxa), simulationId: result.simulacao_fgts, message: approved && amount ? undefined : result.msg || result.mensagem || 'Antecipação não permitida nesta tabela.' }));
        } catch (error: any) { rows.push(row({ table: table.TABELA, state: 'ERROR', message: error.message })); }
      }
      return rows.length ? rows : [row({ state: 'PENDING', message: 'Nenhuma tabela FGTS retornada.' })];
    }
    if (action === 'AUTHORIZE') {
      const phone = input.phone.length === 11 ? `(${input.phone.slice(0, 2)}) ${input.phone.slice(2, 7)}-${input.phone.slice(7)}` : `(${input.phone.slice(0, 2)}) ${input.phone.slice(2, 6)}-${input.phone.slice(6)}`;
      const result = await this.request(prisma, tenantId, '/solicita-autorizacao-consulta', {}, { averbador: '10010', nome: input.name, cpf: input.cpf, celular: phone, tipo_envio: 'SMS' }, true);
      return [row({ state: 'PENDING', message: result.mensagem || 'Solicitação enviada. Aguarde a autorização do cliente por SMS.' })];
    }
    const result = await this.request(prisma, tenantId, '/consignado-trabalhador/autoriza-consulta', { cpf: input.cpf });
    if (!Array.isArray(result.dados_trabalhador?.dados)) throw new Error('FACTA retornou uma resposta incompatível com a consulta de vínculos CLT. A resposta não foi utilizada.');
    const workers = list(result.dados_trabalhador?.dados).filter(worker => !input.employerDocument || digits(worker.numeroInscricaoEmpregador) === input.employerDocument);
    for (const worker of workers) {
      if (digits(worker.cpf) !== input.cpf) throw new Error('FACTA retornou dados de outro CPF. A resposta não foi utilizada.');
      const eligible = [true, 1, '1', 'true', 'S', 'SIM'].includes(worker.elegivel);
      const restrictions = [worker.erro_mensagem, !eligible ? 'Vínculo não elegível para crédito.' : undefined].filter(value => typeof value === 'string' && value.trim());
      if (action === 'REFRESH') {
        rows.push(row({ state: 'DATA', message: restrictions.join(' · ') || 'Dados do vínculo e margem atualizados.', data: { employment: { employer_cnpj: digits(worker.numeroInscricaoEmpregador), work_registration: worker.matricula }, margin: { name: worker.nome, document: worker.cpf, birth_date: worker.dataNascimento, available_balance: marginNumber(worker.valorMargemDisponivel), can_continue: eligible && !restrictions.length, employer: { name: worker.nomeEmpregador, document: digits(worker.numeroInscricaoEmpregador) }, restrictions, registration_number: worker.matricula, total_gross_salary: factaNumber(worker.valorTotalVencimentos), base_margin_value: marginNumber(worker.valorBaseMargem), admission_date: worker.dataAdmissao, job_code: { description: worker.cbo_descricao } } } }));
        continue;
      }
      if (restrictions.length) { rows.push(row({ state: 'PENDING', message: restrictions.join(' · ') })); continue; }
      if (!worker.dataNascimento || !factaNumber(worker.valorTotalVencimentos)) { rows.push(row({ state: 'PENDING', message: 'O banco não informou nascimento e renda necessários à simulação deste vínculo.' })); continue; }
      try {
        const tables = await this.request(prisma, tenantId, '/proposta/operacoes-disponiveis', { produto: 'D', tipo_operacao: 13, averbador: 10010, convenio: 3, opcao_valor: input.mode === 'Payment' ? 2 : 1, ...(input.mode === 'Payment' ? { valor_parcela: input.value } : { valor: input.value }), ...(input.term ? { prazo: input.term } : {}), cpf: input.cpf, data_nascimento: date(worker.dataNascimento), valor_renda: factaNumber(worker.valorTotalVencimentos) });
        for (const table of list(tables.tabelas)) {
          if (table.idAverbador != null && Number(table.idAverbador) !== 10010) {
            rows.push(row({ state: 'ERROR', message: 'FACTA retornou tabela de outro produto na consulta CLT. A condição não foi utilizada.' })); continue;
          }
          const offer = this.offer(table);
          if (input.term && offer.term !== input.term) continue;
          if (!offer.term || !offer.contractAmount || !worker.matricula || !worker.dataNascimento || !worker.dataAdmissao) {
            rows.push(row({ table: offer.name, state: 'PENDING', message: 'Dados insuficientes para validar a política de crédito deste vínculo.' })); continue;
          }
          try {
            const policy = await this.request(prisma, tenantId, '/consignado-trabalhador/analise-politica-credito', { cpf: input.cpf, matricula: worker.matricula, dataNascimento: date(worker.dataNascimento), dataAdmissao: date(worker.dataAdmissao), prazo: offer.term, valorEmprestimo: offer.contractAmount });
            if ((policy.cpf && digits(policy.cpf) !== input.cpf) || (policy.matricula && String(policy.matricula).trim() !== String(worker.matricula).trim())) throw new Error('FACTA retornou política de outro CPF ou vínculo. A condição não foi utilizada.');
            if (String(policy.aprovado) !== '1') { rows.push(row({ table: offer.name, state: 'PENDING', message: policy.mensagem || 'Vínculo recusado pela política de crédito.' })); continue; }

            rows.push(row({ table: `${offer.name} · ${worker.nomeEmpregador || worker.numeroInscricaoEmpregador}`, state: offer.amount ? 'OFFER' : 'PENDING', amount: offer.amount, installment: offer.installment, term: offer.term, rate: offer.rate, message: offer.amount ? undefined : 'O banco não informou valor líquido para esta condição.' }));
          } catch (error: any) { rows.push(row({ table: offer.name, state: 'ERROR', message: error.message })); }
        }
      } catch (error: any) { rows.push(row({ state: 'ERROR', message: error.message })); }
    }
    return rows.length ? rows : [row({ state: 'PENDING', message: 'Nenhum vínculo ou condição elegível retornado para os dados informados.' })];
  }
}
