const fs = require('fs');
let content = fs.readFileSync('src/services/testRunnerService.ts', 'utf8');

const oldTest1 = `    // TEST 1: extractPartnerCode()
    try {
      const t1 = extractPartnerCode('KAUAI@16740');
      const t2 = extractPartnerCode('FOX@16715');
      const t3 = extractPartnerCode('FRANCO@16690');
      const passed = t1 === '16740' && t2 === '16715' && t3 === '16690';
      
      results.push({
        id: 'T1',
        name: 'Extração do Código do Parceiro (extractPartnerCode)',
        status: passed ? 'PASSED' : 'FAILED',
        message: passed ? 'Regra de corte no último @ validada com sucesso.' : 'Falha ao separar código no @.',
        details: \`KAUAI@16740 -> \${t1}\\nFOX@16715 -> \${t2}\\nFRANCO@16690 -> \${t3}\`
      });
    } catch (err: any) {
      results.push({
        id: 'T1',
        name: 'Extração do Código do Parceiro (extractPartnerCode)',
        status: 'ERROR',
        message: 'Erro na execução do teste.',
        details: err.message
      });
    }`;

const newTest1 = `    // TEST 1: Preservação do Código do Parceiro
    try {
      const t1 = extractPartnerCode('KAUAI@16740');
      const t2 = extractPartnerCode('AL15963');
      const t3 = extractPartnerCode('00123');
      const passed = t1 === 'KAUAI@16740' && t2 === 'AL15963' && t3 === '00123';
      
      results.push({
        id: 'T1',
        name: 'Preservação do Identificador do Parceiro',
        status: passed ? 'PASSED' : 'FAILED',
        message: passed ? 'Identificadores preservados intactos.' : 'O sistema alterou os identificadores indevidamente.',
        details: \`KAUAI@16740 -> \${t1}\\nAL15963 -> \${t2}\\n00123 -> \${t3}\`
      });
    } catch (err: any) {
      results.push({
        id: 'T1',
        name: 'Preservação do Identificador do Parceiro',
        status: 'ERROR',
        message: 'Erro na execução do teste.',
        details: err.message
      });
    }`;

content = content.replace(oldTest1, newTest1);

content = content.replace(
  `// TEST 9: Exportação com Código do Parceiro (extractPartnerCode)`,
  `// TEST 9: Exportação com Código do Parceiro (Mantido)`
);

content = content.replace(
  `const code = partner ? extractPartnerCode(partner.login) : '';`,
  `const code = partner?.login || '';`
);

content = content.replace(
  `message: code === '16740' ? 'Código 16740 extraído e exportado corretamente.' : 'A exportação não isolou o código numérico.',`,
  `message: code === 'KAUAI@16740' ? 'Código original exportado corretamente.' : 'A exportação alterou o código do parceiro.',`
);

fs.writeFileSync('src/services/testRunnerService.ts', content);
