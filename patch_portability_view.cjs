const fs = require('fs');
let content = fs.readFileSync('src/components/production/PortabilityView.tsx', 'utf8');

content = content.replace(
  `{partner ? extractPartnerCode(partner.login) : ''}`,
  `{partner?.login || ''}`
);

fs.writeFileSync('src/components/production/PortabilityView.tsx', content);
