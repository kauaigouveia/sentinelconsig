const fs = require('fs');
let content = fs.readFileSync('src/components/production/ProposalDetailModal.tsx', 'utf8');

content = content.replace(
  `{partner?.login || '—'} ({partner ? extractPartnerCode(partner.login) : ''})`,
  `{partner?.login || '—'}`
);

content = content.replace(
  `Banco: {bk?.name} | Parceiro: {pt?.login} ({pt ? extractPartnerCode(pt.login) : ''})`,
  `Banco: {bk?.name} | Parceiro: {pt?.login}`
);

fs.writeFileSync('src/components/production/ProposalDetailModal.tsx', content);
