const fs = require('fs');
let content = fs.readFileSync('src/components/support/SupportCenter.tsx', 'utf8');

content = content.replace(
  `Parceiro: <strong>{partner?.login}</strong> (Cód: {partner ? extractPartnerCode(partner.login) : ''})`,
  `Parceiro: <strong>{partner?.login}</strong>`
);

fs.writeFileSync('src/components/support/SupportCenter.tsx', content);
