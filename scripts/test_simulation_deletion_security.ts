import { StorageService } from '../src/services/storageService.ts';
import { User, SimulationRequest } from '../src/types/index.ts';

// Mock localStorage and window for Node execution
if (typeof localStorage === 'undefined') {
  const store = new Map<string, string>();
  (global as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

let dispatchedEvents: string[] = [];
if (typeof window === 'undefined') {
  (global as any).window = {
    dispatchEvent: (event: any) => {
      dispatchedEvents.push(event.type || 'unknown');
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function createTestUser(id: string, role: any, tenantId: string = 'tenant_evolve', name: string = 'Test User'): User {
  return {
    id,
    name,
    email: `${id}@test.com`,
    role,
    active: true,
    tenantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createTestSimulation(
  id: string,
  createdById: string,
  tenantId: string = 'tenant_evolve',
  status: any = 'SIMULAÇÃO ENVIADA'
): SimulationRequest {
  return {
    id,
    cpf: '12345678901',
    partnerId: 'part-test',
    createdById,
    tenantId,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function runSecurityTests() {
  console.log('=== SUÍTE DE TESTES: SEGURANÇA E PERMISSÕES DE EXCLUSÃO DE SIMULAÇÕES ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, details?: string) {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title} ${details ? `-> ${details}` : ''}`);
      failed++;
    }
  }

  // Setup initial mock dataset in StorageService
  const initialSimulations: SimulationRequest[] = [
    createTestSimulation('sim-evolve-1', 'user-digitador-1', 'tenant_evolve', 'SIMULAÇÃO ENVIADA'),
    createTestSimulation('sim-evolve-2', 'user-digitador-1', 'tenant_evolve', 'DIGITADA PELA MESA'),
    createTestSimulation('sim-evolve-3', 'user-gestor-1', 'tenant_evolve', 'SIMULAÇÃO ENVIADA'),
    createTestSimulation('sim-dmais-1', 'user-dmais-digitador', 'tenant_dmais', 'SIMULAÇÃO ENVIADA'),
    createTestSimulation('sim-dmais-2', 'user-dmais-gestor', 'tenant_dmais', 'SIMULAÇÃO ENVIADA'),
  ];

  localStorage.setItem('cg_simulation_requests', JSON.stringify(initialSimulations));
  localStorage.setItem('cg_audit_logs', JSON.stringify([]));
  localStorage.setItem('cg_current_tenant_id', JSON.stringify('tenant_evolve'));

  // Define users
  const platformMaster = createTestUser('user-pm', 'PLATFORM_MASTER', 'tenant_evolve', 'Platform Master');
  const masterEvolve = createTestUser('user-master-1', 'MASTER', 'tenant_evolve', 'Master Evolve');
  const gestorEvolve = createTestUser('user-gestor-1', 'GESTOR', 'tenant_evolve', 'Gestor Evolve');
  const gerenteEvolve = createTestUser('user-gerente-1', 'GERENTE', 'tenant_evolve', 'Gerente Evolve');
  const digitadorEvolve1 = createTestUser('user-digitador-1', 'DIGITADOR', 'tenant_evolve', 'Digitador 1');
  const digitadorEvolve2 = createTestUser('user-digitador-2', 'DIGITADOR', 'tenant_evolve', 'Digitador 2');
  const masterDmais = createTestUser('user-master-dmais', 'MASTER', 'tenant_dmais', 'Master DMais');

  // TEST A: PLATFORM_MASTER exclui uma simulação do próprio contexto → PASS
  StorageService.setActiveUser(platformMaster);
  StorageService.setCurrentTenantId('tenant_evolve');
  const simA = StorageService.getSimulationRequests().find(s => s.id === 'sim-evolve-3')!;
  const canDeleteA = StorageService.canDeleteSimulationRequest(platformMaster, simA);
  assert(canDeleteA === true, 'A. PLATFORM_MASTER pode excluir simulação do contexto ativo');

  // TEST B: PLATFORM_MASTER exclui múltiplas simulações → PASS
  const bulkResB = StorageService.bulkDeleteSimulationRequests(['sim-evolve-3'], 'Teste B PLATFORM_MASTER');
  assert(bulkResB.successCount === 1 && bulkResB.errors.length === 0, 'B. PLATFORM_MASTER exclui múltiplas simulações');

  // TEST C: MASTER exclui simulação do próprio tenant → PASS
  StorageService.setActiveUser(masterEvolve);
  const simC = StorageService.getSimulationRequests().find(s => s.id === 'sim-evolve-1')!;
  const canDeleteC = StorageService.canDeleteSimulationRequest(masterEvolve, simC);
  assert(canDeleteC === true, 'C. MASTER pode excluir simulação do próprio tenant');

  // TEST D: GESTOR exclui conforme regra atual → PASS
  const canDeleteD = StorageService.canDeleteSimulationRequest(gestorEvolve, simC);
  assert(canDeleteD === true, 'D. GESTOR pode excluir simulação do próprio tenant');

  // TEST E: GERENTE exclui conforme regra atual → PASS
  const canDeleteE = StorageService.canDeleteSimulationRequest(gerenteEvolve, simC);
  assert(canDeleteE === true, 'E. GERENTE pode excluir simulação do próprio tenant');

  // TEST F: DIGITADOR tenta excluir simulação de outro usuário → BLOQUEADO
  const canDeleteF = StorageService.canDeleteSimulationRequest(digitadorEvolve2, simC); // simC criado por digitador 1
  assert(canDeleteF === false, 'F. DIGITADOR tentando excluir simulação de outro usuário é BLOQUEADO');

  // DIGITADOR tentando excluir simulação com status DIGITADA PELA MESA -> BLOQUEADO
  const simDigitada = StorageService.getSimulationRequests().find(s => s.id === 'sim-evolve-2')!;
  const canDeleteF2 = StorageService.canDeleteSimulationRequest(digitadorEvolve1, simDigitada);
  assert(canDeleteF2 === false, 'F2. DIGITADOR tentando excluir simulação já DIGITADA PELA MESA é BLOQUEADO');

  // TEST G: usuário de Tenant A tenta excluir simulação do Tenant B → BLOQUEADO
  const simDmais = StorageService.getSimulationRequests().find(s => s.id === 'sim-dmais-1')!;
  const canDeleteG = StorageService.canDeleteSimulationRequest(masterEvolve, simDmais);
  assert(canDeleteG === false, 'G. Usuário de Tenant A tentando excluir simulação do Tenant B é BLOQUEADO');

  // TEST H: usuário sem permissão tenta exclusão em massa → BLOQUEADO
  StorageService.setActiveUser(digitadorEvolve2);
  const bulkResH = StorageService.bulkDeleteSimulationRequests(['sim-evolve-1', 'sim-dmais-1'], 'Tentativa não autorizada');
  assert(bulkResH.successCount === 0 && bulkResH.errors.length === 2, 'H. Usuário sem permissão para exclusão em massa é BLOQUEADO');

  // TEST I: exclusão individual remove o registro → PASS
  StorageService.setActiveUser(masterEvolve);
  const countBeforeI = StorageService.getSimulationRequests().length;
  StorageService.deleteSimulationRequest('sim-evolve-1', 'Exclusão individual teste I');
  const countAfterI = StorageService.getSimulationRequests().length;
  const simExistsI = StorageService.getSimulationRequests().some(s => s.id === 'sim-evolve-1');
  assert(countAfterI === countBeforeI - 1 && !simExistsI, 'I. Exclusão individual remove o registro com sucesso');

  // TEST J: exclusão em massa remove somente registros autorizados → PASS
  StorageService.setActiveUser(masterDmais);
  StorageService.setCurrentTenantId('tenant_dmais');
  // Attempt to delete sim-dmais-1 (authorized) and sim-evolve-2 (unauthorized for masterDmais)
  const bulkResJ = StorageService.bulkDeleteSimulationRequests(['sim-dmais-1', 'sim-evolve-2'], 'Exclusão em massa teste J');
  assert(bulkResJ.successCount === 1 && bulkResJ.errors.length === 1, 'J. Exclusão em massa remove somente registros autorizados');

  // TEST K: registro não autorizado permanece intacto → PASS
  const simIntactK = StorageService.getSimulationRequests().some(s => s.id === 'sim-evolve-2');
  assert(simIntactK === true, 'K. Registro não autorizado permanece intacto no armazenamento');

  // TEST L: Auditoria gerada corretamente → PASS
  const auditLogs = StorageService.getAuditLogs();
  const deleteAudits = auditLogs.filter(a => a.action === 'EXCLUIR_SOLICITACAO_SIMULACAO' || a.action === 'EXCLUSAO_EM_MASSA_SIMULACAO');
  assert(deleteAudits.length >= 2, 'L. Auditoria gerada corretamente com registros de exclusão', `Audit count: ${deleteAudits.length}`);

  // TEST M: registro excluído não reaparece após refresh (re-leitura de storage) → PASS
  const freshListM = StorageService.getSimulationRequests();
  assert(!freshListM.some(s => s.id === 'sim-evolve-1') && !freshListM.some(s => s.id === 'sim-dmais-1'), 'M. Registros excluídos não reaparecem no armazenamento');

  // TEST N: registro excluído dispara evento de atualização (realtime notification) → PASS
  const eventDispatchedN = dispatchedEvents.includes('credit_gestao_storage_update');
  assert(eventDispatchedN === true, 'N. Listener e dispatch de eventos disparados corretamente na exclusão');

  // TEST O: chamada direta sem permissão via método do serviço → BLOQUEADA (THROWS EXCEPTION)
  StorageService.setActiveUser(digitadorEvolve2);
  let directCallBlocked = false;
  try {
    StorageService.deleteSimulationRequest('sim-evolve-2', 'Chamada direta sem autorização');
  } catch (err: any) {
    if (err.message.includes('não possui permissão')) {
      directCallBlocked = true;
    }
  }
  assert(directCallBlocked === true, 'O. Chamada direta ao método de exclusão sem permissão é BLOQUEADA com exceção');

  // TEST P: manipulação de objeto de usuário em runtime não altera tenant da simulação → BLOQUEADA
  const fakeUserManipulated = { ...digitadorEvolve2, role: 'MASTER' as any, tenantId: 'tenant_evolve' };
  // Tentativa de excluir simulação do tenant DMais usando papel forjado localmente em tenant diferente
  const canDeleteP = StorageService.canDeleteSimulationRequest(fakeUserManipulated, simDmais);
  assert(canDeleteP === false, 'P. Manipulação de objeto do usuário para acesso cross-tenant é BLOQUEADA');

  // TEST Q: AuditLog gerado com tenant, motivo, timestamp, CPF mascarado e sem CPF bruto em newData
  StorageService.setActiveUser(masterEvolve);
  StorageService.setCurrentTenantId('tenant_evolve');
  const simForQ = createTestSimulation('sim-q-1', 'user-digitador-1', 'tenant_evolve', 'SIMULAÇÃO ENVIADA');
  const currentRequests = StorageService.getSimulationRequests();
  currentRequests.unshift(simForQ);
  localStorage.setItem('cg_simulation_requests', JSON.stringify(currentRequests));

  StorageService.deleteSimulationRequest('sim-q-1', 'Exclusão para teste de auditoria Q');

  const auditLogsQ = StorageService.getAuditLogs().filter(a => a.action === 'EXCLUIR_SOLICITACAO_SIMULACAO');
  const lastDeleteAudit = auditLogsQ[auditLogsQ.filter(a => a.action === 'EXCLUIR_SOLICITACAO_SIMULACAO').length - 1];
  let auditValid = false;
  if (lastDeleteAudit && lastDeleteAudit.newData) {
    const parsedData = JSON.parse(lastDeleteAudit.newData);
    auditValid =
      typeof parsedData.deletedBy === 'string' &&
      typeof parsedData.userRole === 'string' &&
      typeof parsedData.tenantId === 'string' &&
      typeof parsedData.reason === 'string' &&
      typeof parsedData.deletedAt === 'string' &&
      typeof parsedData.cpfMasked === 'string' &&
      !lastDeleteAudit.newData.includes('12345678901'); // Confirma que CPF bruto não está exposto em newData
  }
  assert(auditValid === true, 'Q. AuditLog gerado com todos os metadados (tenant, CPF mascarado, motivo, timestamp) sem expor CPF bruto em newData');

  console.log(`\n==================================================`);
  console.log(`RESULTADO DA SUÍTE: ${passed} PASS, ${failed} FAIL`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSecurityTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
