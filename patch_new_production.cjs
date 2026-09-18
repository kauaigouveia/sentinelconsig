const fs = require('fs');
let content = fs.readFileSync('src/components/production/NewProductionModal.tsx', 'utf8');

const searchStr = `  const currentPartnerCode = currentPartner ? extractPartnerCode(currentPartner.login) : '';`;
const replaceStr = `  const currentPartnerCode = currentPartner ? currentPartner.login : '';`;
content = content.replace(searchStr, replaceStr);

const searchStr2 = `              {currentPartner && (
                <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400 mt-1 block">
                  Código derivado: <strong>{currentPartnerCode}</strong> (Login: {currentPartner.login})
                </span>
              )}`;
const replaceStr2 = `              {currentPartner && (
                <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400 mt-1 block">
                  Identificador Institucional selecionado: <strong>{currentPartnerCode}</strong>
                </span>
              )}`;
content = content.replace(searchStr2, replaceStr2);

fs.writeFileSync('src/components/production/NewProductionModal.tsx', content);
