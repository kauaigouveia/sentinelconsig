const fs = require('fs');
let content = fs.readFileSync('src/components/production/KanbanBoard.tsx', 'utf8');

content = content.replace(
  `const partnerCode = partner ? extractPartnerCode(partner.login) : '';`,
  `const partnerCode = partner?.login || '';`
);

content = content.replace(
  `Cód: {partner ? extractPartnerCode(partner.login) : ''}`,
  `Identificador: {partner?.login || ''}`
);

fs.writeFileSync('src/components/production/KanbanBoard.tsx', content);
