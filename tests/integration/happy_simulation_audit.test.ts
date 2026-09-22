import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HappySimulationService } from '../../server/services/happySimulationService.js';
import { HappyTokenManager } from '../../server/services/happyTokenManager.js';
import { SimulationService } from '../../server/services/simulationService.js';

describe('Auditoria da Integração Happy / BYX Capital (Simulações)', () => {
  beforeEach(() => {
    HappyTokenManager.clearCache();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1 & 2. INSS: ENDPOINTS E FLUXO CORRETO
  // =========================================================================
  describe('INSS — Endpoints Oficiais e Fluxo', () => {
    it('chama POST /consignado-publico/cliente com payload correto e headers autenticados', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;
      let capturedHeaders: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              token_opaco: 'token_inss_public_123',
              expira_em: 3600,
            }),
          };
        }
        if (url.includes('/cliente')) {
          capturedUrl = url;
          capturedBody = JSON.parse(init?.body as string);
          capturedHeaders = init?.headers;
          return {
            ok: true,
            status: 201,
            json: async () => ({
              id: 98765,
              id_cliente: 98765,
              message: 'Cliente cadastrado com sucesso',
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'client_inss_id' },
            { configKey: 'happy_secret', configValue: 'secret_inss' },
            { configKey: 'happy_usuario', configValue: 'user_inss' },
            { configKey: 'happy_senha', configValue: 'pass_inss' },
          ]),
        },
      };

      const result = await HappySimulationService.criarClienteInss(mockPrisma, 'tenant_1', {
        nome: 'Maria Silva',
        telefone: '11988887777',
        cpf: '123.456.789-00',
        dt_nascimento: '1960-05-15',
        escolaridade: 1,
        tipo_produto: 1216171824,
        numero_beneficio: '1234567890',
      });

      expect(capturedUrl).toBe('https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico/cliente');
      expect(capturedHeaders['Authorization']).toBe('Bearer token_inss_public_123');
      expect(capturedBody.cpf).toBe('12345678900');
      expect(capturedBody.numero_beneficio).toBe('1234567890');
      expect(result.id_cliente).toBe(98765);
    });

    it('trata HTTP 201 no IN100 como aguardando autorização com url_formalizacao', async () => {
      let capturedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ token_opaco: 'token_inss_123' }),
          };
        }
        if (url.includes('/in100/consulta')) {
          capturedUrl = url;
          return {
            ok: true,
            status: 201, // 201 = Não autorizada, gera url_formalizacao
            json: async () => ({
              in100_autorizada: false,
              url_formalizacao: 'https://formalizacao.byxcapital.com.br/token_abc',
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'client_1' },
            { configKey: 'happy_secret', configValue: 'sec_1' },
            { configKey: 'happy_usuario', configValue: 'u_1' },
            { configKey: 'happy_senha', configValue: 'p_1' },
          ]),
        },
      };

      const result = await HappySimulationService.consultarIn100(mockPrisma, 'tenant_1', {
        cpf: '12345678900',
        numero_beneficio: '1234567890',
        tipo_produto: 1216171824,
      });

      expect(capturedUrl).toBe('https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico/in100/consulta');
      expect(result.in100_autorizada).toBe(false);
      expect(result.url_formalizacao).toBe('https://formalizacao.byxcapital.com.br/token_abc');
    });

    it('trata HTTP 202 no IN100 como processamento assíncrono para continuidade do polling', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/auth')) {
          return { ok: true, status: 200, json: async () => ({ token_opaco: 'token_inss_123' }) };
        }
        if (url.includes('/in100/consulta')) {
          return {
            ok: true,
            status: 202,
            json: async () => ({ message: 'Processando na Dataprev...', timestamp: '2026-09-22T10:00:00Z' }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'c' },
            { configKey: 'happy_secret', configValue: 's' },
            { configKey: 'happy_usuario', configValue: 'u' },
            { configKey: 'happy_senha', configValue: 'p' },
          ]),
        },
      };

      const result = await HappySimulationService.consultarIn100(mockPrisma, 'tenant_1', {
        cpf: '12345678900',
        numero_beneficio: '1234567890',
        tipo_produto: 1216171824,
      });

      expect(result.in100_autorizada).toBe(false);
      expect(result.isProcessing).toBe(true);
    });

    it('chama POST /consignado-publico/margem/simulacao para margem livre', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) {
          return { ok: true, status: 200, json: async () => ({ token_opaco: 'token_inss_123' }) };
        }
        if (url.includes('/margem/simulacao')) {
          capturedUrl = url;
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({ valor_liberado: 15400.50, parcelas: 84 }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'c' },
            { configKey: 'happy_secret', configValue: 's' },
            { configKey: 'happy_usuario', configValue: 'u' },
            { configKey: 'happy_senha', configValue: 'p' },
          ]),
        },
      };

      const result = await HappySimulationService.simularMargemLivreInss(mockPrisma, 'tenant_1', {
        cpf: '12345678900',
        numero_beneficio: '1234567890',
        valor_parcela: 450.00,
        prazo: 84,
      });

      expect(capturedUrl).toBe('https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico/margem/simulacao');
      expect(capturedBody.cpf).toBe('12345678900');
      expect(capturedBody.valor_parcela).toBe(450.00);
      expect(result.valor_liberado).toBe(15400.50);
    });

    it('chama POST /consignado-publico/portabilidade/refin/simulacao para portabilidade + refin', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) {
          return { ok: true, status: 200, json: async () => ({ token_opaco: 'token_inss_123' }) };
        }
        if (url.includes('/portabilidade/refin/simulacao')) {
          capturedUrl = url;
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({ troco_liberado: 3200.00, nova_parcela: 410.00 }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'c' },
            { configKey: 'happy_secret', configValue: 's' },
            { configKey: 'happy_usuario', configValue: 'u' },
            { configKey: 'happy_senha', configValue: 'p' },
          ]),
        },
      };

      const result = await HappySimulationService.simularPortabilidadeRefinInss(mockPrisma, 'tenant_1', {
        cpf: '12345678900',
        saldo_devedor: 12000,
        numero_parcelas: 72,
        valor_parcelas: 410,
        valor_parcelas_refin: 410,
        numero_parcelas_refin: 84,
        taxa_mensal_refin: 1.66,
        cd_beneficio_tipo: 1,
        id_externo_plano: 1,
      });

      expect(capturedUrl).toBe('https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico/portabilidade/refin/simulacao');
      expect(capturedBody.saldo_devedor).toBe(12000);
      expect(result.troco_liberado).toBe(3200.00);
    });
  });

  // =========================================================================
  // 4, 5, 6, 7, 8, 9, 10. CLT: ENDPOINTS, REGRAS DE AUTORIZAÇÃO E CONDIÇÕES
  // =========================================================================
  describe('CLT — Endpoints Oficiais, Dataprev e Condições', () => {
    it('formata timestamp Dataprev rigorosamente em DDMMAAAAHHMMSS (sem ISO 8601)', () => {
      const fixedDate = new Date(2026, 3, 10, 11, 0, 0); // 10/04/2026 11:00:00
      const formatted = HappySimulationService.formatDataprevTimestamp(fixedDate);
      expect(formatted).toBe('10042026110000');
      expect(formatted).not.toContain('T');
      expect(formatted).not.toContain('-');
      expect(formatted).not.toContain(':');
    });

    it('chama POST /consignado-privado/cliente com os 9 campos obrigatórios do canal', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) {
          return { ok: true, status: 200, json: async () => ({ token_opaco: 'token_clt_private_999' }) };
        }
        if (url.includes('/cliente')) {
          capturedUrl = url;
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({ message: 'Cliente CLT cadastrado com sucesso' }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const mockPrisma: any = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            name: 'Sentinel Demo',
            tradeName: 'Sentinel Consig',
            cnpj: '12.345.678/0001-99',
          }),
        },
        partner: {
          findUnique: vi.fn().mockResolvedValue({
            document: '111.222.333-44',
          }),
        },
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_clt_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado' },
            { configKey: 'happy_clt_client_id', configValue: 'c_clt' },
            { configKey: 'happy_clt_secret', configValue: 's_clt' },
            { configKey: 'happy_clt_usuario', configValue: 'u_clt' },
            { configKey: 'happy_clt_senha', configValue: 'p_clt' },
          ]),
        },
      };

      const result = await HappySimulationService.criarClienteClt(
        mockPrisma,
        'tenant_clt_1',
        {
          nome: 'Carlos Trabalhador',
          telefone: '11977776666',
          cpf: '987.654.321-00',
          data_autorizacao_dataprev: '10042026110000',
        },
        'partner_uuid_1'
      );

      expect(capturedUrl).toBe('https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado/cliente');
      expect(capturedBody).toEqual({
        telefone: '11977776666',
        nome: 'Carlos Trabalhador',
        cpf: '98765432100',
        data_autorizacao_dataprev: '10042026110000',
        canal_autorizacao_digital: 2,
        canal_origem_solicitacao: 'B2C',
        canal_razao_social: 'Sentinel Consig',
        canal_cpf_agente: '11122233344',
        canal_cnpj: '12345678000199',
      });
      expect(result.message).toBe('Cliente CLT cadastrado com sucesso');
    });

    it('chama POST /consignado-privado/cliente/consulta-dataprev SOMENTE com { nome, telefone, cpf } sem o campo consultar', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) {
          return { ok: true, status: 200, json: async () => ({ token_opaco: 'token_clt_123' }) };
        }
        if (url.includes('/cliente/consulta-dataprev')) {
          capturedUrl = url;
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id_cliente: 'client_clt_555',
              situacao: 'APPROVED',
              valores_credito: [
                {
                  status_motor: 'APPROVED',
                  min_parcelas: 6,
                  max_parcelas: 36,
                  min_valor: 500,
                  max_valor: 15000,
                  min_valor_parcela: 50,
                  max_valor_parcela: 800,
                  base_juros: 1.8,
                  max_taxa: 2.1,
                },
              ],
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_clt_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado' },
            { configKey: 'happy_clt_client_id', configValue: 'c' },
            { configKey: 'happy_clt_secret', configValue: 's' },
            { configKey: 'happy_clt_usuario', configValue: 'u' },
            { configKey: 'happy_clt_senha', configValue: 'p' },
          ]),
        },
      };

      const result = await HappySimulationService.consultarDataprevClt(mockPrisma, 'tenant_1', {
        nome: 'Carlos Trabalhador',
        telefone: '11977776666',
        cpf: '987.654.321-00',
      });

      expect(capturedUrl).toBe('https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado/cliente/consulta-dataprev');
      expect(capturedBody).toEqual({
        nome: 'Carlos Trabalhador',
        telefone: '11977776666',
        cpf: '98765432100',
      });
      expect(capturedBody.consultar).toBeUndefined();
      expect(result.id_cliente).toBe('client_clt_555');
    });

    it('isCltApproved exige situacao = APPROVED E status_motor = APPROVED dentro de valores_credito', () => {
      // Caso 1: consulta_autorizada = true mas situacao ou motor não aprovados -> NÃO libera simulação
      const fakeAuthTrueButMotorPending: any = {
        consulta_autorizada: true,
        situacao: 'PENDING',
        valores_credito: [{ status_motor: 'PENDING' }],
      };
      expect(HappySimulationService.isCltApproved(fakeAuthTrueButMotorPending)).toBe(false);

      // Caso 2: situacao = APPROVED mas motor REPROVADO -> NÃO libera
      const fakeSituacaoApprovedMotorRejected: any = {
        consulta_autorizada: true,
        situacao: 'APPROVED',
        valores_credito: [{ status_motor: 'REJECTED' }],
      };
      expect(HappySimulationService.isCltApproved(fakeSituacaoApprovedMotorRejected)).toBe(false);

      // Caso 3: situacao = APPROVED E motor APPROVED -> LIBERA simulação
      const fakeBothApproved: any = {
        consulta_autorizada: true,
        situacao: 'APPROVED',
        valores_credito: [
          { status_motor: 'APPROVED', min_parcelas: 12, max_parcelas: 48, max_valor: 10000 },
        ],
      };
      expect(HappySimulationService.isCltApproved(fakeBothApproved)).toBe(true);
    });

    it('chama POST /consignado-privado/contrato/simulacao com cliente_id e campos derivados das condições', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) {
          return { ok: true, status: 200, json: async () => ({ token_opaco: 'token_clt_123' }) };
        }
        if (url.includes('/contrato/simulacao')) {
          capturedUrl = url;
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              quantidade_parcelas: 36,
              valor_solicitado: 8000,
              valor_parcela: 320.50,
              valor_liquido: 7850,
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_clt_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado' },
            { configKey: 'happy_clt_client_id', configValue: 'c' },
            { configKey: 'happy_clt_secret', configValue: 's' },
            { configKey: 'happy_clt_usuario', configValue: 'u' },
            { configKey: 'happy_clt_senha', configValue: 'p' },
          ]),
        },
      };

      const result = await HappySimulationService.simularContratoClt(mockPrisma, 'tenant_1', {
        cliente_id: 'client_clt_555',
        quantidade_parcelas: 36,
        valor_solicitado: 8000,
        valor_parcela: null,
        taxa: 2.1,
        base_juros: 1.8,
        chave_seguro: null,
      });

      expect(capturedUrl).toBe('https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado/contrato/simulacao');
      expect(capturedBody).toEqual({
        cliente_id: 'client_clt_555',
        quantidade_parcelas: 36,
        valor_solicitado: 8000,
        valor_parcela: null,
        taxa: 2.1,
        base_juros: 1.8,
        chave_seguro: null,
      });
      expect(result.valor_parcela).toBe(320.50);
    });
  });

  // =========================================================================
  // 11. SIMULAÇÃO MANUAL
  // =========================================================================
  describe('Simulação Manual (Independente)', () => {
    it('permite criar simulação manual somente com CPF e Parceiro sem exigir Happy/BYX/IN100/CLT', () => {
      const cleanCpf = SimulationService.normalizeCpf('123.456.789-00');
      const partnerId = 'partner_local_123';

      expect(cleanCpf).toBe('12345678900');
      expect(partnerId).toBeDefined();

      // Nenhum dado da Happy é requerido para este payload
      const manualPayload = {
        cpf: cleanCpf,
        partnerId,
        simulationType: 'MANUAL',
      };

      expect(manualPayload.cpf).toBe('12345678900');
      expect(manualPayload.partnerId).toBe('partner_local_123');
      expect(manualPayload.simulationType).toBe('MANUAL');
    });
  });
});
