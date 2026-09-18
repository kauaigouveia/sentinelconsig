const fs = require('fs');
let content = fs.readFileSync('src/components/admin/PartnerManagement.tsx', 'utf8');

const searchStr4 = `      setSuccessMsg(\`Parceiro \${data.login || login} cadastrado com sucesso! Código extraído: \${extractPartnerCode(data.login || login)}\`);`;
const replaceStr4 = `      setSuccessMsg(\`Parceiro \${data.login || login} cadastrado com sucesso!\`);`;
content = content.replace(searchStr4, replaceStr4);

fs.writeFileSync('src/components/admin/PartnerManagement.tsx', content);
