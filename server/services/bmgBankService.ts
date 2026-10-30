import {otpAttempts,consumeOtpAttempt} from './bmgOtpAttempts.js';
import { cltResponseReasons } from '../../src/lib/cltRestrictions.js';
import { cltBankOnce, reserveCltSms } from './cltBankOperation.js';
import { journeyFetch } from './cltJourneyDeadline.js';
import { integrationConfigStore, integrationCacheKey, currentIntegrationPromoter, withIntegrationPromoter, resolveBankPromoter } from './bankPromoterConfig.js';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { isValidCpf } from '../../src/lib/utils.js';

const BASES = { sandbox: 'https://api-partners-sandbox.bancobmg.com.br/parceiros-consignado', production: 'https://api-partners.bancobmg.com.br/parceiros-consignado' };
type Config = { environment: keyof typeof BASES; username: string; password: string; enabled: boolean; storeCode: string; channelCode: string; operatorCpf: string; entityCode?: string };
const tokens = new Map<string, { value: string; expires: number; fingerprint: string }>();
function key() { const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET; if (!secret) throw new Error('Segredo de autenticação não configurado.'); return createHash('sha256').update(`sentinel:bmg:${secret}`).digest(); }
function seal(value: unknown) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv); const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.'); }
function open(value: string): any { const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64')); const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag); return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')); }
function parseResponse(text: string) {
  // Preserve long BMG identifiers instead of rounding them as JavaScript numbers.
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => token.startsWith('"') || !/^-?\d+$/.test(token) || Number.isSafeInteger(Number(token)) ? token : JSON.stringify(token)));
}
function requestBody(value: unknown) {
  const replacements = new Map<string, string>();
  const json = JSON.stringify(value, (field, item) => {
    if (field !== 'idSimulacao') return item;
    const id = String(item);
    if (!/^\d{1,30}$/.test(id)) throw new Error('Identificador de simulação BMG inválido.');
    const marker = `bmg_id_${randomBytes(16).toString('hex')}`;
    replacements.set(marker, id); return marker;
  });
  return [...replacements].reduce((body, [marker, id]) => body.replace(JSON.stringify(marker), id), json);
}
export class BmgBankService {
  static async config(prisma: PrismaClient, tenantId: string): Promise<Config> {
    const row = await (await integrationConfigStore(prisma, tenantId, 'bmg')).findUnique({ where: { tenantId_configKey: { tenantId, configKey: 'BMG_CONFIG' } } });
    return row ? open(row.configValue) : { environment: 'sandbox', username: '', password: '', enabled: false, storeCode: '', channelCode: '', operatorCpf: '' };
  }
  static metadata(config: Config) { const { password, ...safe } = config; return { ...safe, hasPassword: !!password, isConfigured: !!(config.username && password) }; }
  static async save(prisma: PrismaClient, tenantId: string, input: any) {
    const previous = await this.config(prisma, tenantId);
    if (!['sandbox', 'production'].includes(input.environment)) throw new Error('Escolha Sandbox ou Produção.');
    const config: Config = { environment: input.environment, username: String(input.username || '').trim(), password: String(input.password || previous.password), enabled: input.enabled === true, storeCode: String(input.storeCode || '').trim(), channelCode: String(input.channelCode || '').trim(), operatorCpf: String(input.operatorCpf || '').replace(/\D/g, ''), entityCode: String(input.entityCode || '').trim() };
    if (config.enabled && (!config.username || !config.password)) throw new Error('Cadastre o usuário de integração e a senha BMG.');
    if (config.operatorCpf && !isValidCpf(config.operatorCpf)) throw new Error('CPF do operador de vendas inválido.');
    if ([config.storeCode, config.channelCode, config.entityCode].some(value => value && !/^\d+$/.test(value))) throw new Error('Loja, canal e entidade devem conter apenas números.');
    await (await integrationConfigStore(prisma, tenantId, 'bmg')).upsert({ where: { tenantId_configKey: { tenantId, configKey: 'BMG_CONFIG' } }, create: { tenantId, configKey: 'BMG_CONFIG', configValue: seal(config), isSecret: true }, update: { configValue: seal(config), isSecret: true } });
    tokens.delete(integrationCacheKey(tenantId));
    if (previous.environment !== config.environment || previous.username !== config.username || previous.password !== config.password || !config.enabled) await (await integrationConfigStore(prisma, tenantId, 'bmg')).deleteMany({ where: { tenantId, configKey: { startsWith: 'BMG_SESSION:' } } });
    return this.metadata(config);
  }
  static async token(prisma: PrismaClient, tenantId: string) {
    const config = await this.config(prisma, tenantId);
    if (!config.enabled || !config.username || !config.password) throw new Error('Cadastre e habilite as credenciais BMG da empresa.');
    const fingerprint = createHash('sha256').update(JSON.stringify([config.environment, config.username, config.password])).digest('hex');
    const cached = tokens.get(integrationCacheKey(tenantId)); if (cached && cached.fingerprint === fingerprint && cached.expires > Date.now()) return cached.value;
    const response = await journeyFetch(`${BASES[config.environment]}/v1/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.access_token) throw new Error(`BMG não autenticou o usuário de integração (HTTP ${response.status}).`);
    const expiry = Number(data.expires_in); if (Number.isFinite(expiry) && expiry > 60) tokens.set(integrationCacheKey(tenantId), { value: data.access_token, expires: Date.now() + (expiry - 60) * 1000, fingerprint });
    return String(data.access_token);
  }
  static async request(prisma: PrismaClient, tenantId: string, method: string, path: string, body?: any, headers: Record<string, string> = {}) {
    const config = await this.config(prisma, tenantId), token = await this.token(prisma, tenantId);
    if (!/^\/v1\/(sms\/otp|sms\/validar|ofertas(?:\/elegiveis|\/simulacoes)?|in100|consignado-privado\/(?:elegibilidade|simulacao|propostas)|propostas\/[^/?]+|link-formalizacao)(?:\?|$)/.test(path)) throw new Error('Operação BMG não autorizada.');
    const response = await journeyFetch(`${BASES[config.environment]}${path}`, { method, headers: { ...headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : requestBody(body), signal: AbortSignal.timeout(20000), redirect: 'error' });
    const text = await response.text(); let data: any; try { data = parseResponse(text); } catch { throw new Error(`BMG retornou uma resposta incompatível (HTTP ${response.status}).`); }
    if (!response.ok || (data?.statusCode && Number(data.statusCode) >= 400) || (typeof data?.status === 'number' && data.status >= 400) || data?.erro === true || (typeof data?.erro === 'string' && data.erro.length > 0)) throw new Error(`BMG não concluiu a operação (HTTP ${response.status}${data?.statusCode ? ` / ${data.statusCode}` : ''}). Confira os dados e a liberação comercial.`);
    return data;
  }
  private static sessionKey(actorId: string, cpf: string) { return `BMG_SESSION:${createHash('sha256').update(`${actorId}:${cpf}`).digest('hex')}`; }
  private static async session(prisma: PrismaClient, tenantId: string, actorId: string, cpf: string) {
    const configKey = this.sessionKey(actorId, cpf), where = { tenantId_configKey: { tenantId, configKey } };
    const row = await (await integrationConfigStore(prisma, tenantId, 'bmg')).findUnique({ where }); return { where, configKey, data: row ? open(row.configValue) : null };
  }
  private static async saveSession(prisma: PrismaClient, tenantId: string, actorId: string, cpf: string, data: any) {
    const configKey = this.sessionKey(actorId, cpf); await (await integrationConfigStore(prisma, tenantId, 'bmg')).upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue: seal(data), isSecret: true }, update: { configValue: seal(data) } });
  }
  static async sendOtp(prisma: PrismaClient, tenantId: string, actorId: string, cpf: string, phone: string) {
    const saved=await this.session(prisma,tenantId,actorId,cpf),session=saved.data;
    if(session?.token&&session.expires>Date.now())return {message:'O cliente já possui autorização válida. Nenhum novo SMS foi enviado.',authorization:await this.cltAuthorization(prisma,tenantId,actorId,{cpf,phone},false),smsSent:false};
    const attempts=session?.verificationToken?await otpAttempts(prisma,tenantId,actorId,cpf,session.expires):0;
    if(session?.verificationToken&&session.expires>Date.now()&&attempts<3)return {message:'Já existe um SMS válido. Aguarde o código ou sua expiração; não houve reenvio.',smsSent:false,authorization:await this.cltAuthorization(prisma,tenantId,actorId,{cpf,phone},false)};
    return cltBankOnce(prisma,tenantId,'bmg',['OTP',actorId,cpf,session?.expires||0],async()=>{
      await reserveCltSms(prisma,tenantId,actorId);
      const data=await this.request(prisma,tenantId,'POST','/v1/sms/otp',{cpf,celular:phone});
      if(!data?.verificationToken)throw Error('BMG não retornou a identificação da autorização.');
      const expires=Date.now()+300000;
      await this.saveSession(prisma,tenantId,actorId,cpf,{phone,verificationToken:data.verificationToken,expires});
      return {message:'SMS solicitado ao BMG. Aguarde o código do cliente e valide em até 5 minutos.',smsSent:true,authorization:{status:'WAITING_OTP',ready:false,expiresAt:new Date(expires).toISOString(),retryAfterSeconds:300,attemptsRemaining:3}};
    });
  }
  static async cltAuthorization(prisma: PrismaClient, tenantId: string, actorId: string, input: {cpf:string;phone:string}, initiate: boolean) {
    const saved=await this.session(prisma,tenantId,actorId,input.cpf),session=saved.data;
    if(session?.token&&session.expires>Date.now()) {
      const eligible=await this.request(prisma,tenantId,'GET','/v1/consignado-privado/elegibilidade?canal=WEBSERVICE',undefined,{cpf:input.cpf,'session-token':session.token});
      if(eligible?.cpf&&String(eligible.cpf).replace(/\D/g,'')!==input.cpf)throw Error('BMG retornou elegibilidade de outro cliente.');
      if(typeof eligible?.elegivel!=='boolean')throw Error('BMG retornou formato incompatível para elegibilidade. Nenhuma simulação foi enviada.');
      return {status:'APPROVED',ready:eligible.elegivel,expiresAt:new Date(session.expires).toISOString(),reason:cltResponseReasons(eligible).join(' · ')||undefined};
    }
    if(session?.verificationToken&&session.expires>Date.now()){
      const attempts=await otpAttempts(prisma,tenantId,actorId,input.cpf,session.expires);
      return {status:attempts>=3?'ATTEMPTS_EXCEEDED':'WAITING_OTP',ready:false,expiresAt:new Date(session.expires).toISOString(),retryAfterSeconds:attempts>=3?0:Math.ceil((session.expires-Date.now())/1000),attemptsRemaining:Math.max(0,3-attempts)};
    }
    if(initiate&&!session){const sent=await this.sendOtp(prisma,tenantId,actorId,input.cpf,input.phone);return sent.authorization;}
    return {status:session?'EXPIRED':'MISSING',ready:false,retryAfterSeconds:0};
  }
  static async verifyOtp(prisma: PrismaClient, tenantId: string, actorId: string, cpf: string, code: string) {
    const session = await this.session(prisma, tenantId, actorId, cpf);
    if (!session.data?.verificationToken || session.data.expires <= Date.now()) throw new Error('Solicite um novo código de autorização.');
    const data = await cltBankOnce(prisma,tenantId,'bmg',['VERIFY_OTP',actorId,cpf,session.data.expires,createHash('sha256').update(code).digest('hex')],async()=>{await consumeOtpAttempt(prisma,tenantId,actorId,cpf,session.data.expires);return this.request(prisma, tenantId, 'POST', '/v1/sms/validar', { celular: session.data.phone, codigo: code, verificationToken: session.data.verificationToken });});
    if (!data?.session_token) throw new Error('O código não foi validado pelo BMG.');
    await this.saveSession(prisma, tenantId, actorId, cpf, { phone: session.data.phone, token: data.session_token, expires: Date.now() + 1800000 });
    return { message: 'Cliente autorizado. Você pode consultar as ofertas.' };
  }
  static async offers(prisma: PrismaClient, tenantId: string, actorId: string, input: any) {
    const config = await this.config(prisma, tenantId); if (!config.enabled) return [];
    const session = await this.session(prisma, tenantId, actorId, input.cpf);
    if (!session.data?.token || session.data.expires <= Date.now()) return [{ provider: 'BMG', institution: 'BMG', state: 'PENDING', message: 'Autorize o cliente pelo código SMS do BMG para consultar as ofertas.' }];
    if (input.product === 'CLT') {
      const eligible = await this.request(prisma, tenantId, 'GET', '/v1/consignado-privado/elegibilidade?canal=WEBSERVICE', undefined, { cpf: input.cpf, 'session-token': session.data.token });
      if (eligible.elegivel !== true) return [{ provider: 'BMG', institution: 'BMG', state: 'PENDING', message: 'O BMG não retornou elegibilidade para este cliente.' }];
      const offers = await this.request(prisma, tenantId, 'POST', '/v1/consignado-privado/simulacao', { cpf: input.cpf, canalVenda: 'WEBSERVICE' });
      if (!Array.isArray(offers)) throw new Error('BMG não retornou as simulações CLT no formato documentado.');
      const valid = offers.filter(row => (typeof row.idSimulacao !== 'number' || Number.isSafeInteger(row.idSimulacao)) && /^\d{1,30}$/.test(String(row.idSimulacao)) && /^\d{8,14}$/.test(String(row.numeroInscricaoEmpregador)) && Number(row.valorSolicitadoEmprestimo) > 0 && Number(row.valorParcela) > 0 && Number.isInteger(Number(row.parcelas)) && Number(row.parcelas) > 0);
      const current = await this.session(prisma, tenantId, actorId, input.cpf);
      if (current.data?.token !== session.data.token) throw new Error('A autorização mudou durante a consulta. Consulte novamente.');
      await this.saveSession(prisma, tenantId, actorId, input.cpf, { ...current.data, cltOffers: valid });
      return valid.map(row => ({ provider: 'BMG', institution: 'BMG', state: 'OFFER', name: row.nomeEmpregador || 'Crédito do Trabalhador', amount: Number(row.valorSolicitadoEmprestimo), installment: Number(row.valorParcela), term: Number(row.parcelas), rate: Number(row.taxaJurosMes), simulationId: String(row.idSimulacao), employerDocument: String(row.numeroInscricaoEmpregador) }));
    }
    const query = input.birthDate ? `?dataNascimento=${encodeURIComponent(input.birthDate.split('-').reverse().join('/'))}` : '';
    const data = await this.request(prisma, tenantId, 'GET', `/v1/ofertas${query}`, undefined, { cpfCliente: input.cpf, 'session-token': session.data.token });
    if (data?.cliente?.cpf && String(data.cliente.cpf).replace(/\D/g, '') !== input.cpf) throw new Error('BMG retornou informações de outro CPF; a resposta não foi utilizada.');
    if (input.operation !== 'NEW') {
      if (!['REFIN', 'PORT', 'PORT_REFIN'].includes(input.operation)) throw new Error('Modalidade BMG inválida.');
      const amount = Number(input.bmgRequestedAmount || (input.mode === 'Liquid' || input.mode === 'AMOUNT' ? input.value : 0));
      if (!(amount > 0) || !input.bmgContract) throw new Error('Informe o contrato BMG e o valor liberado desejado para calcular esta modalidade.');
      const numeric = (value: string) => { if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Número de contrato ou matrícula fora do formato documentado pelo BMG.'); return Number(value); };
      const result = await this.request(prisma, tenantId, 'POST', '/v1/ofertas/simulacoes', { DocumentoUsuario: input.cpf, DataNascimentoUsuario: input.birthDate?.split('-').reverse().join('/'), CodigoEntidade: config.entityCode, ...(config.storeCode ? { CodigoLoja: Number(config.storeCode) } : {}), ...(config.channelCode ? { CodigoCanalVenda: Number(config.channelCode) } : {}), NumeroContrato: numeric(String(input.bmgContract)), ...(input.benefitNumber ? { Matricula: numeric(String(input.benefitNumber)) } : {}), QuantidadeParcelas: Number(input.term), ValorSolicitado: amount, ValorRenda: Number(input.income) || undefined });
      if (!Array.isArray(result)) throw new Error('BMG retornou um formato de simulação incompatível.');
      return result.flatMap(row => (row.simulacoes || []).map((condition: any) => ({ provider: 'BMG', institution: 'BMG', state: 'OFFER', name: row.descricaoProduto, code: String(row.codigoProduto), amount: Number(condition.valorLiquido), contractAmount: Number(condition.valorOriginal), installment: Number(condition.valorParcela), term: Number(condition.quantidadeParcelas), rate: Number(condition.taxaPercentualMensalContrato) }))).filter(row => row.amount > 0 && row.installment > 0 && row.term > 0);
    }
    const eligible = await this.request(prisma, tenantId, 'POST', '/v1/ofertas/elegiveis', { documentoUsuario: input.cpf, dataNascimentoUsuario: input.birthDate?.split('-').reverse().join('/'), ...(config.operatorCpf ? { cpfDigitador: config.operatorCpf } : {}), ...(config.storeCode ? { codigoLoja: config.storeCode } : {}), ...(config.channelCode ? { codigoCanal: Number(config.channelCode) } : {}), ...(input.benefitNumber && config.entityCode ? { filtros: [{ codigoEntidade: Number(config.entityCode), registro: String(input.benefitNumber), novaOferta: true }] } : {}), valorRenda: Number(input.income) || undefined });
    if (!Array.isArray(eligible)) throw new Error('BMG retornou ofertas elegíveis em um formato incompatível.');
    const rows = eligible.flatMap(row => (row.detalhes || []).filter((detail: any) => !input.benefitNumber || String(detail.registro) === String(input.benefitNumber)).filter((detail: any) => detail.dadosEmprestimo?.elegivel === true).map((detail: any) => ({ provider: 'BMG', institution: 'BMG', state: 'OFFER', name: row.descricao || 'Empréstimo INSS', code: String(row.codigoServicoExterno), amount: Number(detail.dadosEmprestimo.valorLiberado), installment: Number(detail.dadosEmprestimo.valorParcela), term: Number(detail.dadosEmprestimo.quantidadeParcelas) }))).filter(row => row.amount > 0 && row.installment > 0 && row.term > 0);
    return rows.length ? rows : [{ provider: 'BMG', institution: 'BMG', state: 'PENDING', message: 'BMG não retornou condições de empréstimo elegíveis para este benefício.' }];
  }
  static async cltQuote(prisma: PrismaClient, tenantId: string, actorId: string, cpf: string, simulationId: string) {
    const session = await this.session(prisma, tenantId, actorId, cpf);
    if (!session.data?.token || session.data.expires <= Date.now()) throw new Error('Autorize o cliente e consulte novamente a oferta CLT.');
    const quote = session.data.cltOffers?.find((row: any) => String(row.idSimulacao) === simulationId);
    if (!quote) throw new Error('Selecione uma oferta CLT retornada pelo BMG para este cliente.');
    return { quote, phone: String(session.data.phone) };
  }
  static async submission(prisma: PrismaClient, tenantId: string, simulationId: string) {
    const config = await this.config(prisma, tenantId);
    const configKey = `BMG_SUBMISSION:${createHash('sha256').update(`${config.environment}:${simulationId}`).digest('hex')}`;
    const row = await (await integrationConfigStore(prisma, tenantId, 'bmg')).findUnique({ where: { tenantId_configKey: { tenantId, configKey } } });
    return { configKey, data: row ? open(row.configValue) : null };
  }
  static async saveSubmission(prisma: PrismaClient, tenantId: string, configKey: string, data: any) {
    await (await integrationConfigStore(prisma, tenantId, 'bmg')).update({ where: { tenantId_configKey: { tenantId, configKey } }, data: { configValue: seal(data) } });
  }
  static async reserveSubmission(prisma: PrismaClient, tenantId: string, configKey: string, data: any) {
    try { await (await integrationConfigStore(prisma, tenantId, 'bmg')).create({ data: { tenantId, configKey, configValue: seal(data), isSecret: true } }); }
    catch (error: any) { if (error.code === 'P2002') throw new Error('Esta simulação já foi enviada. Consulte a proposta antes de tentar novamente.'); throw error; }
  }
}
