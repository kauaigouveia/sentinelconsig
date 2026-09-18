const fs = require('fs');
let content = fs.readFileSync('src/services/excelService.ts', 'utf8');

content = content.replace(
  `extractedCode = extractPartnerCode(found.login);`,
  `extractedCode = found.login;`
);

content = content.replace(
  `const partnerCode = partner ? extractPartnerCode(partner.login) : '';`,
  `const partnerCode = partner?.login || '';`
);

content = content.replace(
  `if (selectedColumns.includes('CODIGO_PARCEIRO')) row['CÓDIGO PARCEIRO'] = partner ? extractPartnerCode(partner.login) : '';`,
  `if (selectedColumns.includes('CODIGO_PARCEIRO')) row['CÓDIGO PARCEIRO'] = partner?.login || '';`
);

content = content.replace(
  `*   "Se parceiro KAUAI@16740, exportar 16740. NUNCA KAUAI@16740. Utilizar extractPartnerCode()."`,
  `*   O parceiro é exportado utilizando seu login institucional completo.`
);

fs.writeFileSync('src/services/excelService.ts', content);
