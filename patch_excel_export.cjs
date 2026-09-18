const fs = require('fs');
let content = fs.readFileSync('src/components/production/ExcelExportModal.tsx', 'utf8');

content = content.replace(
  `<li>O código do parceiro é isolado automaticamente pelo algoritmo <code>extractPartnerCode()</code> (ex: <em>KAUAI@16740</em> resulta estritamente em <strong>16740</strong>).</li>`,
  `<li>O código do parceiro reflete exatamente o login/identificador cadastrado no sistema (ex: <em>KAUAI@16740</em>, <em>AL15963</em>, <em>16740</em>).</li>`
);

fs.writeFileSync('src/components/production/ExcelExportModal.tsx', content);
