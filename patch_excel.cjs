const fs = require('fs');
let content = fs.readFileSync('src/services/excelService.ts', 'utf8');

// Patch exportStandard
content = content.replace(
  `const partnerCode = partner?.login || '';`,
  `const partnerCode = partner?.login ? extractPartnerCode(partner.login) : '';`
);

// Patch exportCustom
content = content.replace(
  `if (selectedColumns.includes('CODIGO_PARCEIRO')) row['CÓDIGO PARCEIRO'] = partner?.login || '';`,
  `if (selectedColumns.includes('CODIGO_PARCEIRO')) row['CÓDIGO PARCEIRO'] = partner?.login ? extractPartnerCode(partner.login) : '';`
);

fs.writeFileSync('src/services/excelService.ts', content);
