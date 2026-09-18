const fs = require('fs');
let content = fs.readFileSync('src/components/simulation/SimulationImportModal.tsx', 'utf8');

content = content.replace(
  `const pCode = String(extractPartnerCode(p.login ?? '')).toUpperCase();`,
  `const pCode = String(p.login ?? '').trim().toUpperCase();`
);

fs.writeFileSync('src/components/simulation/SimulationImportModal.tsx', content);
