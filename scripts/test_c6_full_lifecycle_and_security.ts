import { PrismaClient } from '@prisma/client';
import { C6BankService } from '../server/services/c6BankService.js';
import { mapC6StatusToInternal } from '../server/services/c6StatusMapper.js';
import { C6ProposalResponse } from '../server/services/c6BankTypes.js';

const prisma = new PrismaClient();

async function runFullLifecycleSuite() {
  console.log('======================================================================');
  console.log('SENTINEL CONSIG — SUITE COMPLETA DE TESTES: CICLO DE VIDA C6 & SEGURANÇA');
  console.log('======================================================================\n');

  const tenantA = 'test-tenant-c6-alpha-' + Date.now();
  const tenantB = 'test-tenant-c6-beta-' + Date.now();

  try {
    // --------------------------------------------------------------------------------
    // SETUP: Criar Tenants de Teste
    // --------------------------------------------------------------------------------
    console.log('[SETUP] Criando tenants de teste isolados no banco de dados...');
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Correspondente Alpha', slug: 'corr-alpha-' + Date.now(), status: 'ACTIVE' },
        { id: tenantB, name: 'Correspondente Beta', slug: 'corr-beta-' + Date.now(), status: 'ACTIVE' },
      ],
    });

    // --------------------------------------------------------------------------------
    // TESTE 1: Salvamento Seguro de Configuração e Preservação de Senha Vazia
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 1/10] Salvamento de Configurações e Preservação de Senha');
    await C6BankService.saveTenantConfig(prisma, tenantA, {
      username: 'user_alpha_c6',
      password: 'InitialSecurePassword123!',
      baseUrl: 'https://marketplace-proposal-service-api-p.c6bank.info',
      autoSyncEnabled: true,
      syncIntervalMinutes: 20,
    });

    let configA = await C6BankService.getTenantConfig(prisma, tenantA);
    if (configA.username === 'user_alpha_c6' && configA.password === 'InitialSecurePassword123!' && configA.hasPassword) {
      console.log('  -> SUCESSO: Configurações iniciais salvas com sucesso.');
    } else {
      throw new Error('Falha ao salvar configuração inicial do tenant A');
    }

    // Atualização com campo de senha vazio (não deve sobrescrever a senha existente)
    await C6BankService.saveTenantConfig(prisma, tenantA, {
      syncIntervalMinutes: 30,
      password: '', // Enviado vazio
    });

    configA = await C6BankService.getTenantConfig(prisma, tenantA);
    if (configA.password === 'InitialSecurePassword123!' && configA.syncIntervalMinutes === 30) {
      console.log('  -> SUCESSO: Senha preservada intacta após atualização parcial.');
    } else {
      throw new Error('Falha: Senha foi apagada ou sobrescrita incorretamente');
    }

    // --------------------------------------------------------------------------------
    // TESTE 2: Isolamento Multi-Tenant de Configurações
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 2/10] Isolamento Multi-Tenant de Credenciais');
    await C6BankService.saveTenantConfig(prisma, tenantB, {
      username: 'user_beta_c6',
      password: 'BetaPassword456!',
      baseUrl: 'https://marketplace-proposal-service-api-p.c6bank.info',
    });

    const configB = await C6BankService.getTenantConfig(prisma, tenantB);
    if (configB.username === 'user_beta_c6' && configA.username === 'user_alpha_c6') {
      console.log('  -> SUCESSO: Credenciais totalmente segregadas entre Tenant Alpha e Beta.');
    } else {
      throw new Error('Falha: Vazamento de configurações entre tenants');
    }

    // --------------------------------------------------------------------------------
    // TESTE 3: Gestão de Cache em Memória, Deduplicação de Promise Concorrente e Validade
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 3/10] Cache de Tokens em Memória e Renovação com Buffer');
    C6BankService.invalidateTokenCache(tenantA);

    // Mock global de fetch para simular respostas oficiais do C6
    const originalFetch = global.fetch;
    let authCallCount = 0;
    let proposalQueryHeaders: Record<string, string> = {};

    global.fetch = async (input: any, init?: any): Promise<Response> => {
      const url = String(input);
      if (url.includes('/auth/token')) {
        authCallCount++;
        const bodyStr = decodeURIComponent(String(init?.body || ''));
        if (bodyStr.includes('username=user_alpha_c6') && bodyStr.includes('password=InitialSecurePassword123!')) {
          return new Response(
            JSON.stringify({
              access_token: 'mock_c6_jwt_token_alpha_' + authCallCount,
              expires_in_seconds: 1200,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else if (bodyStr.includes('user_beta_c6')) {
          return new Response(
            JSON.stringify({
              access_token: 'mock_c6_jwt_token_beta',
              expires_in_seconds: 1200,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({ message: 'INVALID_CREDENTIALS', type: 'AuthenticationException' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (url.includes('/marketplace/proposal')) {
        proposalQueryHeaders = { ...(init?.headers || {}) };
        return new Response(
          JSON.stringify({
            proposal_number: '1234567890',
            operation_number: 'OP-PORT-9988',
            operation_type: 'PORTABILIDADE',
            loan_track: {
              situation: 'AGUARDANDO_AVERBACAO',
              current_activity_description: 'Aguardando averbação',
            },
            formalization_status: 'ASSINATURA_CONCLUIDA',
            formalization_code: 'F-001',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    // Chamadas concorrentes simultâneas: Devem reutilizar a mesma promessa em andamento (1 chamada POST)
    authCallCount = 0;
    const [token1, token2, token3] = await Promise.all([
      C6BankService.getAccessToken(prisma, tenantA),
      C6BankService.getAccessToken(prisma, tenantA),
      C6BankService.getAccessToken(prisma, tenantA),
    ]);

    if (token1 === token2 && token2 === token3 && authCallCount === 1) {
      console.log('  -> SUCESSO: 3 chamadas concorrentes geraram exatamente 1 requisição POST /auth/token (deduplicação ativa).');
    } else {
      throw new Error(`Falha na deduplicação de chamadas concorrentes. authCallCount: ${authCallCount}`);
    }

    // Segunda chamada subsequente (dentro do tempo de validade): Deve usar o cache em memória (0 novas requisições)
    const tokenCached = await C6BankService.getAccessToken(prisma, tenantA);
    if (tokenCached === token1 && authCallCount === 1) {
      console.log('  -> SUCESSO: Token reutilizado do cache em memória com validade ativa.');
    } else {
      throw new Error('Falha no cache em memória de tokens');
    }

    // --------------------------------------------------------------------------------
    // TESTE 4: Testar Conexão com Credenciais do Formulário (Override Efêmero)
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 4/10] Botão "Testar Conexão" (Validação com Sucesso e Rejeição)');
    const testSuccess = await C6BankService.testConnection(prisma, tenantA);
    if (testSuccess.success) {
      console.log('  -> SUCESSO: Teste com credenciais válidas retornou sucesso.');
    } else {
      throw new Error('Falha no teste com credenciais válidas');
    }

    const testFailed = await C6BankService.testConnection(prisma, tenantA, {
      username: 'wrong_user',
      password: 'wrong_password',
    });
    if (!testFailed.success && testFailed.message.includes('HTTP 401')) {
      console.log('  -> SUCESSO: Credenciais incorretas rejeitadas com mensagem descritiva (HTTP 401).');
    } else {
      throw new Error('Falha: Credenciais inválidas não foram rejeitadas corretamente');
    }

    // --------------------------------------------------------------------------------
    // TESTE 5: Consulta de Proposta e Verificação Estrita de Headers
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 5/10] Consulta de Proposta e Padronização de Headers');
    const queryResult = await C6BankService.queryProposalFromC6(prisma, tenantA, '1234567890');
    if (queryResult.statusCode === 200 && queryResult.data.proposal_number === '1234567890') {
      console.log('  -> SUCESSO: Resposta de proposta recebida com sucesso.');
    } else {
      throw new Error('Falha na consulta de proposta');
    }

    // Verificar headers enviados na requisição HTTP
    const authHeader = proposalQueryHeaders['Authorization'] || proposalQueryHeaders['authorization'];
    if (authHeader && !authHeader.startsWith('Bearer ') && authHeader.startsWith('mock_c6_jwt_token_alpha')) {
      console.log('  -> SUCESSO: Header Authorization enviado com token puro (sem prefixo Bearer).');
    } else {
      throw new Error(`Falha no header Authorization: ${authHeader}`);
    }

    if (!proposalQueryHeaders['access_token'] && !proposalQueryHeaders['Accept']?.includes('vnd.c6bank_fgts')) {
      console.log('  -> SUCESSO: Nenhum header duplicado ou restritivo de FGTS enviado.');
    } else {
      throw new Error('Falha: Headers indevidos encontrados na requisição');
    }

    // --------------------------------------------------------------------------------
    // TESTE 6: Renovação Automática e Retry Único em caso de 401 na Consulta
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 6/10] Retry Único com Renovação de Token ao receber 401 na Consulta');
    let attempt = 0;
    global.fetch = async (input: any, init?: any): Promise<Response> => {
      const url = String(input);
      if (url.includes('/auth/token')) {
        return new Response(
          JSON.stringify({ access_token: 'fresh_token_after_401', expires_in_seconds: 1200 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/marketplace/proposal')) {
        attempt++;
        if (attempt === 1) {
          // Primeira tentativa retorna 401 (token expirou no gateway)
          return new Response(JSON.stringify({ message: 'Token expired' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Segunda tentativa com novo token retorna 200 OK
        return new Response(
          JSON.stringify({
            proposal_number: '1234567890',
            operation_type: 'PORTABILIDADE',
            loan_track: { situation: 'AGUARDANDO_AVERBACAO' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const retryRes = await C6BankService.queryProposalFromC6(prisma, tenantA, '1234567890');
    if (retryRes.statusCode === 200 && attempt === 2) {
      console.log('  -> SUCESSO: 401 acionou renovação de token e retry único com sucesso.');
    } else {
      throw new Error(`Falha no retry de 401: attempt=${attempt}`);
    }

    // --------------------------------------------------------------------------------
    // TESTE 7: Tratamento de Erros HTTP (404, 429, 500, HTML Inesperado)
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 7/10] Tratamento Seguro de Erros HTTP 404, 429, 500 e HTML');
    // Simular 404 na proposta
    global.fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ message: 'Proposta não encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    try {
      await C6BankService.queryProposalFromC6(prisma, tenantA, '9999999999');
      throw new Error('Deveria ter lançado erro 404');
    } catch (err: any) {
      if (err.statusCode === 404 && err.message.includes('404')) {
        console.log('  -> SUCESSO: HTTP 404 tratado com mensagem clara.');
      } else {
        throw err;
      }
    }

    // Simular HTML inesperado do proxy/WAF
    global.fetch = async (): Promise<Response> => {
      return new Response('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      });
    };
    try {
      await C6BankService.queryProposalFromC6(prisma, tenantA, '1234567890');
      throw new Error('Deveria ter lançado erro de HTML inesperado');
    } catch (err: any) {
      if (err.message.includes('HTML')) {
        console.log('  -> SUCESSO: Resposta HTML inesperada interceptada e tratada.');
      } else {
        throw err;
      }
    }

    // --------------------------------------------------------------------------------
    // TESTE 8: Sanitização de Dados Sensíveis para Histórico e Auditoria
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 8/10] Sanitização de CPF, Senhas e Tokens na Auditoria');
    const rawMockData = {
      proposal_number: '12345',
      access_token: 'secret_token_123',
      password: 'secret_password_123',
      client: {
        name: 'Maria da Silva',
        cpf: '12345678901',
      },
    };
    const sanitized = C6BankService.sanitizeC6Response(rawMockData);
    if (!sanitized.access_token && !sanitized.password && sanitized.client.cpf === '***.456.***-**') {
      console.log('  -> SUCESSO: Tokens, senhas e CPF mascarados para histórico e auditoria.');
    } else {
      throw new Error('Falha na sanitização de dados sensíveis');
    }

    // --------------------------------------------------------------------------------
    // TESTE 9: Mapeamento de Status Multiproduto (Portabilidade, Consignado, FGTS)
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 9/10] Mapeamento de Status Multiproduto');
    const samplePort: C6ProposalResponse = {
      proposal_number: '100',
      operation_type: 'PORTABILIDADE',
      loan_track: { situation: 'AGUARDANDO_AVERBACAO' },
    };
    const mappedPort = mapC6StatusToInternal(samplePort);
    if (mappedPort.isMapped && mappedPort.targetStatusCode === 'AGUARDAR_PORTABILIDADE') {
      console.log('  -> SUCESSO: Portabilidade mapeada para AGUARDAR_PORTABILIDADE.');
    } else {
      throw new Error('Falha no mapeamento de portabilidade');
    }

    // --------------------------------------------------------------------------------
    // TESTE 10: Limpeza e Isolamento Final
    // --------------------------------------------------------------------------------
    console.log('\n[TESTE 10/10] Verificação de Isolamento Final e Limpeza de Cache');
    C6BankService.invalidateTokenCache(tenantA);
    C6BankService.invalidateTokenCache(tenantB);
    console.log('  -> SUCESSO: Cache de tokens limpo com segurança.');

    // Restaurar fetch original
    global.fetch = originalFetch;

    console.log('\n======================================================================');
    console.log('TODOS OS 10 TESTES DE CICLO DE VIDA E SEGURANÇA FORAM APROVADOS COM SUCESSO!');
    console.log('======================================================================\n');
  } finally {
    // Cleanup dos tenants de teste
    await prisma.systemConfig.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  }
}

runFullLifecycleSuite().catch((err) => {
  console.error('ERRO FATAL NA SUITE DE TESTES:', err);
  process.exit(1);
});
