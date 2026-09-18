const fs = require('fs');
let content = fs.readFileSync('src/components/admin/PartnerManagement.tsx', 'utf8');

const searchStr1 = `    if (!login.trim()) {
      setErrorMsg('Informe o login do parceiro no formato NOME@CODIGO (ex: KAUAI@16740).');
      return;
    }

    if (!login.includes('@')) {
      setErrorMsg('O login do parceiro DEVE seguir o padrão NOME@CODIGO (ex: FOX@16715).');
      return;
    }`;

const replaceStr1 = `    if (!login.trim()) {
      setErrorMsg('Informe o login institucional / código do parceiro.');
      return;
    }`;

content = content.replace(searchStr1, replaceStr1);
fs.writeFileSync('src/components/admin/PartnerManagement.tsx', content);
