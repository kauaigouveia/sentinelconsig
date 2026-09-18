const fs = require('fs');
let content = fs.readFileSync('src/components/bi/CommercialRadarView.tsx', 'utf8');

content = content.replace(
  `const code = extractPartnerCode(pt.login);`,
  `const code = pt.login;`
);

fs.writeFileSync('src/components/bi/CommercialRadarView.tsx', content);
