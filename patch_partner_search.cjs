const fs = require('fs');
let content = fs.readFileSync('src/components/common/PartnerSearchSelect.tsx', 'utf8');

const oldExtractCode = `  const extractCode = (partnerObj?: any) => {
    if (!partnerObj) return 'S/C';
    const login = String(partnerObj.login ?? '');
    const code = String(partnerObj.code ?? '');
    if (code) return code;
    return login || 'S/C';
  };`;

const newExtractCode = `  const extractCode = (partnerObj?: any) => {
    if (!partnerObj) return 'S/C';
    const login = String(partnerObj.login ?? '');
    const code = String(partnerObj.code ?? '');
    return login || code || 'S/C';
  };`;

content = content.replace(oldExtractCode, newExtractCode);
fs.writeFileSync('src/components/common/PartnerSearchSelect.tsx', content);
