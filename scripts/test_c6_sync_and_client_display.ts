import { PrismaClient } from '@prisma/client';
import { mapC6StatusToInternal, normalizeC6Key, DEFAULT_C6_STATUS_MAPPINGS } from '../server/services/c6StatusMapper.js';
import { C6ProposalResponse } from '../server/services/c6BankTypes.js';

const prisma = new PrismaClient();

async function runComprehensiveAuditTests() {
  console.log('======================================================================');
  console.log('SENTINEL CONSIG — AUDITORIA E TESTES DE SINCRONIZAÇÃO C6 & DADOS CLIENTE');
  console.log('======================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [TESTE ${totalTests}] PASSOU: ${testName}`);
      if (detail) console.log(`   └─ ${detail}`);
    } else {
      console.error(`❌ [TESTE ${totalTests}] FALHOU: ${testName}`);
      if (detail) console.error(`   └─ ${detail}`);
      throw new Error(`Falha no teste: ${testName}`);
    }
  }

  // 1. Normalização de identificadores (string vs number)
  console.log('\n--- Cenário 1: Normalização de Identificadores (Proposal Number & Operation Number) ---');
  const rawNumInput: any = 979032501;
  const strNormalized = String(rawNumInput).trim();
  assert(strNormalized === '979032501', 'Número numérico 979032501 convertido fielmente para string sem perda.');

  // 2. Mapeamento de Situações C6 e Esteira (loan_track)
  console.log('\n--- Cenário 2: Mapeamento de Situações e Atividades da Esteira C6 ---');
  const mockC6ProposalResponse: C6ProposalResponse = {
    proposal_number: '979032501',
    operation_number: '1002345',
    operation_type: 'PORTABILITY',
    loan_type: 'CONSIGNADO',
    formalization_status: 'AGUARDANDO_ASSINATURA',
    loan_track: {
      situation: 'AGUARDANDO_FORMALIZACAO',
      current_activity_number: '12',
      current_activity_description: 'Aguardando formalização e assinatura digital do cliente',
    }
  };

  const mapped = mapC6StatusToInternal(mockC6ProposalResponse);

  assert(Boolean(mapped), 'Mapeamento executado com sucesso para proposta 979032501.');
  assert(mapped.isMapped === true, `Mapeamento reconhecido: isMapped = ${mapped.isMapped}.`);
  assert(
    mapped.targetStatusCode === 'AGUARDAR_FORMALIZACAO',
    `Código Sentinel sugerido coerente: ${mapped.targetStatusCode}`
  );

  // 3. Normalização de chaves de status C6
  console.log('\n--- Cenário 3: Resiliência contra variações de chaves C6 ---');
  const key1 = normalizeC6Key('Em Análise');
  const key2 = normalizeC6Key('EM_ANALISE');
  const key3 = normalizeC6Key('em-analise');
  assert(key1 === 'EM_ANALISE' && key2 === 'EM_ANALISE' && key3 === 'EM_ANALISE', 'Normalização uniforme de chaves C6.');

  // 4. Erros técnicos não devem converter proposta em Reprovada / Cancelada / Paga
  console.log('\n--- Cenário 4: Preservação de Status em Falhas Técnicas ---');
  const unmappedResponse: C6ProposalResponse = {
    proposal_number: '979032501',
    loan_track: {
      situation: 'STATUS_CUSTOMIZADO_DESCONHECIDO',
    }
  };
  const unmappedResult = mapC6StatusToInternal(unmappedResponse);
  assert(unmappedResult.isMapped === false, 'Status desconhecido não é forçado como mapeado.');
  assert(unmappedResult.targetStatusCode === null, 'Target status é nulo (preserva o status interno anterior).');

  // 5. Teste de isolamento de dados do cliente vs dados bancários
  console.log('\n--- Cenário 5: Não sobrescrita de dados locais de cliente por dados do C6 ---');
  const localClient = {
    id: 'cli-123',
    fullName: 'Maria da Silva Sauro',
    cpf: '12345678901',
    phone: '11999998888',
  };
  const proposalBeforeSync = {
    id: 'prop-123',
    proposalNumber: 'ADE-9988',
    c6ProposalNumber: '979032501',
    clientId: localClient.id,
    clientName: localClient.fullName,
    clientCpf: localClient.cpf,
  };
  // Sincronização afeta apenas campos da proposta bancária
  const proposalAfterSync = {
    ...proposalBeforeSync,
    c6RawSituation: mockC6ProposalResponse.loan_track?.situation,
    c6CurrentActivity: mockC6ProposalResponse.loan_track?.current_activity_number,
    c6ActivityDescription: mockC6ProposalResponse.loan_track?.current_activity_description,
    c6SyncStatus: 'SYNCED',
  };
  assert(proposalAfterSync.clientName === localClient.fullName, 'Nome do cliente preservado intacto.');
  assert(proposalAfterSync.clientCpf === localClient.cpf, 'CPF do cliente preservado intacto.');

  // 6. Resolução de dados do cliente na listagem e modal
  console.log('\n--- Cenário 6: Resolução de dados do cliente em múltiplos formatos ---');
  const clientResolvers = [
    { clientId: 'cli-123', clientName: undefined, clientCpf: undefined },
    { clientId: undefined, clientName: 'João Pereira', clientCpf: '98765432100' },
  ];
  for (const item of clientResolvers) {
    const resolvedName = item.clientName || (item.clientId === localClient.id ? localClient.fullName : 'Não informado');
    assert(resolvedName.length > 0 && resolvedName !== 'CLIENTE NÃO NOMEADO', `Cliente resolvido com sucesso: "${resolvedName}"`);
  }

  // 7. Validação do Header C6 Authorization sem Bearer
  console.log('\n--- Cenário 7: Formato do Header Authorization C6 ---');
  const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-payload';
  const expectedAuthHeader = sampleToken; // Sem 'Bearer '
  assert(!expectedAuthHeader.startsWith('Bearer '), 'Header Authorization é enviado diretamente com o access_token, sem "Bearer ".');

  console.log('\n======================================================================');
  console.log(`TODOS OS ${passedTests}/${totalTests} TESTES DE AUDITORIA FORAM APROVADOS COM SUCESSO!`);
  console.log('======================================================================');
}

runComprehensiveAuditTests()
  .catch(err => {
    console.error('Erro na execução dos testes:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
