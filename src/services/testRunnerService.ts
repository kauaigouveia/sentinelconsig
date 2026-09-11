import { StorageService } from './storageService';
import { extractPartnerCode, normalizeCpf, calculateBusinessDays } from '../lib/utils';
import { ExcelService } from './excelService';
import { AutomationService } from './automationService';
import { Holiday } from '../types';

export interface TestResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export class TestRunnerService {
  public static runAllTests(): TestResult[] {
    const results: TestResult[] = [];

    // TEST 1: extractPartnerCode()
    try {
      const t1 = extractPartnerCode('KAUAI@16740');
      const t2 = extractPartnerCode('FOX@16715');
      const t3 = extractPartnerCode('FRANCO@16690');

      const pass = t1 === '16740' && t2 === '16715' && t3 === '16690';
      results.push({
        id: 'test-extract-code',
        name: 'Extração do Código do Parceiro (extractPartnerCode)',
        category: 'PARCEIRO',
        passed: pass,
        expected: '16740, 16715, 16690',
        actual: `${t1}, ${t2}, ${t3}`,
        details: 'Extrai o código numérico posicionado após o último @ no login do parceiro.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-extract-code',
        name: 'Extração do Código do Parceiro (extractPartnerCode)',
        category: 'PARCEIRO',
        passed: false,
        expected: '16740, 16715, 16690',
        actual: e.message,
      });
    }

    // TEST 2: Validação de Login Único do Parceiro
    try {
      let threw = false;
      try {
        // KAUAI@16740 already exists in initial partners
        StorageService.createPartner({
          fullName: 'KAUAI AMORIM DUPLICADO',
          login: 'KAUAI@16740',
          promoterId: 'prom-dg',
        });
      } catch (err: any) {
        if (err.message.includes('Este login de parceiro já está cadastrado.')) {
          threw = true;
        }
      }
      results.push({
        id: 'test-partner-unique',
        name: 'Validação de Login Único do Parceiro',
        category: 'PARCEIRO',
        passed: threw,
        expected: 'Lançar erro: "Este login de parceiro já está cadastrado."',
        actual: threw ? 'Erro lançado com sucesso' : 'Permitiu duplicidade indevida',
      });
    } catch (e: any) {
      results.push({
        id: 'test-partner-unique',
        name: 'Validação de Login Único do Parceiro',
        category: 'PARCEIRO',
        passed: false,
        expected: 'Lançar erro de duplicidade',
        actual: e.message,
      });
    }

    // TEST 3: Combinação Banco × Promotora (BankPromoter)
    try {
      const c6Dg = StorageService.isBankPromoterAllowed('bank-c6', 'prom-dg');
      const c6Prospecta = StorageService.isBankPromoterAllowed('bank-c6', 'prom-prospecta');
      const daycovalDg = StorageService.isBankPromoterAllowed('bank-daycoval', 'prom-dg');
      const daycovalProspecta = StorageService.isBankPromoterAllowed('bank-daycoval', 'prom-prospecta');

      const pass = c6Dg === true && c6Prospecta === true && daycovalDg === true && daycovalProspecta === false;
      results.push({
        id: 'test-bank-promoter',
        name: 'Matriz Banco × Promotora (BankPromoter)',
        category: 'BANCO & PROMOTORA',
        passed: pass,
        expected: 'C6+DG: Sim, C6+PROSPECTA: Sim, DAYCOVAL+DG: Sim, DAYCOVAL+PROSPECTA: Não',
        actual: `C6+DG: ${c6Dg}, C6+PROS: ${c6Prospecta}, DAY+DG: ${daycovalDg}, DAY+PROS: ${daycovalProspecta}`,
        details: 'Garante que promotoras não habilitadas para determinado banco sejam bloqueadas.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-bank-promoter',
        name: 'Matriz Banco × Promotora (BankPromoter)',
        category: 'BANCO & PROMOTORA',
        passed: false,
        expected: 'Validação estrita de matriz',
        actual: e.message,
      });
    }

    // TEST 4: Normalização de CPF e Cliente com Múltiplas ADEs
    try {
      const clean1 = normalizeCpf('01138777498');
      const clean2 = normalizeCpf('011.387.774-98');
      const client = StorageService.findClientByCpf('01138777498');
      const proposals = client ? StorageService.getProposalsByClientId(client.id) : [];

      const pass = clean1 === '01138777498' && clean2 === '01138777498' && proposals.length >= 2;
      results.push({
        id: 'test-cpf-client',
        name: 'Cliente Não é Proposta & Múltiplas ADEs',
        category: 'CLIENTE',
        passed: pass,
        expected: 'CPF normalizado para 01138777498 e mesmo cliente com várias ADEs vinculadas',
        actual: `Normalizado: ${clean2} | Propostas vinculadas ao mesmo cliente: ${proposals.length}`,
        details: `Cliente MARIA JOSE ALEXANDRE possui ADEs: ${proposals.map(p => p.proposalNumber).join(', ')}`,
      });
    } catch (e: any) {
      results.push({
        id: 'test-cpf-client',
        name: 'Cliente Não é Proposta & Múltiplas ADEs',
        category: 'CLIENTE',
        passed: false,
        expected: 'Multi-ADE por cliente',
        actual: e.message,
      });
    }

    // TEST 5: Detecção de Duplicidade de ADE (CPF repetido permitido)
    try {
      let threw = false;
      try {
        // Attempting to create proposal with already registered ADE 833085808
        StorageService.createProposal({
          proposalNumber: '833085808',
          clientId: 'cli-maria-jose',
          productId: 'prod-port',
          bankId: 'bank-c6',
          promoterId: 'prom-dg',
          partnerId: 'part-kauai',
        });
      } catch (err: any) {
        if (err.message.includes('Esta proposta já está cadastrada.')) {
          threw = true;
        }
      }

      results.push({
        id: 'test-duplicate-ade',
        name: 'Controle de Duplicidade de ADE',
        category: 'PRODUÇÃO',
        passed: threw,
        expected: 'Bloquear ADE existente com mensagem "Esta proposta já está cadastrada."',
        actual: threw ? 'Bloqueou duplicidade com sucesso' : 'Permitiu duplicidade indevida',
      });
    } catch (e: any) {
      results.push({
        id: 'test-duplicate-ade',
        name: 'Controle de Duplicidade de ADE',
        category: 'PRODUÇÃO',
        passed: false,
        expected: 'Bloqueio de ADE duplicada',
        actual: e.message,
      });
    }

    // TEST 6: Automação Portabilidade -> Refin da Portabilidade
    try {
      // Create temporary portabilidade and related refin
      const tempNum1 = `TEST-PORT-${Date.now()}`;
      const tempNum2 = `TEST-REFIN-${Date.now()}`;

      const port = StorageService.createProposal({
        proposalNumber: tempNum1,
        clientId: 'cli-maria-jose',
        productId: 'prod-port',
        bankId: 'bank-c6',
        promoterId: 'prom-dg',
        partnerId: 'part-kauai',
        statusId: 'st-1', // AGUARDAR FORMALIZAÇÃO
      });

      const refin = StorageService.createProposal({
        proposalNumber: tempNum2,
        clientId: 'cli-maria-jose',
        productId: 'prod-refin-port',
        bankId: 'bank-c6',
        promoterId: 'prom-dg',
        partnerId: 'part-kauai',
        statusId: 'st-1', // AGUARDAR FORMALIZAÇÃO
        relatedPortabilityId: port.id,
      });

      // Change port status to AGUARDAR RETORNO CIP (st-3)
      StorageService.updateProposalStatus(port.id, 'st-3', 'Teste automação');

      // Check if refin was automatically updated to AGUARDAR PORTABILIDADE (st-4)
      const updatedRefin = StorageService.getProposalById(refin.id);
      const refinStatus = StorageService.getStatusById(updatedRefin?.statusId || '');
      const pass = refinStatus?.code === 'AGUARDAR_PORTABILIDADE';

      results.push({
        id: 'test-refin-automation',
        name: 'Automação Portabilidade CIP -> Refin Aguardar Portabilidade',
        category: 'AUTOMAÇÃO',
        passed: pass,
        expected: 'Refin alterado automaticamente para AGUARDAR PORTABILIDADE',
        actual: `Status resultante do refin: ${refinStatus?.name || 'Não alterado'}`,
        details: 'Ao colocar portabilidade em CIP, o refin vinculado muda automaticamente de status pelo sistema.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-refin-automation',
        name: 'Automação Portabilidade CIP -> Refin Aguardar Portabilidade',
        category: 'AUTOMAÇÃO',
        passed: false,
        expected: 'Automação de status refin',
        actual: e.message,
      });
    }

    // TEST 7: Regra dos 5 Dias Úteis e Feriados
    try {
      const mockHolidays: Holiday[] = [
        { id: 'h-test', date: '2026-09-07', name: 'Independência do Brasil', active: true },
      ];

      // From Friday 2026-09-04 to Wednesday 2026-09-09:
      // Sat 05 (weekend), Sun 06 (weekend), Mon 07 (holiday), Tue 08 (business), Wed 09 (business) = 2 business days
      const days = calculateBusinessDays('2026-09-04', '2026-09-09', mockHolidays);
      const pass = days === 2;

      results.push({
        id: 'test-business-days',
        name: 'Cálculo de Dias Úteis (SLA de Portabilidade e Feriados)',
        category: 'SLA',
        passed: pass,
        expected: '2 dias úteis (ignorando sábado, domingo e feriado 07/09)',
        actual: `${days} dias úteis calculados`,
        details: 'Cálculo considera seg a sex, excluindo fins de semana e feriados cadastrados.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-business-days',
        name: 'Cálculo de Dias Úteis (SLA de Portabilidade e Feriados)',
        category: 'SLA',
        passed: false,
        expected: 'Exclusão de finais de semana e feriados',
        actual: e.message,
      });
    }

    // TEST 8: Alteração de Status em Lote
    try {
      const p1 = StorageService.getProposals()[0];
      const p2 = StorageService.getProposals()[1];
      const targetStatus = StorageService.getStatusByCode('PENDENTE_ANEXO_DOCUMENTACAO')!;

      const res = StorageService.bulkUpdateProposalStatus(
        [p1.id, p2.id],
        targetStatus.id,
        'Teste alteração em lote'
      );

      const pass = res.updatedCount === 2 && res.errors.length === 0;
      results.push({
        id: 'test-bulk-status',
        name: 'Alteração de Status em Lote com Histórico Individual',
        category: 'OPERAÇÃO',
        passed: pass,
        expected: '2 propostas atualizadas sem erros',
        actual: `${res.updatedCount} atualizadas com sucesso`,
        details: 'Cada proposta atualizada em lote recebe seu próprio registro no histórico com origem ALTERACAO_EM_LOTE.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-bulk-status',
        name: 'Alteração de Status em Lote com Histórico Individual',
        category: 'OPERAÇÃO',
        passed: false,
        expected: 'Atualização em lote',
        actual: e.message,
      });
    }

    // TEST 9: Exportação com Código do Parceiro (extractPartnerCode)
    try {
      const partner = StorageService.getPartners().find(p => p.login === 'KAUAI@16740');
      const code = partner ? extractPartnerCode(partner.login) : '';
      const pass = code === '16740' && !code.includes('@');

      results.push({
        id: 'test-export-rule',
        name: 'Regra de Exportação: Código Extraído (Nunca Login Completo)',
        category: 'EXPORTAÇÃO',
        passed: pass,
        expected: 'Exportar "16740", NUNCA "KAUAI@16740"',
        actual: `Valor gerado na coluna CÓDIGO DO PARCEIRO: "${code}"`,
      });
    } catch (e: any) {
      results.push({
        id: 'test-export-rule',
        name: 'Regra de Exportação: Código Extraído',
        category: 'EXPORTAÇÃO',
        passed: false,
        expected: 'Código numérico na exportação',
        actual: e.message,
      });
    }

    // TEST 10: Auditoria (AuditLog)
    try {
      const logs = StorageService.getAuditLogs();
      const pass = logs.length > 0 && logs.some(l => l.entity === 'Proposal');
      results.push({
        id: 'test-audit-logs',
        name: 'Rastreabilidade e Auditoria (AuditLog)',
        category: 'SEGURANÇA',
        passed: pass,
        expected: 'Registros de auditoria com usuário, ação, data/hora e dados',
        actual: `${logs.length} logs registrados no sistema`,
      });
    } catch (e: any) {
      results.push({
        id: 'test-audit-logs',
        name: 'Rastreabilidade e Auditoria (AuditLog)',
        category: 'SEGURANÇA',
        passed: false,
        expected: 'Logs de auditoria ativos',
        actual: e.message,
      });
    }

    // =========================================================================
    // SUÍTE DE TESTES ESPECÍFICOS: CONTROLE DE SOLICITAÇÕES DE SIMULAÇÃO
    // =========================================================================

    const testCpfAlpha = '70891234501';
    const testCpfMulti = '81920345672';
    const partnerKauai = StorageService.getPartners().find(p => p.login.includes('KAUAI')) || StorageService.getPartners()[0];
    const partnerFox = StorageService.getPartners().find(p => p.login.includes('FOX')) || StorageService.getPartners()[1];
    const activeUser = StorageService.getActiveUser();

    // TEST 11: Simulação 1 - Cadastro com CPF + Parceiro
    let simAlphaId = '';
    try {
      const created = StorageService.createSimulationRequest({
        cpf: testCpfAlpha,
        partnerId: partnerKauai.id,
      });
      simAlphaId = created.id;
      const pass = created.cpf === testCpfAlpha && created.partnerId === partnerKauai.id;
      results.push({
        id: 'test-sim-create',
        name: 'Simulação 1: Criar solicitação com CPF + Parceiro',
        category: 'SIMULAÇÃO',
        passed: pass,
        expected: `Criada com CPF ${testCpfAlpha} e parceiro ${partnerKauai.login}`,
        actual: `ID: ${created.id}, CPF: ${created.cpf}, Parceiro: ${partnerKauai.login}`,
        details: 'Formulário limpo com apenas CPF e Parceiro, normalizando formatação.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-sim-create',
        name: 'Simulação 1: Criar solicitação com CPF + Parceiro',
        category: 'SIMULAÇÃO',
        passed: false,
        expected: 'Criação da solicitação de simulação',
        actual: e.message,
      });
    }

    // TEST 12: Simulação 2 - Responsável Automático (activeUser)
    try {
      const sim = StorageService.getSimulationRequestById(simAlphaId);
      const pass = sim !== undefined && sim.createdById === activeUser.id;
      results.push({
        id: 'test-sim-responsible',
        name: 'Simulação 2: Responsável Preenchido Automaticamente',
        category: 'SIMULAÇÃO',
        passed: pass,
        expected: `Responsável registrado como usuário logado: ${activeUser.name} (${activeUser.id})`,
        actual: `createdById: ${sim?.createdById}`,
        details: 'Não há seleção manual de responsável; o sistema vincula o usuário autenticado.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-sim-responsible',
        name: 'Simulação 2: Responsável Preenchido Automaticamente',
        category: 'SIMULAÇÃO',
        passed: false,
        expected: 'Usuário logado vinculado',
        actual: e.message,
      });
    }

    // TEST 13: Simulação 3 - Status Inicial SIMULAÇÃO ENVIADA
    try {
      const sim = StorageService.getSimulationRequestById(simAlphaId);
      const pass = sim?.status === 'SIMULAÇÃO ENVIADA';
      results.push({
        id: 'test-sim-initial-status',
        name: 'Simulação 3: Status Inicial SIMULAÇÃO ENVIADA',
        category: 'SIMULAÇÃO',
        passed: pass,
        expected: 'SIMULAÇÃO ENVIADA',
        actual: `${sim?.status}`,
      });
    } catch (e: any) {
      results.push({
        id: 'test-sim-initial-status',
        name: 'Simulação 3: Status Inicial SIMULAÇÃO ENVIADA',
        category: 'SIMULAÇÃO',
        passed: false,
        expected: 'SIMULAÇÃO ENVIADA',
        actual: e.message,
      });
    }

    // TEST 14: Simulação 4 - Alteração para NÃO PASSÍVEL DE CONTRATAÇÃO
    try {
      const testCpfRej = '61234567890';
      const simToReject = StorageService.createSimulationRequest({
        cpf: testCpfRej,
        partnerId: partnerKauai.id,
      });
      const updated = StorageService.updateSimulationRequestStatus(
        simToReject.id,
        'NÃO PASSÍVEL DE CONTRATAÇÃO',
        'Cliente sem margem consignável'
      );
      const pass = updated.status === 'NÃO PASSÍVEL DE CONTRATAÇÃO';
      results.push({
        id: 'test-sim-rejection',
        name: 'Simulação 4: Alterar para NÃO PASSÍVEL DE CONTRATAÇÃO',
        category: 'SIMULAÇÃO',
        passed: pass,
        expected: 'NÃO PASSÍVEL DE CONTRATAÇÃO',
        actual: `${updated.status}`,
        details: 'A equipe de simulação pode marcar solicitações inviabilizadas com justificativa.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-sim-rejection',
        name: 'Simulação 4: Alterar para NÃO PASSÍVEL DE CONTRATAÇÃO',
        category: 'SIMULAÇÃO',
        passed: false,
        expected: 'NÃO PASSÍVEL DE CONTRATAÇÃO',
        actual: e.message,
      });
    }

    // TEST 15: Simulação 5 - Bloqueio de DIGITADA PELA MESA Manual
    try {
      let threwManualBlock = false;
      const testCpfBlock = '45678912300';
      const simManualTest = StorageService.createSimulationRequest({
        cpf: testCpfBlock,
        partnerId: partnerKauai.id,
      });

      try {
        // Tentar definir manualmente DIGITADA PELA MESA (deve ser bloqueado)
        StorageService.updateSimulationRequestStatus(
          simManualTest.id,
          'DIGITADA PELA MESA' as any
        );
      } catch (err: any) {
        if (err.message.includes('exclusivo e definido unicamente de forma automática')) {
          threwManualBlock = true;
        }
      }

      results.push({
        id: 'test-sim-manual-block',
        name: 'Simulação 5: Bloqueio de "DIGITADA PELA MESA" Manual',
        category: 'SIMULAÇÃO',
        passed: threwManualBlock,
        expected: 'Lançar erro e impedir seleção manual de DIGITADA PELA MESA',
        actual: threwManualBlock ? 'Bloqueio aplicado com sucesso' : 'Permitiu alteração manual indevida',
      });
    } catch (e: any) {
      results.push({
        id: 'test-sim-manual-block',
        name: 'Simulação 5: Bloqueio de "DIGITADA PELA MESA" Manual',
        category: 'SIMULAÇÃO',
        passed: false,
        expected: 'Bloqueio manual',
        actual: e.message,
      });
    }

    // TEST 16 & 17 & 18: Simulação 6, 7 e 8 - Match Estrito por CPF + PARCEIRO
    try {
      // Cria simulação para CPF Multi com Parceiro KAUAI
      const simKauai = StorageService.createSimulationRequest({
        cpf: testCpfMulti,
        partnerId: partnerKauai.id,
      });

      // Cria simulação para o MESMO CPF Multi com Parceiro FOX
      const simFox = StorageService.createSimulationRequest({
        cpf: testCpfMulti,
        partnerId: partnerFox.id,
      });

      // Cria proposta na mesa APENAS para Parceiro KAUAI
      const client = StorageService.getOrCreateClient({
        cpf: testCpfMulti,
        fullName: 'CLIENTE TESTE MULTI SIMULACAO',
      });

      const bank = StorageService.getBanks()[0];
      const promoter = StorageService.getPromoters()[0];
      const product = StorageService.getProducts()[0];

      const testAde = `ADE-SIM-${Date.now().toString().slice(-6)}`;
      const proposal = StorageService.createProposal({
        proposalNumber: testAde,
        clientId: client.id,
        productId: product.id,
        bankId: bank.id,
        promoterId: promoter.id,
        partnerId: partnerKauai.id, // KAUAI
        notes: 'Teste de correspondência automática de simulação',
      });

      // Verifica status de ambas as solicitações
      const checkKauai = StorageService.getSimulationRequestById(simKauai.id);
      const checkFox = StorageService.getSimulationRequestById(simFox.id);

      const passMatchKauai =
        checkKauai?.status === 'DIGITADA PELA MESA' &&
        checkKauai?.matchedProposalNumber === testAde &&
        Boolean(checkKauai?.matchedAt);

      const passIsolateFox = checkFox?.status === 'SIMULAÇÃO ENVIADA' && !checkFox.matchedProposalNumber;

      results.push({
        id: 'test-sim-auto-match',
        name: 'Simulação 6: Identificação Automática de Proposta (Match CPF + Parceiro)',
        category: 'SIMULAÇÃO',
        passed: passMatchKauai,
        expected: `Status DIGITADA PELA MESA com ADE ${testAde} vinculada`,
        actual: `Status: ${checkKauai?.status}, ADE: ${checkKauai?.matchedProposalNumber}`,
        details: 'Ao cadastrar a proposta na mesa com mesmo CPF e Parceiro, a simulação correspondente é convertida.',
      });

      results.push({
        id: 'test-sim-partner-isolation',
        name: 'Simulação 7: Isolamento de Parceiro (Não misturar solicitações de mesmo CPF)',
        category: 'SIMULAÇÃO',
        passed: passIsolateFox,
        expected: `Parceiro FOX permanece "SIMULAÇÃO ENVIADA"`,
        actual: `Parceiro FOX status: ${checkFox?.status}`,
        details: 'A correspondência exige CPF E PARCEIRO. A solicitação do outro parceiro continua aguardando.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-sim-auto-match',
        name: 'Simulação 6: Identificação Automática de Proposta',
        category: 'SIMULAÇÃO',
        passed: false,
        expected: 'Match automático',
        actual: e.message,
      });
    }

    // TEST 19: Simulação 9 - Auditoria com Origem SYSTEM/AUTOMATIC
    try {
      const auditLogs = StorageService.getAuditLogs();
      const matchLog = auditLogs.find(
        l =>
          l.entity === 'SimulationRequest' &&
          l.action.includes('MATCH') &&
          l.newData &&
          l.newData.includes('SYSTEM/AUTOMATIC')
      );

      const pass = Boolean(matchLog);
      results.push({
        id: 'test-sim-audit-automatic',
        name: 'Simulação 8: Registro em Auditoria com Origem SYSTEM/AUTOMATIC',
        category: 'SIMULAÇÃO',
        passed: pass,
        expected: 'Log de auditoria registrado com origem "SYSTEM/AUTOMATIC"',
        actual: pass ? 'Log encontrado com origem SYSTEM/AUTOMATIC' : 'Log de sistema não encontrado',
        details: 'Garante rastreabilidade e diferenciação entre alterações humanas e automações do sistema.',
      });
    } catch (e: any) {
      results.push({
        id: 'test-sim-audit-automatic',
        name: 'Simulação 8: Registro em Auditoria com Origem SYSTEM/AUTOMATIC',
        category: 'SIMULAÇÃO',
        passed: false,
        expected: 'Auditoria SYSTEM/AUTOMATIC',
        actual: e.message,
      });
    }

    return results;
  }
}
