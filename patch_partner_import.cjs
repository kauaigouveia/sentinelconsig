const fs = require('fs');
let content = fs.readFileSync('src/components/admin/PartnerImportModal.tsx', 'utf8');

content = content.replace(
  `const extractedCode = extractPartnerCode(login);`,
  `const extractedCode = login;`
);

fs.writeFileSync('src/components/admin/PartnerImportModal.tsx', content);
