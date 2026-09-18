const fs = require('fs');
let content = fs.readFileSync('src/components/simulation/SimulationView.tsx', 'utf8');

content = content.replace(
  `const code = extractPartnerCode(loginStr).toLowerCase();`,
  `const code = loginStr.trim().toLowerCase();`
);

fs.writeFileSync('src/components/simulation/SimulationView.tsx', content);
