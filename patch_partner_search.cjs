const fs = require('fs');
let content = fs.readFileSync('src/components/common/PartnerSearchSelect.tsx', 'utf8');

const oldExtract = `  const extractCode = (partnerObj?: any) => {
    if (!partnerObj) return 'S/C';
    const login = String(partnerObj.login ?? '');
    const code = String(partnerObj.code ?? '');
    if (code) return code;
    const parts = login.split('@');
    return parts[1] || parts[0] || 'S/C';
  };`;

const newExtract = `  const extractCode = (partnerObj?: any) => {
    if (!partnerObj) return 'S/C';
    const login = String(partnerObj.login ?? '');
    const code = String(partnerObj.code ?? '');
    if (code) return code;
    return login || 'S/C';
  };`;

content = content.replace(oldExtract, newExtract);
fs.writeFileSync('src/components/common/PartnerSearchSelect.tsx', content);
