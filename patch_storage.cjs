const fs = require('fs');
let content = fs.readFileSync('src/services/storageService.ts', 'utf8');

content = content.replace(
  `requiresPortabilityRelation: false,`,
  `requiresPortabilityRelation: pr.type === 'PORTABILIDADE' && pr.name.includes('REFIN'),`
);

fs.writeFileSync('src/services/storageService.ts', content);
