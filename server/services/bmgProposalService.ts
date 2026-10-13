import type { PrismaClient } from '@prisma/client';
import { BmgBankService } from './bmgBankService.js';
import { PartnerSimulationTracking } from './partnerSimulationTracking.js';

function required(value: unknown, label: string, max = 120) {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw new Error(`Informe ${label}.`);
  return text;
}
const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export class BmgProposalService {
  static async createClt(prisma: PrismaClient, context: { tenantId: string; actorId: string; userId: string; partnerId: string }, raw: any) {
    const { tenantId, actorId, userId, partnerId } = context;
    const cpf = String(raw.cpf || '').replace(/\D/g, ''), simulationId = String(raw.simulationId || '');
    if (!/^\d{11}$/.test(cpf) || !/^\d{1,30}$/.test(simulationId)) throw new Error('CPF ou simulação inválidos.');
    const previous = await BmgBankService.submission(prisma, tenantId, simulationId);
    if (previous.data && (previous.data.cpf !== cpf || previous.data.actorId !== actorId || previous.data.partnerId !== partnerId)) throw new Error('Esta oferta já está vinculada a outro envio.');
    if (previous.data?.proposalId) return { proposalId: previous.data.proposalId, proposalNumber: previous.data.number, message: 'Proposta BMG já cadastrada no Sentinel.' };
    let saved = previous.data;
    if (saved && !saved.number) throw new Error('O envio anterior está em processamento ou sem confirmação. Consulte a esteira BMG antes de reenviar para evitar duplicidade.');
    if (!saved) {
      const partner = await prisma.partner.findFirst({ where: { id: partnerId, tenantId, deletedAt: null, status: 'ATIVO' } });
      if (!partner) throw new Error('Selecione um parceiro ativo desta empresa.');
      const existingClient = await prisma.client.findUnique({ where: { tenantId_cpf: { tenantId, cpf } } });
      if (existingClient?.deletedAt) throw new Error('Restaure o cadastro do cliente antes de incluir a proposta no BMG.');
      const { quote, phone } = await BmgBankService.cltQuote(prisma, tenantId, actorId, cpf, simulationId);
      const name = required(raw.name, 'o nome completo do cliente', 200), email = required(raw.email, 'o e-mail do cliente', 254);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail do cliente inválido.');
      const address = raw.address || {}, document = raw.document || {}, account = raw.account || {};
      const uf = required(address.uf, 'a UF').toUpperCase(), documentUf = required(document.uf, 'a UF do documento').toUpperCase();
      const cep = String(address.cep || '').replace(/\D/g, '');
      if (!states.has(uf) || !states.has(documentUf) || !/^\d{8}$/.test(cep)) throw new Error('Confira CEP e UFs do cliente.');
      const issued = required(document.dataEmissao, 'a data de emissão do documento');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issued) || !Number.isFinite(Date.parse(issued)) || new Date(issued).toISOString().slice(0, 10) !== issued || Date.parse(issued) > Date.now()) throw new Error('Data de emissão inválida.');
      const bankCode = String(account.codigoBanco || ''), agency = String(account.numeroAgencia || ''), number = String(account.numeroConta || ''), digit = String(account.digitoVerificadorConta || '');
      if (!/^\d{1,3}$/.test(bankCode) || Number(bankCode) < 1 || !/^\d{1,8}$/.test(agency) || !/^\d{1,20}$/.test(number) || !/^[\dXx]{1,2}$/.test(digit)) throw new Error('Confira banco, agência, conta e dígito.');
      const payload = { cliente: { cpf, canal: 'WEBSERVICE', idSimulacao: simulationId, numeroInscricaoEmpregador: String(quote.numeroInscricaoEmpregador), email, telefone: phone, grauInstrucao: required(raw.grauInstrucao, 'o grau de instrução'), endereco: { cep, uf, logradouro: required(address.logradouro, 'o logradouro'), numero: required(address.numero, 'o número do endereço', 20), complemento: String(address.complemento || '').trim().slice(0, 120), bairro: required(address.bairro, 'o bairro'), cidade: required(address.cidade, 'a cidade') }, documentoIdentificacao: { tipo: required(document.tipo, 'o tipo do documento'), numero: required(document.numero, 'o número do documento', 40), dataEmissao: issued, emissor: required(document.emissor, 'o órgão emissor', 40), uf: documentUf } }, formaCredito: { tipoConta: required(account.tipoConta, 'o tipo da conta', 30), codigoBanco: Number(bankCode), numeroAgencia: agency, numeroConta: number, digitoVerificadorConta: digit } };
      // Prepare local references before initiating the bank operation.
      const bank = await prisma.bank.upsert({ where: { tenantId_code: { tenantId, code: '318' } }, create: { tenantId, code: '318', name: 'BMG' }, update: {} });
      let product = await prisma.product.findFirst({ where: { tenantId, active: true, type: 'NOVO', name: 'CLT - Crédito do Trabalhador' } });
      if (!product) product = await prisma.product.create({ data: { tenantId, scope: 'TENANT', name: 'CLT - Crédito do Trabalhador', type: 'NOVO' } });
      saved = { actorId, cpf, partnerId, promoterId: partner.promoterId, userId, name, quote, payload, bankId: bank.id, productId: product.id, state: 'PENDING', createdAt: new Date().toISOString() };
      await BmgBankService.reserveSubmission(prisma, tenantId, previous.configKey, saved);
      let result: any;
      try { result = await BmgBankService.request(prisma, tenantId, 'POST', '/v1/consignado-privado/propostas', payload); }
      catch { throw new Error('Não foi possível confirmar a inclusão no BMG. Consulte a esteira do banco antes de reenviar esta simulação.'); }
      if (!/^\d{1,30}$/.test(String(result?.codigoAdesao || ''))) throw new Error('O BMG não confirmou o código de adesão. Confira a esteira antes de reenviar.');
      saved = { ...saved, number: String(result.codigoAdesao), status: String(result.status || ''), state: 'CONFIRMED' };
      await BmgBankService.saveSubmission(prisma, tenantId, previous.configKey, saved);
    }
    const proposal = await prisma.$transaction(async tx => {
      const existing = await tx.proposal.findUnique({ where: { tenantId_proposalNumber: { tenantId, proposalNumber: saved.number } }, include: { client: true } });
      if (existing) {
        if (existing.bankId !== saved.bankId || existing.client.cpf !== cpf || existing.partnerId !== saved.partnerId || existing.deletedAt) throw new Error('A ADE já está cadastrada com dados diferentes. Confira a proposta existente.');
        return existing;
      }
      const client = await tx.client.upsert({ where: { tenantId_cpf: { tenantId, cpf } }, update: {}, create: { tenantId, cpf, fullName: saved.name, phone: saved.payload.cliente.telefone, email: saved.payload.cliente.email, addressZip: saved.payload.cliente.endereco.cep, addressStreet: saved.payload.cliente.endereco.logradouro, addressCity: saved.payload.cliente.endereco.cidade, addressState: saved.payload.cliente.endereco.uf } });
      if (client.deletedAt) throw new Error('Restaure o cadastro do cliente para registrar esta ADE já confirmada pelo BMG.');
      return tx.proposal.create({ data: { tenantId, proposalNumber: saved.number, clientId: client.id, partnerId: saved.partnerId, promoterId: saved.promoterId, createdById: saved.userId, bankId: saved.bankId, productId: saved.productId, type: 'NOVO', releasedValue: Number(saved.quote.valorSolicitadoEmprestimo), contractValue: Number(saved.quote.valorSolicitadoEmprestimo), installmentValue: Number(saved.quote.valorParcela), installmentsCount: Number(saved.quote.parcelas), ades: { create: { tenantId, adeNumber: saved.number, value: Number(saved.quote.valorSolicitadoEmprestimo), installments: Number(saved.quote.parcelas), bankName: 'BMG', productId: saved.productId } } } });
    });
    await BmgBankService.saveSubmission(prisma, tenantId, previous.configKey, { ...saved, proposalId: proposal.id, state: 'SAVED' });
    await PartnerSimulationTracking.reconcile(prisma, tenantId);
    return { proposalId: proposal.id, proposalNumber: saved.number, message: `Proposta BMG ${saved.number} cadastrada no Sentinel.` };
  }
}
