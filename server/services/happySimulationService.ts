import { PrismaClient } from '@prisma/client';
import {
  HappyNamespace,
  HappyInssClienteRequest,
  HappyInssIn100ConsultaRequest,
  HappyInssIn100Response,
  HappyInssMargemSimulacaoRequest,
  HappyInssPortabilidadeRefinRequest,
  HappyCltClienteRequest,
  HappyCltDataprevConsultaRequest,
  HappyCltDataprevResponse,
  HappyCltSimulacaoRequest,
  HappyCltSimulacaoResponse,
} from './happyBankTypes.js';
import { HappyTokenManager } from './happyTokenManager.js';
import { logger } from '../logger.js';

/**
 * Serviço especializado para a Central de Simulações Happy (INSS e CLT).
 * 
 * Regras mandatórias:
 * - INSS utiliza consignado-publico
 * - CLT utiliza consignado-privado
 * - NUNCA misturar namespaces
 * - NUNCA logar tokens, senhas ou segredos
 * - Estrito isolamento multi-tenant
 * - Tratamento gracioso de erros de API
 */
export class HappySimulationService {
  /**
   * Formata data no padrão Dataprev DDMMAAAAHHMMSS
   */
  public static formatDataprevTimestamp(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = String(date.getFullYear());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${day}${month}${year}${hours}${minutes}${seconds}`;
  }

  /**
   * Obtém headers autenticados para as chamadas da Happy
   */
  private static async getHeaders(
    prisma: PrismaClient,
    tenantId: string,
    namespace: HappyNamespace
  ): Promise<{ headers: Record<string, string>; baseUrl: string }> {
    const token = await HappyTokenManager.getValidToken(prisma, tenantId, false, undefined, namespace);

    // Buscar configs do tenant para cabeçalhos operacionais
    const configKeys = [
      'happy_base_url',
      'happy_cpf_digitador',
      'happy_correspondente_banqueiro',
      'happy_clt_base_url',
      'happy_clt_cpf_digitador',
      'happy_clt_correspondente_banqueiro',
    ];

    const configs = await prisma.systemConfig.findMany({
      where: {
        tenantId,
        configKey: { in: configKeys },
      },
    });

    const map = new Map(configs.map((c) => [c.configKey, c.configValue]));

    let baseUrl = '';
    let cpfDigitador = '';
    let correspondenteBanqueiro = '';

    if (namespace === 'private') {
      baseUrl =
        map.get('happy_clt_base_url') ||
        process.env.HAPPY_CLT_BASE_URL ||
        'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado';
      cpfDigitador =
        map.get('happy_clt_cpf_digitador') ||
        map.get('happy_cpf_digitador') ||
        process.env.HAPPY_CPF_DIGITADOR ||
        '';
      correspondenteBanqueiro =
        map.get('happy_clt_correspondente_banqueiro') ||
        map.get('happy_correspondente_banqueiro') ||
        process.env.HAPPY_CORRESPONDENTE_BANQUEIRO ||
        '';
    } else {
      baseUrl =
        map.get('happy_base_url') ||
        process.env.HAPPY_BASE_URL ||
        'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico';
      cpfDigitador = map.get('happy_cpf_digitador') || process.env.HAPPY_CPF_DIGITADOR || '';
      correspondenteBanqueiro =
        map.get('happy_correspondente_banqueiro') ||
        process.env.HAPPY_CORRESPONDENTE_BANQUEIRO ||
        '';
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (cpfDigitador) {
      headers['cpf-digitador'] = cpfDigitador.replace(/\D/g, '');
    }
    if (correspondenteBanqueiro) {
      headers['x-correspondente-banqueiro'] = correspondenteBanqueiro;
    }

    return { headers, baseUrl: baseUrl.replace(/\/+$/, '') };
  }

  // =========================================================================
  // FLUXO 2 — HAPPY INSS (consignado-publico)
  // =========================================================================

  /**
   * Cria o cliente INSS na Happy.
   * Retorna o id_cliente gerado pela BYX Capital.
   */
  public static async criarClienteInss(
    prisma: PrismaClient,
    tenantId: string,
    data: HappyInssClienteRequest
  ): Promise<{ id_cliente: number | string; raw: any }> {
    const cleanCpf = data.cpf.replace(/\D/g, '');
    const cleanBeneficio = (data.numero_beneficio || '').replace(/\D/g, '');

    if (cleanBeneficio.length !== 10) {
      throw new Error('O número do benefício INSS deve conter exatamente 10 dígitos numéricos.');
    }

    const { headers, baseUrl } = await this.getHeaders(prisma, tenantId, 'public');
    const url = `${baseUrl}/cliente`;

    const body = {
      nome: data.nome.trim(),
      telefone: data.telefone.replace(/\D/g, ''),
      cpf: cleanCpf,
      dt_nascimento: data.dt_nascimento,
      escolaridade: Number(data.escolaridade) || 1,
      tipo_produto: Number(data.tipo_produto) || 1216171824,
      numero_beneficio: cleanBeneficio,
      ...(data.representante_legal !== undefined ? { representante_legal: data.representante_legal } : {}),
      ...(data.rogado !== undefined ? { rogado: data.rogado } : {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errDetail = parsed.message || parsed.error || errText;
      } catch {}
      throw new Error(`Erro ao cadastrar cliente INSS na Happy (HTTP ${response.status}): ${errDetail}`);
    }

    const resJson = await response.json();
    const idCliente = resJson.id || resJson.id_cliente;

    if (!idCliente) {
      throw new Error('A API Happy respondeu com sucesso mas não retornou o ID do cliente gerado.');
    }

    return { id_cliente: idCliente, raw: resJson };
  }

  /**
   * Consulta IN100 no consignado-publico.
   * Trata 200 (autorizada), 201 (não autorizada com url_formalizacao), 202 (processamento).
   */
  public static async consultarIn100(
    prisma: PrismaClient,
    tenantId: string,
    data: HappyInssIn100ConsultaRequest
  ): Promise<HappyInssIn100Response> {
    const cleanCpf = data.cpf.replace(/\D/g, '');
    const cleanBeneficio = (data.numero_beneficio || '').replace(/\D/g, '');

    const { headers, baseUrl } = await this.getHeaders(prisma, tenantId, 'public');
    const url = `${baseUrl}/in100/consulta`;

    const body = {
      cpf: cleanCpf,
      numero_beneficio: cleanBeneficio,
      tipo_produto: Number(data.tipo_produto) || 1216171824,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // 201 Created: Não autorizada, retorna link de formalização
    if (response.status === 201) {
      const resJson = await response.json();
      return {
        in100_autorizada: false,
        url_formalizacao: resJson.url_formalizacao || resJson.url_consulta_autorizacao || '',
        message: 'Aguardando autorização IN100 pelo cliente',
        ...resJson,
      };
    }

    // 202 Accepted: Processamento assíncrono em andamento
    if (response.status === 202) {
      const resJson = await response.json().catch(() => ({}));
      return {
        in100_autorizada: false,
        isProcessing: true,
        message: resJson.message || 'Processando consulta IN100 na Dataprev/Previdência...',
        timestamp: resJson.timestamp,
      };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errDetail = parsed.message || parsed.error || errText;
      } catch {}
      throw new Error(`Erro na consulta IN100 Happy (HTTP ${response.status}): ${errDetail}`);
    }

    const resJson = await response.json();

    // Se retornou objeto de sucesso com dados de margem
    const autorizada = resJson.retornou_in100 === true || resJson.in100_autorizada === true || Boolean(resJson.valor_margem !== undefined);

    return {
      in100_autorizada: autorizada,
      ...resJson,
    };
  }

  /**
   * Simulação INSS Margem Livre
   */
  public static async simularMargemLivreInss(
    prisma: PrismaClient,
    tenantId: string,
    data: HappyInssMargemSimulacaoRequest
  ): Promise<any> {
    const { headers, baseUrl } = await this.getHeaders(prisma, tenantId, 'public');
    const url = `${baseUrl}/margem/simulacao`;

    const body = {
      cpf: data.cpf.replace(/\D/g, ''),
      ...(data.numero_beneficio ? { numero_beneficio: data.numero_beneficio.replace(/\D/g, '') } : {}),
      ...(data.valor_parcela ? { valor_parcela: Number(data.valor_parcela) } : {}),
      ...(data.prazo ? { prazo: Number(data.prazo) } : {}),
      ...(data.tipo_produto ? { tipo_produto: Number(data.tipo_produto) } : {}),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errDetail = parsed.message || parsed.error || errText;
      } catch {}
      throw new Error(`Erro ao simular margem livre INSS (HTTP ${response.status}): ${errDetail}`);
    }

    return response.json();
  }

  /**
   * Simulação INSS Portabilidade + Refinanciamento
   */
  public static async simularPortabilidadeRefinInss(
    prisma: PrismaClient,
    tenantId: string,
    data: HappyInssPortabilidadeRefinRequest
  ): Promise<any> {
    const { headers, baseUrl } = await this.getHeaders(prisma, tenantId, 'public');
    const url = `${baseUrl}/portabilidade/refin/simulacao`;

    const body = {
      cpf: data.cpf.replace(/\D/g, ''),
      saldo_devedor: Number(data.saldo_devedor),
      numero_parcelas: Number(data.numero_parcelas),
      valor_parcelas: Number(data.valor_parcelas),
      valor_parcelas_refin: Number(data.valor_parcelas_refin),
      numero_parcelas_refin: Number(data.numero_parcelas_refin),
      taxa_mensal_refin: Number(data.taxa_mensal_refin),
      cd_beneficio_tipo: Number(data.cd_beneficio_tipo),
      id_externo_plano: data.id_externo_plano,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errDetail = parsed.message || parsed.error || errText;
      } catch {}
      throw new Error(`Erro ao simular portabilidade + refin INSS (HTTP ${response.status}): ${errDetail}`);
    }

    return response.json();
  }

  // =========================================================================
  // FLUXO 3 — HAPPY CONSIGNADO PRIVADO (CLT) (consignado-privado)
  // =========================================================================

  /**
   * Cria o cliente CLT no consignado-privado
   */
  public static async criarClienteClt(
    prisma: PrismaClient,
    tenantId: string,
    data: Partial<HappyCltClienteRequest> & { cpf: string; nome: string; telefone: string },
    partnerId?: string
  ): Promise<{ message: string; timestamp?: string }> {
    const { headers, baseUrl } = await this.getHeaders(prisma, tenantId, 'private');
    const url = `${baseUrl}/cliente`;

    // Deriva dados do canal a partir do contexto do Tenant e Partner
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, tradeName: true, cnpj: true },
    });

    let canalCpfAgente = (data.canal_cpf_agente || '').replace(/\D/g, '');
    let canalRazaoSocial = data.canal_razao_social || tenant?.tradeName || tenant?.name || 'SENTINEL CONSIG';
    let canalCnpj = (data.canal_cnpj || tenant?.cnpj || '').replace(/\D/g, '');

    if (!canalCpfAgente && partnerId) {
      const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { document: true },
      });
      if (partner?.document) {
        canalCpfAgente = partner.document.replace(/\D/g, '');
      }
    }

    // Se ainda não tiver canalCpfAgente, tenta buscar de SystemConfig
    if (!canalCpfAgente) {
      const cfg = await prisma.systemConfig.findUnique({
        where: { tenantId_configKey: { tenantId, configKey: 'happy_cpf_digitador' } },
      });
      if (cfg?.configValue) {
        canalCpfAgente = cfg.configValue.replace(/\D/g, '');
      }
    }

    const dataAutorizacao = data.data_autorizacao_dataprev || this.formatDataprevTimestamp();

    const body: HappyCltClienteRequest = {
      telefone: data.telefone.replace(/\D/g, ''),
      nome: data.nome.trim(),
      cpf: data.cpf.replace(/\D/g, ''),
      data_autorizacao_dataprev: dataAutorizacao,
      canal_autorizacao_digital: Number(data.canal_autorizacao_digital) || 2,
      canal_origem_solicitacao: data.canal_origem_solicitacao || 'B2C',
      canal_razao_social: canalRazaoSocial,
      canal_cpf_agente: canalCpfAgente || '00000000000',
      canal_cnpj: canalCnpj || '00000000000000',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errDetail = parsed.message || parsed.error || errText;
      } catch {}
      throw new Error(`Erro ao cadastrar cliente CLT na Happy (HTTP ${response.status}): ${errDetail}`);
    }

    const resJson = await response.json();
    return {
      message: resJson.message || 'Dados processados com sucesso.',
      timestamp: resJson.timestamp,
    };
  }

  /**
   * Consulta Dataprev CLT
   * Importante: NÃO enviar o campo "consultar". Apenas { nome, telefone, cpf }.
   */
  public static async consultarDataprevClt(
    prisma: PrismaClient,
    tenantId: string,
    data: HappyCltDataprevConsultaRequest
  ): Promise<HappyCltDataprevResponse> {
    const { headers, baseUrl } = await this.getHeaders(prisma, tenantId, 'private');
    const url = `${baseUrl}/cliente/consulta-dataprev`;

    const body = {
      nome: data.nome.trim(),
      telefone: data.telefone.replace(/\D/g, ''),
      cpf: data.cpf.replace(/\D/g, ''),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errDetail = parsed.message || parsed.error || errText;
      } catch {}
      throw new Error(`Erro na consulta Dataprev CLT (HTTP ${response.status}): ${errDetail}`);
    }

    const resJson: HappyCltDataprevResponse = await response.json();
    return resJson;
  }

  /**
   * Verifica se a simulação CLT pode ser liberada segundo as regras de aprovação:
   * situacao === 'APPROVED' e pelo menos uma condição em valores_credito com status_motor === 'APPROVED'.
   */
  public static isCltApproved(res: HappyCltDataprevResponse): boolean {
    if (!res) return false;
    const situacaoOk = String(res.situacao || '').toUpperCase() === 'APPROVED';
    const condicoesOk =
      Array.isArray(res.valores_credito) &&
      res.valores_credito.some((c) => String(c.status_motor || '').toUpperCase() === 'APPROVED');
    return situacaoOk && condicoesOk;
  }

  /**
   * Executa Simulação de Contrato CLT
   */
  public static async simularContratoClt(
    prisma: PrismaClient,
    tenantId: string,
    data: HappyCltSimulacaoRequest
  ): Promise<HappyCltSimulacaoResponse> {
    const { headers, baseUrl } = await this.getHeaders(prisma, tenantId, 'private');
    const url = `${baseUrl}/contrato/simulacao`;

    if (!data.cliente_id) {
      throw new Error('O ID do cliente (retornado pela Dataprev) é obrigatório para a simulação CLT.');
    }

    const body: Record<string, any> = {
      cliente_id: data.cliente_id,
      quantidade_parcelas: Number(data.quantidade_parcelas),
      valor_solicitado: data.valor_solicitado !== undefined && data.valor_solicitado !== null ? Number(data.valor_solicitado) : null,
      valor_parcela: data.valor_parcela !== undefined && data.valor_parcela !== null ? Number(data.valor_parcela) : null,
      taxa: data.taxa !== undefined && data.taxa !== null ? Number(data.taxa) : null,
      base_juros: data.base_juros !== undefined && data.base_juros !== null ? Number(data.base_juros) : null,
      chave_seguro: data.chave_seguro || null,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errDetail = parsed.message || parsed.error || errText;
      } catch {}
      throw new Error(`Erro ao simular contrato CLT (HTTP ${response.status}): ${errDetail}`);
    }

    return response.json();
  }
}
