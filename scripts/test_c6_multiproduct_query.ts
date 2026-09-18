import { mapC6StatusToInternal } from '../server/services/c6StatusMapper.js';
import { C6ProposalResponse } from '../server/services/c6BankTypes.js';

async function runTests() {
  console.log('=== TESTE DE CONSULTA MULTIPRODUTO C6 BANK ===\n');

  // Teste 1: Proposta de Portabilidade
  const portabilidadeProposal: C6ProposalResponse = {
    proposal_number: '1234567890',
    operation_number: 'OP-PORT-9988',
    operation_type: 'PORTABILIDADE',
    loan_track: {
      situation: 'AGUARDANDO_AVERBACAO',
      current_activity_number: '4',
      current_activity_description: 'Aguardando averbação do contrato na fonte pagadora',
      activity_last_update: '2026-09-18T10:00:00Z',
    },
    formalization_status: 'ASSINATURA_CONCLUIDA',
    formalization_code: 'F-001',
    product: {
      code: 'PORT_CONSIG',
      description: 'Portabilidade de Crédito Consignado INSS',
    },
  };

  console.log('[1/4] Testando mapeamento de Portabilidade...');
  const portResult = mapC6StatusToInternal(portabilidadeProposal);
  if (portResult.isMapped && portResult.targetStatusCode === 'AGUARDAR_PORTABILIDADE') {
    console.log('  -> SUCESSO: Portabilidade mapeada para AGUARDAR_PORTABILIDADE');
  } else {
    console.error('  -> FALHA no mapeamento de Portabilidade:', portResult);
    process.exit(1);
  }

  // Teste 2: Proposta de Consignado Tradicional
  const consignadoProposal: C6ProposalResponse = {
    proposal_number: '9876543210',
    operation_number: 'OP-CONSIG-1122',
    operation_type: 'NOVO',
    loan_track: {
      situation: 'PROPOSTA_PAGA',
      current_activity_number: '9',
      current_activity_description: 'Crédito liberado em conta',
      activity_last_update: '2026-09-18T11:00:00Z',
    },
    formalization_status: 'CONCLUIDO',
    formalization_code: 'F-002',
    product: {
      code: 101,
      description: 'Empréstimo Consignado Federal',
    },
  };

  console.log('[2/4] Testando mapeamento de Consignado (Pago)...');
  const consigResult = mapC6StatusToInternal(consignadoProposal);
  if (consigResult.isMapped && consigResult.targetStatusCode === 'PAGO') {
    console.log('  -> SUCESSO: Consignado mapeado para PAGO');
  } else {
    console.error('  -> FALHA no mapeamento de Consignado:', consigResult);
    process.exit(1);
  }

  // Teste 3: Proposta de FGTS
  const fgtsProposal: C6ProposalResponse = {
    proposal_number: '5554443332',
    operation_number: 'OP-FGTS-4455',
    operation_type: 'ANTECIPACAO_FGTS',
    loan_track: {
      situation: 'PENDENTE_FORMALIZACAO',
      current_activity_number: '2',
      current_activity_description: 'Pendente de formalização digital via link SMS',
    },
    formalization_status: 'PENDENTE',
    formalization_code: 'F-003',
    product: {
      code: 'FGTS_SAQUE_ANIVERSARIO',
      description: 'Antecipação do Saque Aniversário FGTS',
    },
  };

  console.log('[3/4] Testando mapeamento de FGTS (Formalização)...');
  const fgtsResult = mapC6StatusToInternal(fgtsProposal);
  if (fgtsResult.isMapped && fgtsResult.targetStatusCode === 'AGUARDAR_FORMALIZACAO') {
    console.log('  -> SUCESSO: FGTS mapeado para AGUARDAR_FORMALIZACAO');
  } else {
    console.error('  -> FALHA no mapeamento de FGTS:', fgtsResult);
    process.exit(1);
  }

  // Teste 4: Proposta com Situação Desconhecida / Nova Modalidade (preservar status)
  const unknownProposal: C6ProposalResponse = {
    proposal_number: '7778889990',
    operation_type: 'REFINANCIAMENTO',
    loan_track: {
      situation: 'EM_ANALISE_DE_MESA_ESPECIAL',
      current_activity_description: 'Em mesa de análise de risco',
    },
    product: {
      code: 'REFIN_01',
      description: 'Refinanciamento Consignado',
    },
  };

  console.log('[4/4] Testando preservação de status desconhecido (não inventar status)...');
  const unknownResult = mapC6StatusToInternal(unknownProposal);
  if (!unknownResult.isMapped && unknownResult.targetStatusCode === null) {
    console.log('  -> SUCESSO: Situação não mapeada preserva status atual com segurança');
  } else {
    console.error('  -> FALHA: Status inventado incorretamente:', unknownResult);
    process.exit(1);
  }

  console.log('\nTODOS OS TESTES DE CONSULTA MULTIPRODUTO PASSARAM COM SUCESSO!');
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
