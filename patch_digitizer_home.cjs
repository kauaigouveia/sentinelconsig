const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/DigitizerHome.tsx', 'utf8');

content = content.replace(
  `{partner?.login ? extractPartnerCode(partner.login) : '—'}`,
  `{partner?.login || '—'}`
);

fs.writeFileSync('src/components/dashboard/DigitizerHome.tsx', content);
