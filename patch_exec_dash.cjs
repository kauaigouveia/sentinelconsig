const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/ExecutiveDashboard.tsx', 'utf8');

content = content.replace(
  `code: extractPartnerCode(pt.login),`,
  `code: pt.login,`
);

fs.writeFileSync('src/components/dashboard/ExecutiveDashboard.tsx', content);
