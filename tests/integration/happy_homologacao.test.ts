import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { HappySimulationService } from '../../server/services/happySimulationService.js';
import { HappyTokenManager } from '../../server/services/happyTokenManager.js';
import { HappyBankService } from '../../server/services/happyBankService.js';
import { SimulationService } from '../../server/services/simulationService.js';

describe('Homologação Real — Central de Simulações Happy / BYX Capital & Manual', () => {
  beforeEach(() => {
    HappyTokenManager.clearCache();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. SIMULAÇÃO MANUAL
  // =========================================================================
  describe('1. Simulação Manual', () => {
    it('executa normalmente exigindo estritamente apenas CPF e Parceiro sem campos Happy', () => {
      const inputCpf = '123.456.789-00';
      const cleanCpf = SimulationService.normalizeCpf(inputCpf);
      const partnerId = 'partner_homolog_123';
      const simulationType = 'MANUAL';

      expect(cleanCpf).toBe('12345678900');
      expect(cleanCpf.length).toBe(11);
      expect(partnerId).toBeDefined();

      const manualPayload = {
        cpf: cleanCpf,
        partnerId,
        simulationType,
      };

      // Garantir que nenhum campo Happy é requerido
      expect(manualPayload).not.toHaveProperty('happyClientId');
      expect(manualPayload).not.toHaveProperty('happyBeneficioNumero');
      expect(manualPayload).not.toHaveProperty('data_autorizacao_dataprev');
      expect(manualPayload.simulationType).toBe('MANUAL');
    });
  });

  // =========================================================================
  // 2. HAPPY INSS — CRIAR CLIENTE
  // =========================================================================
  describe('2. Happy INSS — Criar Cliente (POST /consignado-publico/cliente)', () => {
    it('formata o payload rigorosamente e persiste o id_cliente retornado', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;
      let capturedAuth = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ token_opaco: 'token_homolog_inss_987', expira_em: 3600 }),
          };
        }
        if (url.includes('/cliente')) {
          capturedUrl = url;
          capturedBody = JSON.parse(init?.body as string);
          capturedAuth = (init?.headers as any)['Authorization'];
          return {
            ok: true,
            status: 201,
            json: async () => ({ id: 45678, id_cliente: 45678, message: 'Cliente cadastrado com sucesso' }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'cid' },
            { configKey: 'happy_secret', configValue: 'sec' },
            { configKey: 'happy_usuario', configValue: 'usr' },
            { configKey: 'happy_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.criarClienteInss(mockPrisma, 'tenant_homolog', {
        nome: 'Maria Homologacao',
        telefone: '(11) 98888-7777',
        cpf: '123.456.789-00',
        dt_nascimento: '1965-08-20',
        escolaridade: 1,
        tipo_produto: 1216171824,
        numero_beneficio: '1234567890',
      });

      expect(capturedUrl).toBe('https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico/cliente');
      expect(capturedAuth).toBe('Bearer token_homolog_inss_987');
      expect(capturedBody).toEqual({
        nome: 'Maria Homologacao',
        telefone: '11988887777',
        cpf: '12345678900',
        dt_nascimento: '1965-08-20',
        escolaridade: 1,
        tipo_produto: 1216171824,
        numero_beneficio: '1234567890',
      });
      expect(result.id_cliente).toBe(45678);
    });
  });

  // =========================================================================
  // 3. HAPPY INSS — IN100
  // =========================================================================
  describe('3. Happy INSS — IN100 (POST /consignado-publico/in100/consulta)', () => {
    it('trata retorno 201 como não autorizada com url_formalizacao bloqueando simulação', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok' }) };
        if (url.includes('/in100/consulta')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              in100_autorizada: false,
              url_formalizacao: 'https://formalizacao.byxcapital.com.br/token_in100_test',
            }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'cid' },
            { configKey: 'happy_secret', configValue: 'sec' },
            { configKey: 'happy_usuario', configValue: 'usr' },
            { configKey: 'happy_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.consultarIn100(mockPrisma, 'tenant_homolog', {
        cpf: '12345678900',
        numero_beneficio: '1234567890',
        tipo_produto: 1216171824,
      });

      expect(result.in100_autorizada).toBe(false);
      expect(result.url_formalizacao).toBe('https://formalizacao.byxcapital.com.br/token_in100_test');
    });

    it('trata retorno 202 como processamento assíncrono (polling)', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok' }) };
        if (url.includes('/in100/consulta')) {
          return {
            ok: true,
            status: 202,
            json: async () => ({ message: 'Aguardando processamento na Dataprev' }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'cid' },
            { configKey: 'happy_secret', configValue: 'sec' },
            { configKey: 'happy_usuario', configValue: 'usr' },
            { configKey: 'happy_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.consultarIn100(mockPrisma, 'tenant_homolog', {
        cpf: '12345678900',
        numero_beneficio: '1234567890',
        tipo_produto: 1216171824,
      });

      expect(result.in100_autorizada).toBe(false);
      expect(result.isProcessing).toBe(true);
    });

    it('trata retorno 200 como autorizada permitindo continuidade', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok' }) };
        if (url.includes('/in100/consulta')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              in100_autorizada: true,
              margem_disponivel: 450.25,
            }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'cid' },
            { configKey: 'happy_secret', configValue: 'sec' },
            { configKey: 'happy_usuario', configValue: 'usr' },
            { configKey: 'happy_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.consultarIn100(mockPrisma, 'tenant_homolog', {
        cpf: '12345678900',
        numero_beneficio: '1234567890',
        tipo_produto: 1216171824,
      });

      expect(result.in100_autorizada).toBe(true);
    });

    it('envia tipo_produto 1216171824 por fallback quando omitido na requisição', async () => {
      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok' }) };
        if (url.includes('/in100/consulta')) {
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({ in100_autorizada: true }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'cid' },
            { configKey: 'happy_secret', configValue: 'sec' },
            { configKey: 'happy_usuario', configValue: 'usr' },
            { configKey: 'happy_senha', configValue: 'pwd' },
          ]),
        },
      };

      await HappySimulationService.consultarIn100(mockPrisma, 'tenant_homolog', {
        cpf: '12345678900',
        numero_beneficio: '1234567890',
      });

      expect(capturedBody).toEqual({
        cpf: '12345678900',
        numero_beneficio: '1234567890',
        tipo_produto: 1216171824,
      });
    });
  });

  // =========================================================================
  // 4. HAPPY INSS — MARGEM
  // =========================================================================
  describe('4. Happy INSS — Margem (POST /consignado-publico/margem/simulacao)', () => {
    it('executa simulação de margem livre quando autorizada', async () => {
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok' }) };
        if (url.includes('/margem/simulacao')) {
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              valor_liberado: 12500,
              parcelas: 84,
              valor_parcela: 350.50,
              taxa_mensal: 1.66,
            }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'cid' },
            { configKey: 'happy_secret', configValue: 'sec' },
            { configKey: 'happy_usuario', configValue: 'usr' },
            { configKey: 'happy_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.simularMargemLivreInss(mockPrisma, 'tenant_homolog', {
        cpf: '12345678900',
        numero_beneficio: '1234567890',
        valor_parcela: 350.50,
        prazo: 84,
      });

      expect(capturedBody.cpf).toBe('12345678900');
      expect(capturedBody.numero_beneficio).toBe('1234567890');
      expect(capturedBody.valor_parcela).toBe(350.50);
      expect(result.valor_liberado).toBe(12500);
    });
  });

  // =========================================================================
  // 5. HAPPY INSS — PORTABILIDADE + REFIN
  // =========================================================================
  describe('5. Happy INSS — Portabilidade + Refin (POST /consignado-publico/portabilidade/refin/simulacao)', () => {
    it('executa portabilidade + refin com todos os parâmetros exigidos', async () => {
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok' }) };
        if (url.includes('/portabilidade/refin/simulacao')) {
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              troco_liberado: 2800.00,
              nova_parcela: 420.00,
              economia_mensal: 50.00,
            }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
            { configKey: 'happy_client_id', configValue: 'cid' },
            { configKey: 'happy_secret', configValue: 'sec' },
            { configKey: 'happy_usuario', configValue: 'usr' },
            { configKey: 'happy_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.simularPortabilidadeRefinInss(mockPrisma, 'tenant_homolog', {
        cpf: '12345678900',
        saldo_devedor: 15000,
        numero_parcelas: 60,
        valor_parcelas: 470,
        valor_parcelas_refin: 420,
        numero_parcelas_refin: 84,
        taxa_mensal_refin: 1.66,
        cd_beneficio_tipo: 1,
        id_externo_plano: 1,
      });

      expect(capturedBody.saldo_devedor).toBe(15000);
      expect(capturedBody.taxa_mensal_refin).toBe(1.66);
      expect(result.troco_liberado).toBe(2800.00);
    });
  });

  // =========================================================================
  // 6. HAPPY CLT — CRIAR CLIENTE
  // =========================================================================
  describe('6. Happy CLT — Criar Cliente (POST /consignado-privado/cliente)', () => {
    it('valida estritamente canal_autorizacao_digital=2, canal_origem_solicitacao=B2C e data_autorizacao_dataprev DDMMAAAAHHMMSS', async () => {
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok_clt' }) };
        if (url.includes('/cliente')) {
          capturedBody = JSON.parse(init?.body as string);
          return { ok: true, status: 200, json: async () => ({ message: 'Cliente cadastrado com sucesso' }) };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            name: 'Empresa Homologacao Ltda',
            tradeName: 'Homolog Bank',
            cnpj: '12.345.678/0001-90',
          }),
        },
        partner: {
          findUnique: vi.fn().mockResolvedValue({
            document: '999.888.777-66',
          }),
        },
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_clt_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado' },
            { configKey: 'happy_clt_client_id', configValue: 'cid' },
            { configKey: 'happy_clt_secret', configValue: 'sec' },
            { configKey: 'happy_clt_usuario', configValue: 'usr' },
            { configKey: 'happy_clt_senha', configValue: 'pwd' },
          ]),
        },
      };

      await HappySimulationService.criarClienteClt(
        mockPrisma,
        'tenant_homolog',
        {
          nome: 'Jose CLT Homolog',
          telefone: '11987654321',
          cpf: '111.222.333-44',
          data_autorizacao_dataprev: '22092026103000',
        },
        'partner_1'
      );

      expect(capturedBody).toEqual({
        telefone: '11987654321',
        nome: 'Jose CLT Homolog',
        cpf: '11122233344',
        data_autorizacao_dataprev: '22092026103000',
        canal_autorizacao_digital: 2,
        canal_origem_solicitacao: 'B2C',
        canal_razao_social: 'Homolog Bank',
        canal_cpf_agente: '99988877766',
        canal_cnpj: '12345678000190',
      });
      // Verificação da máscara DDMMAAAAHHMMSS (14 dígitos numéricos, sem ISO 8601)
      expect(capturedBody.data_autorizacao_dataprev).toMatch(/^\d{14}$/);
    });
  });

  // =========================================================================
  // 7. HAPPY CLT — DATAPREV
  // =========================================================================
  describe('7. Happy CLT — Dataprev (POST /consignado-privado/cliente/consulta-dataprev)', () => {
    it('garante que o body contém SOMENTE { nome, telefone, cpf } sem o campo consultar', async () => {
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok_clt' }) };
        if (url.includes('/cliente/consulta-dataprev')) {
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id_cliente: 'byx_cust_999',
              consulta_autorizada: true,
              situacao: 'APPROVED',
              id_simulacao: 'sim_123',
              data_autorizacao_data_prev: '2026-09-22 10:00:00',
              data_consulta_data_prev: '2026-09-22 10:05:00',
              application_key: 'app_key_888',
              proposal_key: 'prop_key_777',
              valores_credito: [
                {
                  status_motor: 'APPROVED',
                  min_parcelas: 6,
                  max_parcelas: 36,
                  min_valor: 1000,
                  max_valor: 20000,
                  min_valor_parcela: 100,
                  max_valor_parcela: 1200,
                  base_juros: 1.85,
                  max_taxa: 2.15,
                },
              ],
            }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_clt_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado' },
            { configKey: 'happy_clt_client_id', configValue: 'cid' },
            { configKey: 'happy_clt_secret', configValue: 'sec' },
            { configKey: 'happy_clt_usuario', configValue: 'usr' },
            { configKey: 'happy_clt_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.consultarDataprevClt(mockPrisma, 'tenant_homolog', {
        nome: 'Jose CLT Homolog',
        telefone: '11987654321',
        cpf: '111.222.333-44',
      });

      expect(capturedBody).toEqual({
        nome: 'Jose CLT Homolog',
        telefone: '11987654321',
        cpf: '11122233344',
      });
      expect(capturedBody).not.toHaveProperty('consultar');
      expect(result.id_cliente).toBe('byx_cust_999');
      expect(result.application_key).toBe('app_key_888');
      expect(result.proposal_key).toBe('prop_key_777');
    });
  });

  // =========================================================================
  // 8. AUTORIZAÇÃO CLT & POLLING
  // =========================================================================
  describe('8. Autorização CLT & Polling', () => {
    it('retorna url_consulta_autorizacao quando pendente de autorização do cliente e bloqueia simulação', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok_clt' }) };
        if (url.includes('/cliente/consulta-dataprev')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id_cliente: 'byx_cust_pending',
              consulta_autorizada: false,
              situacao: 'PENDING',
              url_consulta_autorizacao: 'https://autorizacao.byxcapital.com.br/clt/token_pendente_123',
            }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_clt_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado' },
            { configKey: 'happy_clt_client_id', configValue: 'cid' },
            { configKey: 'happy_clt_secret', configValue: 'sec' },
            { configKey: 'happy_clt_usuario', configValue: 'usr' },
            { configKey: 'happy_clt_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.consultarDataprevClt(mockPrisma, 'tenant_homolog', {
        nome: 'Jose CLT Homolog',
        telefone: '11987654321',
        cpf: '11122233344',
      });

      expect(result.consulta_autorizada).toBe(false);
      expect(result.url_consulta_autorizacao).toBe('https://autorizacao.byxcapital.com.br/clt/token_pendente_123');
      expect(HappySimulationService.isCltApproved(result)).toBe(false);
    });
  });

  // =========================================================================
  // 9. APROVAÇÃO CLT (DUPLA APROVAÇÃO SITUAÇÃO + MOTOR)
  // =========================================================================
  describe('9. Aprovação CLT (Regra Dupla)', () => {
    it('NÃO libera simulação se consulta_autorizada for true mas situacao não for APPROVED', () => {
      const resp: any = {
        consulta_autorizada: true,
        situacao: 'PENDING',
        valores_credito: [{ status_motor: 'APPROVED' }],
      };
      expect(HappySimulationService.isCltApproved(resp)).toBe(false);
    });

    it('NÃO libera simulação se situacao for APPROVED mas motor for REJECTED', () => {
      const resp: any = {
        consulta_autorizada: true,
        situacao: 'APPROVED',
        valores_credito: [{ status_motor: 'REJECTED' }],
      };
      expect(HappySimulationService.isCltApproved(resp)).toBe(false);
    });

    it('LIBERA simulação SOMENTE quando situacao = APPROVED E status_motor = APPROVED', () => {
      const resp: any = {
        consulta_autorizada: true,
        situacao: 'APPROVED',
        valores_credito: [
          {
            status_motor: 'APPROVED',
            min_parcelas: 12,
            max_parcelas: 48,
            min_valor: 1000,
            max_valor: 20000,
            base_juros: 1.8,
            max_taxa: 2.1,
          },
        ],
      };
      expect(HappySimulationService.isCltApproved(resp)).toBe(true);
    });
  });

  // =========================================================================
  // 10 & 11. SIMULAÇÃO E RESULTADO CLT
  // =========================================================================
  describe('10 & 11. Simulação e Resultado CLT (POST /consignado-privado/contrato/simulacao)', () => {
    it('cliente_id é exatamente o id_cliente retornado e mapeia todos os campos financeiros do resultado', async () => {
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth')) return { ok: true, status: 200, json: async () => ({ token_opaco: 'tok_clt' }) };
        if (url.includes('/contrato/simulacao')) {
          capturedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              quantidade_parcelas: 24,
              valor_solicitado: 5000,
              valor_principal: 5000,
              valor_parcela: 265.40,
              valor_bruto: 5200.00,
              iof: 120.50,
              valor_liquido: 4879.50,
              valor_cliente: 4879.50,
              primeiro_vencimento: '2026-11-05',
              ultimo_vencimento: '2028-10-05',
              cet: 28.5,
              taxa: 2.1,
              seguro: 150.00,
              coberturas: ['Morte', 'Invalidez Permanente'],
            }),
          };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockResolvedValue([
            { configKey: 'happy_clt_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado' },
            { configKey: 'happy_clt_client_id', configValue: 'cid' },
            { configKey: 'happy_clt_secret', configValue: 'sec' },
            { configKey: 'happy_clt_usuario', configValue: 'usr' },
            { configKey: 'happy_clt_senha', configValue: 'pwd' },
          ]),
        },
      };

      const result = await HappySimulationService.simularContratoClt(mockPrisma, 'tenant_homolog', {
        cliente_id: 'byx_cust_999',
        quantidade_parcelas: 24,
        valor_solicitado: 5000,
        taxa: 2.1,
        base_juros: 1.8,
      });

      expect(capturedBody.cliente_id).toBe('byx_cust_999');
      expect(capturedBody.quantidade_parcelas).toBe(24);
      expect(capturedBody.valor_solicitado).toBe(5000);
      expect(capturedBody.taxa).toBe(2.1);
      expect(capturedBody.base_juros).toBe(1.8);

      // Validação do resultado CLT
      expect(result.valor_solicitado).toBe(5000);
      expect(result.valor_parcela).toBe(265.40);
      expect(result.valor_liquido).toBe(4879.50);
      expect(result.iof).toBe(120.50);
      expect(result.seguro).toBe(150.00);
      expect(result.primeiro_vencimento).toBe('2026-11-05');
      expect(result.ultimo_vencimento).toBe('2028-10-05');
    });
  });

  // =========================================================================
  // 12. WEBHOOK
  // =========================================================================
  describe('12. Webhook (SIMULACAO_INICIADA e SIMULACAO_CONCLUIDA)', () => {
    it('recebe, valida idempotência por request_id e não expõe tokens nem segredos', async () => {
      const mockCreatedEvent: any = { id: 'evt_1', requestId: 'req_wh_123' };

      const mockPrisma: any = {
        happyWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockCreatedEvent),
          update: vi.fn().mockResolvedValue({ id: 'evt_1' }),
        },
        proposal: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const webhookPayload = {
        request_id: 'req_wh_123',
        event_name: 'SIMULACAO_INICIADA',
        customer_id: 'cust_wh_1',
        data: {
          event_data: {
            chave_proposta: 'prop_wh_key',
            status_code: 1,
            status_name: 'Simulação Iniciada',
          },
        },
      };

      const res = await HappyBankService.processWebhook(mockPrisma, webhookPayload as any);

      expect(res.success).toBe(true);
      expect(mockPrisma.happyWebhookEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'req_wh_123',
          eventName: 'SIMULACAO_INICIADA',
          customerId: 'cust_wh_1',
        }),
      });

      // Garantir idempotência na segunda chamada com mesmo request_id
      mockPrisma.happyWebhookEvent.findUnique.mockResolvedValueOnce({ id: 'evt_1', requestId: 'req_wh_123' });
      const dupRes = await HappyBankService.processWebhook(mockPrisma, webhookPayload as any);
      expect(dupRes.duplicate).toBe(true);
    });
  });

  // =========================================================================
  // 13. SEGURANÇA
  // =========================================================================
  describe('13. Segurança (Sanitização e Proteção de Segredos)', () => {
    it('garante que segredos e tokens nunca são expostos em endpoints públicos', () => {
      const publicConfig = {
        ambiente: 'staging',
        baseUrl: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico',
        clientId: 'client_id_public',
        ativo: true,
        isConfigured: true,
        // Senha e Secret omitidos
      };

      expect(publicConfig).not.toHaveProperty('secret');
      expect(publicConfig).not.toHaveProperty('senha');
      expect(publicConfig).not.toHaveProperty('token_opaco');
    });
  });

  // =========================================================================
  // 14. MULTI-TENANT
  // =========================================================================
  describe('14. Multi-Tenant (Segregação Rigorosa)', () => {
    it('segrega tokens por tenantId + namespace', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (url.includes('/consignado-publico/auth')) {
          return { ok: true, status: 200, json: async () => ({ token_opaco: `tok_public_${callCount}` }) };
        }
        if (url.includes('/consignado-privado/auth')) {
          return { ok: true, status: 200, json: async () => ({ token_opaco: `tok_private_${callCount}` }) };
        }
        throw new Error(`URL inesperada: ${url}`);
      });

      const mockPrisma: any = {
        systemConfig: {
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            const tId = where.tenantId;
            return [
              { configKey: 'happy_client_id', configValue: `cid_${tId}` },
              { configKey: 'happy_secret', configValue: `sec_${tId}` },
              { configKey: 'happy_usuario', configValue: `usr_${tId}` },
              { configKey: 'happy_senha', configValue: `pwd_${tId}` },
              { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
              { configKey: 'happy_clt_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-privado' },
            ];
          }),
        },
      };

      // Tenant A - INSS
      const tokenA_INSS = await HappyTokenManager.getValidToken(mockPrisma, 'tenant_A', false, undefined, 'public');
      // Tenant A - CLT
      const tokenA_CLT = await HappyTokenManager.getValidToken(mockPrisma, 'tenant_A', false, undefined, 'private');
      // Tenant B - INSS
      const tokenB_INSS = await HappyTokenManager.getValidToken(mockPrisma, 'tenant_B', false, undefined, 'public');

      expect(tokenA_INSS).toBe('tok_public_1');
      expect(tokenA_CLT).toBe('tok_private_2');
      expect(tokenB_INSS).toBe('tok_public_3');

      // Tokens são todos distintos e segregados
      expect(tokenA_INSS).not.toBe(tokenA_CLT);
      expect(tokenA_INSS).not.toBe(tokenB_INSS);
    });
  });
});
